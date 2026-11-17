from __future__ import annotations
import hashlib, json, sys, unittest
from copy import deepcopy
from pathlib import Path

SYN="SYNTHETIC_TEST_ONLY"
VALUE_STATES={"VALID","PROVISIONAL","ZERO_CONFIRMED","UNKNOWN","SEARCH_NOT_STARTED","SEARCH_PARTIAL","SOURCE_UNAVAILABLE","NOT_FOUND_AFTER_SUFFICIENT_SEARCH","CONFLICT","NOT_APPLICABLE","SUPERSEDED"}
CWR={"YES","NO_CONFIRMED","UNKNOWN","CONFLICT"}
CV={"ALL","EXCLUDE_CONFIRMED_CWR","ONLY_CONFIRMED_CWR"}
PV={"ALL","EXCLUDE_HIGH_PROTECTION","EXCLUDE_ANY_CONFIRMED_PROTECTION","ONLY_NO_PROTECTION_CONFIRMED"}
PARAMS={"parameter_scope":SYN,"q_l":.25,"q_h":.75,"gamma_l":1.0,"gamma_h":1.0,"alpha":.5,"scientific_weights":"UNSET","u_weights":"UNSET","i_weights":"UNSET","n_ref":"UNSET","cwr_weight":"UNSET"}

class ContractError(ValueError): pass

def hjson(x): return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def validate_manifest(m,u):
    req={"run_id","model_version","universe_release_id","universe_version","universe_hash","evidence_snapshot_id","run_cutoff_date","parameter_set_id","synthetic_test_only"}
    if req-m.keys(): raise ContractError(f"missing {sorted(req-m.keys())}")
    if m["synthetic_test_only"] is not True or SYN not in m["parameter_set_id"]: raise ContractError("not synthetic")
    if m["universe_hash"]!=hjson(u): raise ContractError("hash mismatch")
    keys=[r.get("taxon_key") for r in u]
    if any(not x for x in keys) or len(keys)!=len(set(keys)): raise ContractError("invalid/duplicate TAXON_KEY")
    if any(not r.get("scientific_name") or not r.get("rank") for r in u): raise ContractError("missing universe identity fields")

def validate_value(v,state,reason=None):
    if state not in VALUE_STATES: raise ContractError("bad VALUE_STATE")
    if v is None and state in {"VALID","ZERO_CONFIRMED"}: raise ContractError("null valid")
    if v is None and state in {"UNKNOWN","SEARCH_NOT_STARTED","SEARCH_PARTIAL","SOURCE_UNAVAILABLE","CONFLICT"} and not reason: raise ContractError("null needs reason")
    if v==0 and state not in {"ZERO_CONFIRMED","VALID"}: raise ContractError("invalid zero")

def validate_valuations(rows,m):
    req={"run_id","model_version","universe_release_id","universe_version","universe_hash","taxon_key","scientific_name","rank","identity_state","evidence_snapshot_id","run_cutoff_date","u_value","u_state","i_value","i_state","method_versions"}; seen=set()
    for r in rows:
        if req-r.keys(): raise ContractError("valuation missing fields")
        k=(r["run_id"],r["taxon_key"])
        if k in seen: raise ContractError("duplicate valuation key")
        seen.add(k)
        for f in ("run_id","model_version","universe_release_id","universe_version","universe_hash","evidence_snapshot_id","run_cutoff_date"):
            if r[f]!=m[f]: raise ContractError(f"version mismatch {f}")
        validate_value(r["u_value"],r["u_state"],r.get("u_pending_reason_code")); validate_value(r["i_value"],r["i_state"],r.get("i_pending_reason_code"))
        if not r["method_versions"]: raise ContractError("METHOD_VERSIONS empty")

def protection(categories,complete,identity=True,conflict=False,source_unavailable=False):
    c=set(categories)
    if source_unavailable:return("SOURCE_UNAVAILABLE","UNKNOWN")
    if conflict:return("CONFLICT","CONFLICT")
    if not identity:return("UNKNOWN","UNKNOWN")
    if c&{"ENDANGERED","ENDANGERED_CRITICAL","VULNERABLE"}:return("PROTECTED_CONFIRMED","HIGH_EXCLUSION")
    if c&{"SPECIAL_PROTECTION_ONLY","LESRPE_ONLY","DIRECTIVE_OR_CONVENTION_PROTECTION"}:return("PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION")
    if complete and not c:return("NO_PROTECTION_CONFIRMED","NO_PROTECTION_CONFIRMED")
    return("UNKNOWN","UNKNOWN")

def pvisible(pres,cls,view):
    if view not in PV: raise ContractError("bad protection view")
    return True if view=="ALL" else cls!="HIGH_EXCLUSION" if view=="EXCLUDE_HIGH_PROTECTION" else pres!="PROTECTED_CONFIRMED" if view=="EXCLUDE_ANY_CONFIRMED_PROTECTION" else pres=="NO_PROTECTION_CONFIRMED"

def cwr_state(rel,complete):
    s=[r["cwr_state"] for r in rel]
    if any(x not in CWR for x in s): raise ContractError("bad CWR_STATE")
    if "YES" in s:return"YES"
    if "CONFLICT" in s:return"CONFLICT"
    if "UNKNOWN" in s or not complete:return"UNKNOWN"
    return"NO_CONFIRMED"

def cvisible(s,view):
    if view not in CV: raise ContractError("bad CWR view")
    return True if view=="ALL" else s!="YES" if view=="EXCLUDE_CONFIRMED_CWR" else s=="YES"

def profile(row,cview,pview):
    u,i=deepcopy(row.get("u")),deepcopy(row.get("i")); out=deepcopy(row); out["included"]=cvisible(row["cwr"],cview) and pvisible(row["pres"],row["pclass"],pview)
    assert out.get("u")==u and out.get("i")==i
    return out

def midrank(vals):
    if not vals:return[]
    order=sorted(enumerate(vals),key=lambda x:x[1]); out=[0.]*len(vals); n=len(vals); i=0
    while i<n:
        j=i+1
        while j<n and order[j][1]==order[i][1]:j+=1
        mr=((i+1)+j)/2; p=(mr-.5)/n
        for k in range(i,j):out[order[k][0]]=p
        i=j
    return out

def lowhigh(p,q_l,q_h,g_l,g_h):
    if not 0<q_l<q_h<1 or g_l<=0 or g_h<=0: raise ContractError("bad research params")
    return 100*max(0,(q_l-p)/q_l)**g_l,100*max(0,(p-q_h)/(1-q_h))**g_h

def research(records,params=PARAMS):
    if params["parameter_scope"]!=SYN:raise ContractError("research params not synthetic")
    pos=[i for i,r in enumerate(records) if r.get("member")=="YES" and r.get("eligibility")=="PASS"]; vals=[float(records[i]["R"]) for i in pos]; deg=bool(vals) and len(set(vals))==1; pp=midrank(vals) if not deg else [None]*len(vals); mp=dict(zip(pos,pp)); out=[]
    for i,r0 in enumerate(records):
        r=dict(r0)
        if i not in mp:r.update(percentile=None,low=None,high=None,low_reason="UNKNOWN_INSUFFICIENT_SEARCH",distribution="DEGENERATE" if deg else "VALID")
        elif deg:r.update(percentile=None,low=None,high=None,low_reason="UNSET_DEGENERATE_REFERENCE",distribution="DEGENERATE")
        else:
            lo,hi=lowhigh(mp[i],params["q_l"],params["q_h"],params["gamma_l"],params["gamma_h"]); r.update(percentile=mp[i],low=lo,high=hi,low_reason="EVALUATED",distribution="VALID")
        out.append(r)
    return out

def research_scenario(low,high,mode,alpha=None):
    if low is None or high is None:return{"mode":mode,"value":None,"state":"UNSET_INPUT_COMPONENT"}
    if mode=="SEPARATE":return{"mode":mode,"value":None,"low":low,"high":high,"state":"VECTOR_ONLY"}
    if mode=="MAX":return{"mode":mode,"value":max(low,high),"state":SYN}
    if mode=="WEIGHTED" and alpha is not None and 0<=alpha<=1:return{"mode":mode,"value":alpha*low+(1-alpha)*high,"state":SYN}
    raise ContractError("bad research scenario")

def cwr_scenario(mode,u,i):
    if mode not in {"CWR_OFF","CWR_ON_RELATION_ONLY","CWR_ON_APPLIED_ONLY","CWR_ON_COMBINED","CWR_OVERLAY_ONLY"}:raise ContractError("bad CWR scenario")
    return{"mode":mode,"u_before":u,"i_before":i,"u_after":u,"i_after":i,"numeric_cwr_component":"UNSET","cwr_weight":"UNSET","state":SYN}

def readiness(confs):
    s=[c.get("blocks_submission") for c in confs]
    return"HOLD_CONFIRMATION" if "YES" in s else"UNKNOWN_REQUIREMENT" if "UNKNOWN" in s else"READY"

def data_state(complete,confs):return"APPLICATION_DATA_INCOMPLETE" if not complete else"DATA_READY_WITH_OPEN_CONFIRMATIONS" if confs else"APPLICATION_DATA_READY"
def collection_go(auth,gates=None):
    req={"identity","presence","population","maturity","sustainability","technical_limits"}
    return auth=="AUTHORIZED_WITH_SCOPE" and bool(gates) and req<=set(gates) and all(gates[k] for k in req)
def boundary_tie(values,cap):
    if cap<=0 or cap>=len(values):return False
    s=sorted(values,reverse=True); return s[cap-1]==s[cap]
def exsitu(acc):
    prim=[a for a in acc if a.get("valid",True) and not a.get("backup_of")]; origins={a["origin"] for a in prim if a.get("origin")}; return{"A_b":len(prim),"O_b":len(origins),"UO_b":sum(not a.get("origin") for a in prim)}
def desktop(case):
    req={"taxon_key","scientific_name","rank","proposed_action","material_type","documented_spatial_scope_id","spatial_evidence_state","preferred_window","phenology_basis","purpose","destination","responsible_persons"}; miss=sorted(k for k in req if not case.get(k)); return{"ready":not miss,"missing":miss,"field_protocols_required":False,"spatial_state":case.get("spatial_evidence_state")}

FIXTURES=[
("F01","filter",dict(cats=[],pc=True,rel=["NO_CONFIRMED"],cc=True,u=61,i=42),dict(cwr="NO_CONFIRMED",pres="NO_PROTECTION_CONFIRMED",pclass="NO_PROTECTION_CONFIRMED",simple=True)),
("F02","filter",dict(cats=["ENDANGERED"],pc=True,rel=["NO_CONFIRMED"],cc=True,u=88,i=33),dict(pres="PROTECTED_CONFIRMED",pclass="HIGH_EXCLUSION",base=True,high=False,simple=False)),
("F03","filter",dict(cats=["SPECIAL_PROTECTION_ONLY"],pc=True,rel=["NO_CONFIRMED"],cc=True,u=70,i=50),dict(pres="PROTECTED_CONFIRMED",pclass="PROTECTED_NON_EXCLUSION",high=True,only_no=False)),
("F04","filter",dict(cats=[],pc=False,rel=["NO_CONFIRMED"],cc=True,u=55,i=29),dict(pres="UNKNOWN",pclass="UNKNOWN",base=True,high=True,simple=False)),
("F05","filter",dict(cats=[],pc=True,rel=["YES"],cc=True,u=44,i=71),dict(cwr="YES",no_cwr=False,simple=False)),
("F06","filter",dict(cats=[],pc=True,rel=["UNKNOWN"],cc=False,u=39,i=47),dict(cwr="UNKNOWN",no_cwr=True,simple=True)),
("F07","cwr",dict(rel=["NO_CONFIRMED","YES","UNKNOWN"],cc=False),dict(cwr="YES",rows=3,numeric="UNSET")),
("F08","cwr",dict(rel=["NO_CONFIRMED","CONFLICT"],cc=True),dict(cwr="CONFLICT")),
("F09","research",dict(records=[dict(k="F09",R=1,member="NO",eligibility="SEARCH_PARTIAL")]),dict(k="F09",percentile=None,low=None,low_reason="UNKNOWN_INSUFFICIENT_SEARCH")),
("F10","research",dict(records=[dict(k="A",R=1,member="YES",eligibility="PASS"),dict(k="B",R=10,member="YES",eligibility="PASS"),dict(k="C",R=20,member="YES",eligibility="PASS"),dict(k="D",R=30,member="YES",eligibility="PASS")]),dict(k="A",low_nonnull=True,distribution="VALID")),
("F11","research",dict(records=[dict(k="A",R=5,member="YES",eligibility="PASS"),dict(k="B",R=5,member="YES",eligibility="PASS"),dict(k="C",R=5,member="YES",eligibility="PASS")]),dict(all_degenerate=True,all_null=True)),
("F12","tie",dict(values=[90,80,80,60],cap=2),dict(tie=True,human=True)),
("F13","application",dict(complete=True,confs=[{"blocks_submission":"NO"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="READY",preserved=1)),
("F14","application",dict(complete=True,confs=[{"blocks_submission":"YES"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="HOLD_CONFIRMATION")),
("F15","go",dict(auth="AUTHORIZED_WITH_SCOPE",gates=None),dict(collection_go=False)),
("F16","application",dict(complete=True,confs=[{"blocks_submission":"YES"},{"blocks_submission":"UNKNOWN"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="HOLD_CONFIRMATION",preserved=2)),
("F17","research",dict(records=[dict(k="A",R=5,member="YES",eligibility="PASS"),dict(k="B",R=5,member="NO",eligibility="SEARCH_PARTIAL"),dict(k="C",R=20,member="YES",eligibility="PASS")]),dict(pass_nonnull=True,b_null=True))]

def run_fixture(f):
    fid,t,x,e=f
    if t in {"filter","cwr"}:
        rel=[{"cwr_state":s} for s in x["rel"]]; cs=cwr_state(rel,x["cc"]); out={"cwr":cs}
        if t=="cwr":return out|{"rows":len(rel),"numeric":"UNSET"}
        pres,pc=protection(x["cats"],x["pc"]); row={"cwr":cs,"pres":pres,"pclass":pc,"u":x["u"],"i":x["i"]}; return out|{"pres":pres,"pclass":pc,"base":profile(row,"ALL","ALL")["included"],"high":profile(row,"ALL","EXCLUDE_HIGH_PROTECTION")["included"],"only_no":profile(row,"ALL","ONLY_NO_PROTECTION_CONFIRMED")["included"],"no_cwr":profile(row,"EXCLUDE_CONFIRMED_CWR","ALL")["included"],"simple":profile(row,"EXCLUDE_CONFIRMED_CWR","ONLY_NO_PROTECTION_CONFIRMED")["included"],"u":x["u"],"i":x["i"]}
    if t=="research":return {r["k"]:r for r in research(x["records"])}
    if t=="tie":
        z=boundary_tie(x["values"],x["cap"]);return{"tie":z,"human":z}
    if t=="application":return{"data":data_state(x["complete"],x["confs"]),"submission":readiness(x["confs"]),"preserved":len(x["confs"])}
    if t=="go":return{"collection_go":collection_go(x["auth"],x["gates"])}
    raise AssertionError(t)

def fixture_ok(f,a):
    fid,t,x,e=f
    if t=="research":
        if fid=="F10":return a["A"]["low"] is not None and a["A"]["distribution"]=="VALID"
        if fid=="F11":return all(v["distribution"]=="DEGENERATE" and v["low"] is None and v["high"] is None for v in a.values())
        if fid=="F17":return a["A"]["percentile"] is not None and a["B"]["percentile"] is None and a["B"]["low"] is None
        r=a[e["k"]];return all(r[k]==v for k,v in e.items() if k!="k")
    return all(a[k]==v for k,v in e.items())

class Tests(unittest.TestCase):
    def test_01_manifest_hash_keys(self):
        u=[{"taxon_key":"S1","scientific_name":"Fictitia a","rank":"species"}];m={"run_id":"R","model_version":"M","universe_release_id":"U","universe_version":"v1","universe_hash":hjson(u),"evidence_snapshot_id":"E","run_cutoff_date":"2026-11-17","parameter_set_id":"SYNTHETIC_TEST_ONLY_X","synthetic_test_only":True};validate_manifest(m,u)
        with self.assertRaises(ContractError):validate_manifest(m|{"universe_hash":"x"},u)
    def test_02_duplicate_keys(self):
        u=[{"taxon_key":"S","scientific_name":"a","rank":"species"},{"taxon_key":"S","scientific_name":"b","rank":"species"}];m={"run_id":"R","model_version":"M","universe_release_id":"U","universe_version":"v1","universe_hash":hjson(u),"evidence_snapshot_id":"E","run_cutoff_date":"2026-11-17","parameter_set_id":"SYNTHETIC_TEST_ONLY_X","synthetic_test_only":True}
        with self.assertRaises(ContractError):validate_manifest(m,u)
    def test_03_null_zero(self):
        validate_value(None,"UNKNOWN","NO_DATA");validate_value(0,"ZERO_CONFIRMED")
        with self.assertRaises(ContractError):validate_value(0,"UNKNOWN","NO_DATA")
    def test_04_versions_business_key(self):
        u=[{"taxon_key":"S","scientific_name":"a","rank":"species"}];m={"run_id":"R","model_version":"M","universe_release_id":"U","universe_version":"v1","universe_hash":hjson(u),"evidence_snapshot_id":"E","run_cutoff_date":"2026-11-17","parameter_set_id":"SYNTHETIC_TEST_ONLY_X","synthetic_test_only":True};r=m|{"taxon_key":"S","scientific_name":"a","rank":"species","identity_state":"RESOLVED","u_value":None,"u_state":"UNKNOWN","u_pending_reason_code":"UNSET","i_value":None,"i_state":"UNKNOWN","i_pending_reason_code":"UNSET","method_versions":{"T0":"v0.2"}};validate_valuations([r],m)
        with self.assertRaises(ContractError):validate_valuations([r,r],m)
    def test_05_f01_f17(self):
        self.assertEqual([f[0] for f in FIXTURES],[f"F{i:02d}" for i in range(1,18)])
        for f in FIXTURES:self.assertTrue(fixture_ok(f,run_fixture(f)),f[0])
    def test_06_ui_invariance(self):
        for f in FIXTURES[:6]:
            a=run_fixture(f);self.assertEqual((a["u"],a["i"]),(f[2]["u"],f[2]["i"]))
    def test_07_protection_section17(self):
        self.assertEqual(protection(["ENDANGERED"],True),("PROTECTED_CONFIRMED","HIGH_EXCLUSION"));self.assertEqual(protection(["VULNERABLE"],True),("PROTECTED_CONFIRMED","HIGH_EXCLUSION"));self.assertEqual(protection(["SPECIAL_PROTECTION_ONLY"],True),("PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION"));self.assertEqual(protection([],True),("NO_PROTECTION_CONFIRMED","NO_PROTECTION_CONFIRMED"));self.assertEqual(protection([],False),("UNKNOWN","UNKNOWN"))
    def test_08_cwr_precedence(self):
        self.assertEqual(cwr_state([{"cwr_state":"CONFLICT"},{"cwr_state":"YES"}],False),"YES");self.assertEqual(cwr_state([{"cwr_state":"CONFLICT"},{"cwr_state":"UNKNOWN"}],False),"CONFLICT");self.assertEqual(cwr_state([{"cwr_state":"NO_CONFIRMED"}],False),"UNKNOWN")
    def test_09_f16_precedence(self):self.assertEqual(readiness([{"blocks_submission":"YES"},{"blocks_submission":"UNKNOWN"}]),"HOLD_CONFIRMATION")
    def test_10_scenarios(self):
        self.assertEqual(research_scenario(80,10,"MAX")["value"],80);self.assertAlmostEqual(research_scenario(80,10,"WEIGHTED",.25)["value"],27.5);d=cwr_scenario("CWR_ON_COMBINED",64,51);self.assertEqual((d["u_after"],d["i_after"],d["cwr_weight"]),(64,51,"UNSET"))
    def test_11_exsitu(self):
        self.assertEqual(exsitu([{"origin":"O1"},{"origin":"O1","backup_of":"A1"}]),{"A_b":1,"O_b":1,"UO_b":0});self.assertEqual(exsitu([{"origin":"O2"},{"origin":"O2"}]),{"A_b":2,"O_b":1,"UO_b":0});self.assertEqual(exsitu([{"origin":None}]),{"A_b":1,"O_b":0,"UO_b":1})
    def test_12_desktop_historical_locality(self):
        c={"taxon_key":"S","scientific_name":"Fictitia historica","rank":"species","proposed_action":"SEED_COLLECTION","material_type":"SEED","documented_spatial_scope_id":"H1","spatial_evidence_state":"HISTORICAL_LOCALITY","preferred_window":"M06","phenology_basis":SYN,"purpose":"EX_SITU","destination":"JBLR_SYN","responsible_persons":["SYN"]};a=desktop(c);self.assertTrue(a["ready"]);self.assertFalse(a["field_protocols_required"]);self.assertEqual(a["spatial_state"],"HISTORICAL_LOCALITY")
    def test_13_missing_phenology(self):
        c={"taxon_key":"S","scientific_name":"Fictitia aphena","rank":"species","proposed_action":"SEED_COLLECTION","material_type":"SEED","documented_spatial_scope_id":"H1","spatial_evidence_state":"POTENTIAL_SECTOR","preferred_window":"M06","phenology_basis":None,"purpose":"EX_SITU","destination":"JBLR_SYN","responsible_persons":["SYN"]};self.assertIn("phenology_basis",desktop(c)["missing"])
    def test_14_collection_go(self):
        self.assertFalse(collection_go("AUTHORIZED_WITH_SCOPE"));g={k:True for k in ["identity","presence","population","maturity","sustainability","technical_limits"]};self.assertTrue(collection_go("AUTHORIZED_WITH_SCOPE",g))
    def test_15_open_parameters(self):
        self.assertEqual(PARAMS["parameter_scope"],SYN);self.assertEqual(PARAMS["scientific_weights"],"UNSET");self.assertEqual(PARAMS["n_ref"],"UNSET");self.assertEqual(PARAMS["cwr_weight"],"UNSET")

def run():
    universe=[{"taxon_key":f"SYN-U{i:03d}","scientific_name":f"Fictitia syntheticus {i}","rank":"species"} for i in range(1,18)]
    manifest={"run_id":"MODEL3-T1-SYNTHETIC-20261117-001","model_version":"MODEL3_T1_PROTOTYPE_v1","universe_release_id":"SYNTHETIC_MODEL3_T1_2026-11-17_v1","universe_version":"v1","universe_hash":hjson(universe),"evidence_snapshot_id":"SYNTHETIC_EVIDENCE_MODEL3_T1_v1","run_cutoff_date":"2026-11-17","parameter_set_id":"SYNTHETIC_TEST_ONLY_MODEL3_T1_MECHANICS_v1","synthetic_test_only":True,"scientific_weights":"UNSET","n_ref":"UNSET","corpus_execution":0,"real_case_execution":0,"calibration_execution":0,"event_bus_writes":0,"rc3_mutation":0,"actor_09_activation":0,"protection_mapping_version":"JBLR_PROT_MAP_LR_v0.1_2026-11-17","source_revisions":{"T0":"AHj4eMS6bmDuBsyxOlO73EekJ-7oKLSNbwxEog2jPu6Qk2wOL1yE0k8g1GFX3suuqKiTgJs8DWw5rM3wqdVC88v-PJTJgLrwT6cDWjIDp_Y","DESIGN":"AHj4eMTz8b-rufsSQ8HnF9IdPaOXHg1iIKLc1YP-Q5iQcr_3-vfsfbZRQyE6ylPQZwFRFi5kbJuM9JvpwjyYhpqnBl_zPpQa5C8GfJCAJSE","002":"AHj4eMQ0-jm65PE40DFggZ6gRjipllmvOcNZPAJAOyDWdt8rVEYLvfQcaz74QVMamH4ey1ROd2-o6UWjxN0pyKP_FMh3bB4OxXLt-KxN0sM"}}
    validate_manifest(manifest,universe)
    fixture_results=[{"fixture":f[0],"pass":fixture_ok(f,run_fixture(f)),"actual":run_fixture(f)} for f in FIXTURES]
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests);res=unittest.TextTestRunner(verbosity=2).run(suite)
    out={"technical_state":"TECHNICAL_PASS" if res.wasSuccessful() and all(x["pass"] for x in fixture_results) else"FAIL","tests_run":res.testsRun,"failures":len(res.failures),"errors":len(res.errors),"fixtures":17,"fixtures_pass":sum(x["pass"] for x in fixture_results),"universe_hash":manifest["universe_hash"],"scientific_validation":"NOT_PERFORMED","calibration":"NOT_PERFORMED","real_cases":0,"corpus_rows":0,"event_bus_writes":0,"rc3_mutation":0,"actor_09_activation":0}
    if "--write-results" in sys.argv:
        Path("T1_RESULT.json").write_text(json.dumps(out,indent=2,ensure_ascii=False));Path("RUN_MANIFEST.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False));Path("FIXTURE_RESULTS.json").write_text(json.dumps(fixture_results,indent=2,ensure_ascii=False));Path("SYNTHETIC_UNIVERSE.json").write_text(json.dumps(universe,indent=2,ensure_ascii=False))
    print(json.dumps(out,indent=2,ensure_ascii=False));return 0 if out["technical_state"]=="TECHNICAL_PASS" else 1

if __name__=="__main__":raise SystemExit(run())
