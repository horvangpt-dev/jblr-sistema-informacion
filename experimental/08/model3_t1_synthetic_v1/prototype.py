from __future__ import annotations
import hashlib, json, sys, unittest
from copy import deepcopy
from pathlib import Path

SYN="SYNTHETIC_TEST_ONLY"

VALUE_STATES={
    "VALID","PROVISIONAL","ZERO_CONFIRMED","UNKNOWN","SEARCH_NOT_STARTED",
    "SEARCH_PARTIAL","SOURCE_UNAVAILABLE","NOT_FOUND_AFTER_SUFFICIENT_SEARCH",
    "CONFLICT","NOT_APPLICABLE","SUPERSEDED"
}
CWR={"YES","NO_CONFIRMED","UNKNOWN","CONFLICT"}
CV={"ALL","EXCLUDE_CONFIRMED_CWR","ONLY_CONFIRMED_CWR"}
PV={"ALL","EXCLUDE_HIGH_PROTECTION","EXCLUDE_ANY_CONFIRMED_PROTECTION","ONLY_NO_PROTECTION_CONFIRMED"}
APP_DATA_STATES={"INCOMPLETE","DATA_READY","DATA_READY_WITH_OPEN_CONFIRMATIONS"}
APP_READINESS={"READY","HOLD_CONFIRMATION","UNKNOWN_REQUIREMENT"}
SELECTION_RESULTS={"SELECTED","RESERVE","DEFERRED","FILTERED_OUT","PENDING_DECISION"}

PARAMS={
    "parameter_scope":SYN,
    "q_l":.25,"q_h":.75,"gamma_l":1.0,"gamma_h":1.0,"alpha":.5,
    "scientific_weights":"UNSET","u_weights":"UNSET","i_weights":"UNSET",
    "n_ref":"UNSET","cwr_weight":"UNSET",
}

SOURCE_DOCUMENTS={
    "T0":{"id":"1AYQVFOHtIYhk3i46fognwutDvRy2nJyY-xeThaV31X0","revision_id":"AHj4eMS6bmDuBsyxOlO73EekJ-7oKLSNbwxEog2jPu6Qk2wOL1yE0k8g1GFX3suuqKiTgJs8DWw5rM3wqdVC88v-PJTJgLrwT6cDWjIDp_Y"},
    "DESIGN":{"id":"1uHRWArJaOs_gSukP8BESQHHErFk8vLGzCrXdljdLje0","revision_id":"AHj4eMTz8b-rufsSQ8HnF9IdPaOXHg1iIKLc1YP-Q5iQcr_3-vfsfbZRQyE6ylPQZwFRFi5kbJuM9JvpwjyYhpqnBl_zPpQa5C8GfJCAJSE"},
    "P1":{"id":"1FzxQ3WfGox6LhbrXudY1geUTUBZqJDkH6qsGcZLXHIQ","revision_id":"AHj4eMSCp1STjVHVfY6rbTXbKUuQEhD_tuHmMFog57HxsqyuIlSA_SZSPg7gYH1ibK81ftCRdu-XmCtLisMaXXs5ZGF6OH5mPtI3C7FExLQ"},
    "MAN01":{"id":"1NMKp0o9ADnIvg_BX5X-R8xRN94SE51MmtaoHrKCiUBk","revision_id":"AHj4eMQEqs9YoflemqKNlnNJP3Agqs02HWfZsBnM2K5d2A7oJrHZdt1LAtReo_y1ZhCyv02mq8caJDaZVnrALUDszj1q2wc7GL1hSj4_y8A"},
    "IT01":{"id":"1oSdXFZ0Y_SfVrfLbg3BNqe5L3hFX9Rg7ylNoGqIlehI","revision_id":"AHj4eMS5EOblboVOEldKQzEldbgfKV3SIvCp33HJBHF-wqSFLV1VXUAMb6dWlcUfaJVrPbovj-YXfaHc59CQMm8X80jle8RaYWW2iCOUpzI"},
    "MAN02":{"id":"1h2iAlcWU6Af3Wb3cpe4oSH6d4RNHG9FrYmfHDZBJl9Y","revision_id":"AHj4eMS_kReA0Ujv1TXU18eie810jzwWse1GSISEBG2nPugl1VYiZLWyL7hLcmbVKz004RRXSwFE2-65DoCoycK2dSfOuTSoV2650roHxPA"},
    "IT02":{"id":"1jvzJUaIDa0dB9eonLU72YF-FLxN4yUSLzEpFLASGC6c","revision_id":"AHj4eMSJHYu0erIvdbf6F5Dm8GoOpxH9y_J0lXiZ9sqs--rVxvy5AQ_X8Wb0yYoWGQESTEO98rwGGfDn96QvTlQdwboq0IsqHYu_nxWewb4"},
}

class ContractError(ValueError):
    pass

def hjson(x):
    return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def require_fields(row,fields,label):
    missing=sorted(set(fields)-set(row))
    if missing:
        raise ContractError(f"{label} missing fields {missing}")

def require_evidence(row,field="evidence_pointers"):
    value=row.get(field)
    if not isinstance(value,list) or not value or not all(isinstance(x,str) and x for x in value):
        raise ContractError(f"{field} required")

def validate_manifest(m,u):
    req={
        "run_id","model_version","universe_release_id","universe_version","universe_hash",
        "evidence_snapshot_id","run_cutoff_date","parameter_set_id","synthetic_test_only",
        "source_documents","scientific_weights","u_weights","i_weights","n_ref","cwr_weight",
        "corpus_execution","real_case_execution","calibration_execution","event_bus_writes",
        "rc3_mutation","actor_09_activation","master_doc_mutation","external_evidence_queries",
    }
    require_fields(m,req,"manifest")
    if m["synthetic_test_only"] is not True or SYN not in m["parameter_set_id"]:
        raise ContractError("not synthetic")
    if m["universe_hash"]!=hjson(u):
        raise ContractError("hash mismatch")
    keys=[r.get("taxon_key") for r in u]
    if any(not x for x in keys) or len(keys)!=len(set(keys)):
        raise ContractError("invalid/duplicate TAXON_KEY")
    if any(not r.get("scientific_name") or not r.get("rank") for r in u):
        raise ContractError("missing universe identity fields")
    if set(m["source_documents"])!=set(SOURCE_DOCUMENTS):
        raise ContractError("source document freeze incomplete")
    for k,v in SOURCE_DOCUMENTS.items():
        if m["source_documents"].get(k)!=v:
            raise ContractError(f"source freeze mismatch {k}")
    for k in ("scientific_weights","u_weights","i_weights","n_ref","cwr_weight"):
        if m[k]!="UNSET":
            raise ContractError(f"{k} must remain UNSET")
    for k in ("corpus_execution","real_case_execution","calibration_execution","event_bus_writes","rc3_mutation","actor_09_activation","master_doc_mutation","external_evidence_queries"):
        if m[k]!=0:
            raise ContractError(f"isolation violation {k}")

def validate_value(v,state,reason=None):
    if state not in VALUE_STATES:
        raise ContractError("bad VALUE_STATE")
    if v is None and state in {"VALID","ZERO_CONFIRMED"}:
        raise ContractError("null valid")
    if v is None and state in {"UNKNOWN","SEARCH_NOT_STARTED","SEARCH_PARTIAL","SOURCE_UNAVAILABLE","CONFLICT"} and not reason:
        raise ContractError("null needs reason")
    if v==0 and state not in {"ZERO_CONFIRMED","VALID"}:
        raise ContractError("invalid zero")

def validate_valuation_interface(row,m):
    req={
        "run_id","model_version","universe_release_id","universe_version","universe_hash",
        "taxon_key","scientific_name","rank","identity_state","evidence_snapshot_id",
        "run_cutoff_date","u_value","u_state","i_value","i_state",
        "low_research_opportunity_component","high_research_activity_component",
        "research_low_eligibility","cwr_filter_state","protection_presence_state",
        "protection_exclusion_class","evidence_pointers","method_versions"
    }
    require_fields(row,req,"valuation")
    for f in ("run_id","model_version","universe_release_id","universe_version","universe_hash","evidence_snapshot_id","run_cutoff_date"):
        if row[f]!=m[f]:
            raise ContractError(f"version mismatch {f}")
    validate_value(row["u_value"],row["u_state"],row.get("u_pending_reason_code"))
    validate_value(row["i_value"],row["i_state"],row.get("i_pending_reason_code"))
    if row["cwr_filter_state"] not in CWR:
        raise ContractError("bad CWR filter state")
    if row["protection_presence_state"] not in {"PROTECTED_CONFIRMED","NO_PROTECTION_CONFIRMED","UNKNOWN","CONFLICT","SOURCE_UNAVAILABLE"}:
        raise ContractError("bad protection presence")
    if not row["method_versions"]:
        raise ContractError("METHOD_VERSIONS empty")
    require_evidence(row)

def validate_valuation_rows(rows,m):
    seen=set()
    for row in rows:
        validate_valuation_interface(row,m)
        key=(row["run_id"],row["taxon_key"])
        if key in seen:
            raise ContractError("duplicate valuation key")
        seen.add(key)

def validate_monthly_rows(rows):
    req={
        "case_id","run_id","taxon_key","month_window_id","visit_objective","phenology_state",
        "preferred_window","alternative_window","u_value","u_state","i_value","i_state",
        "cwr_view","protection_view","selection_profile_id","selection_result",
        "selection_boundary_tie","decision_reason","evidence_pointers"
    }
    seen=set()
    for row in rows:
        require_fields(row,req,"monthly")
        key=(row["run_id"],row["taxon_key"],row["month_window_id"],row["visit_objective"],row["selection_profile_id"])
        if key in seen:
            raise ContractError("duplicate monthly business key")
        seen.add(key)
        if row["cwr_view"] not in CV or row["protection_view"] not in PV:
            raise ContractError("bad monthly filter view")
        if row["selection_result"] not in SELECTION_RESULTS:
            raise ContractError("bad selection result")
        validate_value(row["u_value"],row["u_state"],row.get("u_pending_reason_code"))
        validate_value(row["i_value"],row["i_state"],row.get("i_pending_reason_code"))
        require_evidence(row)
        if row["selection_result"]=="FILTERED_OUT" and not row["decision_reason"]:
            raise ContractError("FILTERED_OUT requires reason")

def validate_dossier_row(row):
    req={
        "case_id","decision_id","run_id","taxon_key","objective","locality_or_scope_id",
        "spatial_evidence_state","source_record_ids","spatial_precision","sensitive_location_state",
        "preferred_window","alternative_window","questions_for_field","access_restrictions",
        "open_gaps","dossier_version","evidence_pointers"
    }
    require_fields(row,req,"dossier")
    if not row["case_id"] or not row["decision_id"] or not row["dossier_version"]:
        raise ContractError("invalid dossier identity")
    if not isinstance(row["source_record_ids"],list):
        raise ContractError("source_record_ids must be list")
    require_evidence(row)

def validate_confirmation(c):
    req={"confirmation_id","question","owner","required_by","blocks_submission","status","evidence_pointer"}
    require_fields(c,req,"confirmation")
    if c["blocks_submission"] not in {"YES","NO","UNKNOWN"}:
        raise ContractError("bad blocks_submission")
    if not c["evidence_pointer"]:
        raise ContractError("confirmation evidence required")

def validate_application_row(row):
    req={
        "application_unit_id","case_id","taxon_key","scientific_name","rank","proposed_action",
        "material_type","documented_spatial_scope_id","spatial_evidence_state","preferred_window",
        "alternative_window","method_proposed","limits_proposed","limit_unit","purpose","destination",
        "responsible_persons","legal_evidence_state","risks_and_controls","open_confirmations",
        "application_data_state","application_submission_readiness","evidence_pointers"
    }
    require_fields(row,req,"application")
    if row["application_data_state"] not in APP_DATA_STATES:
        raise ContractError("bad application data state")
    if row["application_submission_readiness"] not in APP_READINESS:
        raise ContractError("bad application readiness")
    if not isinstance(row["open_confirmations"],list):
        raise ContractError("open_confirmations must be list")
    for c in row["open_confirmations"]:
        validate_confirmation(c)
    require_evidence(row)

def protection(categories,complete,identity=True,conflict=False,source_unavailable=False,class_conflict=False):
    c=set(categories)
    if source_unavailable:
        return ("SOURCE_UNAVAILABLE","UNKNOWN")
    if conflict:
        return ("CONFLICT","CONFLICT")
    if not identity:
        return ("UNKNOWN","UNKNOWN")
    presence,pclass="UNKNOWN","UNKNOWN"
    if c&{"ENDANGERED","ENDANGERED_CRITICAL","VULNERABLE"}:
        presence,pclass="PROTECTED_CONFIRMED","HIGH_EXCLUSION"
    elif c&{"SPECIAL_PROTECTION_ONLY","LESRPE_ONLY","DIRECTIVE_OR_CONVENTION_PROTECTION"}:
        presence,pclass="PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION"
    elif complete and not c:
        presence,pclass="NO_PROTECTION_CONFIRMED","NO_PROTECTION_CONFIRMED"
    if class_conflict and presence=="PROTECTED_CONFIRMED":
        pclass="CONFLICT"
    return presence,pclass

def pvisible(pres,pclass,view):
    if view not in PV:
        raise ContractError("bad protection view")
    if view=="ALL":
        return True
    if view=="EXCLUDE_HIGH_PROTECTION":
        return pclass!="HIGH_EXCLUSION"
    if view=="EXCLUDE_ANY_CONFIRMED_PROTECTION":
        return pres!="PROTECTED_CONFIRMED"
    return pres=="NO_PROTECTION_CONFIRMED"

def cwr_state(rel,complete):
    states=[r["cwr_state"] for r in rel]
    if any(x not in CWR for x in states):
        raise ContractError("bad CWR_STATE")
    if "YES" in states:
        return "YES"
    if "CONFLICT" in states:
        return "CONFLICT"
    if "UNKNOWN" in states or not complete:
        return "UNKNOWN"
    return "NO_CONFIRMED"

def cvisible(state,view):
    if view not in CV:
        raise ContractError("bad CWR view")
    if view=="ALL":
        return True
    if view=="EXCLUDE_CONFIRMED_CWR":
        return state!="YES"
    return state=="YES"

def profile(row,cview,pview):
    u,i=deepcopy(row.get("u")),deepcopy(row.get("i"))
    out=deepcopy(row)
    c_ok=cvisible(row["cwr"],cview)
    p_ok=pvisible(row["pres"],row["pclass"],pview)
    out["included"]=c_ok and p_ok
    reasons=[]
    if not c_ok:
        reasons.append(f"CWR:{cview}")
    if not p_ok:
        reasons.append(f"PROTECTION:{pview}")
    out["filter_reasons"]=reasons
    if out.get("u")!=u or out.get("i")!=i:
        raise ContractError("filter changed U/I")
    return out

def midrank(vals):
    if not vals:
        return []
    order=sorted(enumerate(vals),key=lambda x:x[1])
    out=[0.]*len(vals)
    n=len(vals)
    i=0
    while i<n:
        j=i+1
        while j<n and order[j][1]==order[i][1]:
            j+=1
        mid=((i+1)+j)/2
        p=(mid-.5)/n
        for k in range(i,j):
            out[order[k][0]]=p
        i=j
    return out

def tie_boundary_flags(vals,q_l,q_h):
    flags=[{"q_l":False,"q_h":False} for _ in vals]
    order=sorted(enumerate(vals),key=lambda x:x[1])
    n=len(vals)
    i=0
    while i<n:
        j=i+1
        while j<n and order[j][1]==order[i][1]:
            j+=1
        if j-i>1:
            p_min=(i+.5)/n
            p_max=(j-.5)/n
            cross_l=p_min<q_l<p_max
            cross_h=p_min<q_h<p_max
            for k in range(i,j):
                flags[order[k][0]]={"q_l":cross_l,"q_h":cross_h}
        i=j
    return flags

def lowhigh(p,q_l,q_h,g_l,g_h):
    if not 0<q_l<q_h<1 or g_l<=0 or g_h<=0:
        raise ContractError("bad research params")
    return 100*max(0,(q_l-p)/q_l)**g_l,100*max(0,(p-q_h)/(1-q_h))**g_h

def research(records,params=PARAMS):
    if params["parameter_scope"]!=SYN:
        raise ContractError("research params not synthetic")
    eligible=[i for i,r in enumerate(records) if r.get("member")=="YES" and r.get("eligibility")=="PASS"]
    vals=[float(records[i]["R"]) for i in eligible]
    metrics={
        "REFERENCE_N_TOTAL_CANDIDATE":len(records),
        "REFERENCE_N_ELIGIBLE":len(eligible),
        "REFERENCE_EXCLUDED_INSUFFICIENT_COVERAGE":sum(r.get("eligibility")!="PASS" for r in records),
        "REFERENCE_ELIGIBILITY_RATE":(len(eligible)/len(records)) if records else None,
    }
    if not vals:
        distribution="EMPTY_REFERENCE"; pp=[]; flags=[]
    elif len(set(vals))==1:
        distribution="DEGENERATE"; pp=[None]*len(vals); flags=[{"q_l":False,"q_h":False} for _ in vals]
    else:
        distribution="VALID"; pp=midrank(vals); flags=tie_boundary_flags(vals,params["q_l"],params["q_h"])
    pmap=dict(zip(eligible,pp)); fmap=dict(zip(eligible,flags)); out=[]
    for i,r0 in enumerate(records):
        r=dict(r0); r.update(metrics); r["distribution"]=distribution; r["boundary_tie_state"]={"q_l":False,"q_h":False}
        if i not in pmap:
            r.update(percentile=None,low=None,high=None,low_reason=("REFERENCE_UNAVAILABLE" if distribution=="EMPTY_REFERENCE" else "UNKNOWN_INSUFFICIENT_SEARCH" if r.get("eligibility")!="PASS" else "NOT_REFERENCE_MEMBER"))
        elif distribution=="DEGENERATE":
            r.update(percentile=None,low=None,high=None,low_reason="UNSET_DEGENERATE_REFERENCE")
        else:
            lo,hi=lowhigh(pmap[i],params["q_l"],params["q_h"],params["gamma_l"],params["gamma_h"])
            r.update(percentile=pmap[i],low=lo,high=hi,low_reason="EVALUATED",boundary_tie_state=fmap[i])
        out.append(r)
    return out

def research_scenario(low,high,mode,alpha=None):
    if low is None or high is None:
        return {"mode":mode,"value":None,"state":"UNSET_INPUT_COMPONENT"}
    if mode=="SEPARATE":
        return {"mode":mode,"value":None,"low":low,"high":high,"state":"VECTOR_ONLY"}
    if mode=="MAX":
        return {"mode":mode,"value":max(low,high),"state":SYN}
    if mode=="WEIGHTED" and alpha is not None and 0<=alpha<=1:
        return {"mode":mode,"value":alpha*low+(1-alpha)*high,"state":SYN}
    raise ContractError("bad research scenario")

def cwr_scenario(mode,u,i):
    if mode not in {"CWR_OFF","CWR_ON_RELATION_ONLY","CWR_ON_APPLIED_ONLY","CWR_ON_COMBINED","CWR_OVERLAY_ONLY"}:
        raise ContractError("bad CWR scenario")
    return {"mode":mode,"u_before":u,"i_before":i,"u_after":u,"i_after":i,"numeric_cwr_component":"UNSET","cwr_weight":"UNSET","state":SYN}

def readiness(confs):
    states=[c.get("blocks_submission") for c in confs]
    return "HOLD_CONFIRMATION" if "YES" in states else "UNKNOWN_REQUIREMENT" if "UNKNOWN" in states else "READY"

def data_state(complete,confs):
    if not complete:
        return "INCOMPLETE"
    return "DATA_READY_WITH_OPEN_CONFIRMATIONS" if confs else "DATA_READY"

def collection_go(auth,gates=None):
    req={"identity","presence","population","maturity","sustainability","technical_limits"}
    return auth=="AUTHORIZED_WITH_SCOPE" and bool(gates) and req<=set(gates) and all(gates[k] for k in req)

def boundary_tie(values,cap):
    if cap<=0 or cap>=len(values):
        return False
    ordered=sorted(values,reverse=True)
    return ordered[cap-1]==ordered[cap]

def exsitu(acc):
    primary=[a for a in acc if a.get("valid",True) and not a.get("backup_of")]
    origins={a["origin"] for a in primary if a.get("origin")}
    return {"A_b":len(primary),"O_b":len(origins),"UO_b":sum(not a.get("origin") for a in primary)}

def desktop(case):
    req={"taxon_key","scientific_name","rank","proposed_action","material_type","documented_spatial_scope_id","spatial_evidence_state","preferred_window","phenology_basis","purpose","destination","responsible_persons"}
    missing=sorted(k for k in req if not case.get(k))
    return {"ready":not missing,"missing":missing,"field_protocols_required":False,"spatial_state":case.get("spatial_evidence_state")}

FIXTURES=[
("F01","filter",dict(cats=[],pc=True,rel=["NO_CONFIRMED"],cc=True,u=61,i=42),dict(cwr="NO_CONFIRMED",pres="NO_PROTECTION_CONFIRMED",pclass="NO_PROTECTION_CONFIRMED",simple=True)),
("F02","filter",dict(cats=["ENDANGERED"],pc=True,rel=["NO_CONFIRMED"],cc=True,u=88,i=33),dict(pres="PROTECTED_CONFIRMED",pclass="HIGH_EXCLUSION",base=True,high=False,simple=False)),
("F03","filter",dict(cats=["SPECIAL_PROTECTION_ONLY"],pc=True,rel=["NO_CONFIRMED"],cc=True,u=70,i=50),dict(pres="PROTECTED_CONFIRMED",pclass="PROTECTED_NON_EXCLUSION",high=True,only_no=False)),
("F04","filter",dict(cats=[],pc=False,rel=["NO_CONFIRMED"],cc=True,u=55,i=29),dict(pres="UNKNOWN",pclass="UNKNOWN",base=True,high=True,simple=False)),
("F05","filter",dict(cats=[],pc=True,rel=["YES"],cc=True,u=44,i=71),dict(cwr="YES",no_cwr=False,simple=False)),
("F06","filter",dict(cats=[],pc=True,rel=["UNKNOWN"],cc=False,u=39,i=47),dict(cwr="UNKNOWN",no_cwr=True,simple=True)),
("F07","cwr",dict(rel=["NO_CONFIRMED","YES","UNKNOWN"],cc=False),dict(cwr="YES",rows=3,numeric="UNSET")),
("F08","cwr",dict(rel=["NO_CONFIRMED","CONFLICT"],cc=True),dict(cwr="CONFLICT")),
("F09","research",dict(records=[dict(k="F09",R=1,member="NO",eligibility="SEARCH_PARTIAL")]),dict(k="F09",percentile=None,low=None,low_reason="REFERENCE_UNAVAILABLE",distribution="EMPTY_REFERENCE")),
("F10","research",dict(records=[dict(k="A",R=1,member="YES",eligibility="PASS"),dict(k="B",R=10,member="YES",eligibility="PASS"),dict(k="C",R=20,member="YES",eligibility="PASS"),dict(k="D",R=30,member="YES",eligibility="PASS")]),dict(k="A",low_nonnull=True,distribution="VALID")),
("F11","research",dict(records=[dict(k="A",R=5,member="YES",eligibility="PASS"),dict(k="B",R=5,member="YES",eligibility="PASS"),dict(k="C",R=5,member="YES",eligibility="PASS")]),dict(all_degenerate=True,all_null=True)),
("F12","tie",dict(values=[90,80,80,60],cap=2),dict(tie=True,human=True)),
("F13","application",dict(complete=True,confs=[{"blocks_submission":"NO"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="READY",preserved=1)),
("F14","application",dict(complete=True,confs=[{"blocks_submission":"YES"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="HOLD_CONFIRMATION")),
("F15","go",dict(auth="AUTHORIZED_WITH_SCOPE",gates=None),dict(collection_go=False)),
("F16","application",dict(complete=True,confs=[{"blocks_submission":"YES"},{"blocks_submission":"UNKNOWN"}]),dict(data="DATA_READY_WITH_OPEN_CONFIRMATIONS",submission="HOLD_CONFIRMATION",preserved=2)),
("F17","research",dict(records=[dict(k="A",R=5,member="YES",eligibility="PASS"),dict(k="B",R=5,member="NO",eligibility="SEARCH_PARTIAL"),dict(k="C",R=20,member="YES",eligibility="PASS")]),dict(pass_nonnull=True,b_null=True)),
]

def run_fixture(f):
    fid,t,x,e=f
    if t in {"filter","cwr"}:
        rel=[{"cwr_state":s} for s in x["rel"]]; cs=cwr_state(rel,x["cc"]); out={"cwr":cs}
        if t=="cwr":
            return out|{"rows":len(rel),"numeric":"UNSET"}
        pres,pclass=protection(x["cats"],x["pc"]); row={"cwr":cs,"pres":pres,"pclass":pclass,"u":x["u"],"i":x["i"]}
        return out|{"pres":pres,"pclass":pclass,"base":profile(row,"ALL","ALL")["included"],"high":profile(row,"ALL","EXCLUDE_HIGH_PROTECTION")["included"],"only_no":profile(row,"ALL","ONLY_NO_PROTECTION_CONFIRMED")["included"],"no_cwr":profile(row,"EXCLUDE_CONFIRMED_CWR","ALL")["included"],"simple":profile(row,"EXCLUDE_CONFIRMED_CWR","ONLY_NO_PROTECTION_CONFIRMED")["included"],"u":x["u"],"i":x["i"]}
    if t=="research":
        return {r["k"]:r for r in research(x["records"])}
    if t=="tie":
        tied=boundary_tie(x["values"],x["cap"]); return {"tie":tied,"human":tied}
    if t=="application":
        return {"data":data_state(x["complete"],x["confs"]),"submission":readiness(x["confs"]),"preserved":len(x["confs"])}
    if t=="go":
        return {"collection_go":collection_go(x["auth"],x["gates"])}
    raise AssertionError(t)

def fixture_ok(f,actual):
    fid,t,x,e=f
    if t=="research":
        if fid=="F10":
            return actual["A"]["low"] is not None and actual["A"]["distribution"]=="VALID"
        if fid=="F11":
            return all(v["distribution"]=="DEGENERATE" and v["low"] is None and v["high"] is None for v in actual.values())
        if fid=="F17":
            return actual["A"]["percentile"] is not None and actual["B"]["percentile"] is None and actual["B"]["low"] is None
        row=actual[e["k"]]
        return all(row[k]==v for k,v in e.items() if k!="k")
    return all(actual[k]==v for k,v in e.items())

def synthetic_universe():
    return [{"taxon_key":f"SYN-U{i:03d}","scientific_name":f"Fictitia syntheticus {i}","rank":"species"} for i in range(1,18)]

def base_manifest(universe):
    return {
        "run_id":"MODEL3-T1-SYNTHETIC-20261117-002",
        "model_version":"MODEL3_T1_PROTOTYPE_v2_CORRECTIVE",
        "universe_release_id":"SYNTHETIC_MODEL3_T1_2026-11-17_v2",
        "universe_version":"v2",
        "universe_hash":hjson(universe),
        "evidence_snapshot_id":"SYNTHETIC_EVIDENCE_MODEL3_T1_v2",
        "run_cutoff_date":"2026-11-17",
        "parameter_set_id":"SYNTHETIC_TEST_ONLY_MODEL3_T1_MECHANICS_v2",
        "synthetic_test_only":True,
        "scientific_weights":"UNSET","u_weights":"UNSET","i_weights":"UNSET","n_ref":"UNSET","cwr_weight":"UNSET",
        "corpus_execution":0,"real_case_execution":0,"calibration_execution":0,"event_bus_writes":0,
        "rc3_mutation":0,"actor_09_activation":0,"master_doc_mutation":0,"external_evidence_queries":0,
        "protection_mapping_version":"JBLR_PROT_MAP_LR_v0.1_2026-11-17",
        "source_documents":deepcopy(SOURCE_DOCUMENTS),
    }

class Tests(unittest.TestCase):
    def setUp(self):
        self.universe=synthetic_universe()
        self.manifest=base_manifest(self.universe)

    def test_01_manifest_hash_keys_and_freeze(self):
        validate_manifest(self.manifest,self.universe)
        with self.assertRaises(ContractError):
            validate_manifest(self.manifest|{"universe_hash":"x"},self.universe)
        bad=deepcopy(self.manifest); bad["source_documents"].pop("IT02")
        with self.assertRaises(ContractError):
            validate_manifest(bad,self.universe)

    def test_02_duplicate_keys(self):
        u=[{"taxon_key":"S","scientific_name":"a","rank":"species"},{"taxon_key":"S","scientific_name":"b","rank":"species"}]
        with self.assertRaises(ContractError):
            validate_manifest(base_manifest(u),u)

    def test_03_null_zero(self):
        validate_value(None,"UNKNOWN","NO_DATA"); validate_value(0,"ZERO_CONFIRMED")
        with self.assertRaises(ContractError):
            validate_value(0,"UNKNOWN","NO_DATA")

    def test_04_valuation_interface_and_business_key(self):
        row={
            **{k:self.manifest[k] for k in ("run_id","model_version","universe_release_id","universe_version","universe_hash","evidence_snapshot_id","run_cutoff_date")},
            "taxon_key":"SYN-U001","scientific_name":"Fictitia syntheticus 1","rank":"species","identity_state":"RESOLVED",
            "u_value":None,"u_state":"UNKNOWN","u_pending_reason_code":"UNSET","i_value":None,"i_state":"UNKNOWN","i_pending_reason_code":"UNSET",
            "low_research_opportunity_component":None,"high_research_activity_component":None,"research_low_eligibility":"FAIL_OR_UNKNOWN",
            "cwr_filter_state":"UNKNOWN","protection_presence_state":"UNKNOWN","protection_exclusion_class":"UNKNOWN",
            "evidence_pointers":["SYN:E1"],"method_versions":{"T0":"v0.2"},
        }
        validate_valuation_rows([row],self.manifest)
        with self.assertRaises(ContractError):
            validate_valuation_rows([row,row],self.manifest)

    def test_05_monthly_interface_filtered_audit(self):
        row={"case_id":"CASE-1","run_id":"R","taxon_key":"S","month_window_id":"M06","visit_objective":"ASSESS","phenology_state":"EXPECTED","preferred_window":"M06","alternative_window":"M07","u_value":1,"u_state":"VALID","i_value":2,"i_state":"VALID","cwr_view":"EXCLUDE_CONFIRMED_CWR","protection_view":"ONLY_NO_PROTECTION_CONFIRMED","selection_profile_id":"SIMPLE_NO_CWR_NO_PROTECTION_PROFILE","selection_result":"FILTERED_OUT","selection_boundary_tie":False,"decision_reason":"PROTECTION:ONLY_NO_PROTECTION_CONFIRMED","evidence_pointers":["SYN:MONTHLY"]}
        validate_monthly_rows([row])
        with self.assertRaises(ContractError):
            validate_monthly_rows([row|{"decision_reason":""}])

    def test_06_dossier_interface(self):
        validate_dossier_row({"case_id":"CASE-1","decision_id":"D-1","run_id":"R","taxon_key":"S","objective":"ASSESS","locality_or_scope_id":"L1","spatial_evidence_state":"HISTORICAL_LOCALITY","source_record_ids":["SRC1"],"spatial_precision":"MUNICIPALITY","sensitive_location_state":"RESTRICTED","preferred_window":"M06","alternative_window":"M07","questions_for_field":["presence"],"access_restrictions":[],"open_gaps":["population"],"dossier_version":"v1","evidence_pointers":["SYN:DOSSIER"]})

    def test_07_application_interface_and_states(self):
        self.assertEqual(data_state(False,[]),"INCOMPLETE")
        self.assertEqual(data_state(True,[]),"DATA_READY")
        self.assertEqual(data_state(True,[{"blocks_submission":"NO"}]),"DATA_READY_WITH_OPEN_CONFIRMATIONS")
        confirmation={"confirmation_id":"C1","question":"Q","owner":"002","required_by":"SUBMISSION","blocks_submission":"NO","status":"OPEN","evidence_pointer":"SYN:C1"}
        row={"application_unit_id":"A1","case_id":"CASE-1","taxon_key":"S","scientific_name":"Fictitia a","rank":"species","proposed_action":"SEED_COLLECTION","material_type":"SEED","documented_spatial_scope_id":"H1","spatial_evidence_state":"HISTORICAL_LOCALITY","preferred_window":"M06","alternative_window":"M07","method_proposed":"SYN","limits_proposed":None,"limit_unit":None,"purpose":"EX_SITU","destination":"JBLR_SYN","responsible_persons":["SYN"],"legal_evidence_state":"OPEN_CONFIRMATION","risks_and_controls":["SYN"],"open_confirmations":[confirmation],"application_data_state":"DATA_READY_WITH_OPEN_CONFIRMATIONS","application_submission_readiness":"READY","evidence_pointers":["SYN:APP"]}
        validate_application_row(row)
        with self.assertRaises(ContractError):
            validate_application_row(row|{"application_data_state":"APPLICATION_DATA_READY"})

    def test_08_f01_f17(self):
        self.assertEqual([f[0] for f in FIXTURES],[f"F{i:02d}" for i in range(1,18)])
        for f in FIXTURES:
            self.assertTrue(fixture_ok(f,run_fixture(f)),f[0])

    def test_09_ui_invariance(self):
        for f in FIXTURES[:6]:
            a=run_fixture(f); self.assertEqual((a["u"],a["i"]),(f[2]["u"],f[2]["i"]))

    def test_10_protection_section17_categories(self):
        self.assertEqual(protection(["ENDANGERED"],True),("PROTECTED_CONFIRMED","HIGH_EXCLUSION"))
        self.assertEqual(protection(["ENDANGERED_CRITICAL"],True),("PROTECTED_CONFIRMED","HIGH_EXCLUSION"))
        self.assertEqual(protection(["VULNERABLE"],True),("PROTECTED_CONFIRMED","HIGH_EXCLUSION"))
        self.assertEqual(protection(["SPECIAL_PROTECTION_ONLY"],True),("PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION"))
        self.assertEqual(protection(["LESRPE_ONLY"],True),("PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION"))
        self.assertEqual(protection(["DIRECTIVE_OR_CONVENTION_PROTECTION"],True),("PROTECTED_CONFIRMED","PROTECTED_NON_EXCLUSION"))
        self.assertEqual(protection([],True),("NO_PROTECTION_CONFIRMED","NO_PROTECTION_CONFIRMED"))
        self.assertEqual(protection([],False),("UNKNOWN","UNKNOWN"))

    def test_11_protection_unknown_conflict_and_views(self):
        self.assertEqual(protection([],True,identity=False),("UNKNOWN","UNKNOWN"))
        self.assertEqual(protection([],True,source_unavailable=True),("SOURCE_UNAVAILABLE","UNKNOWN"))
        self.assertEqual(protection([],True,conflict=True),("CONFLICT","CONFLICT"))
        pres,pclass=protection(["SPECIAL_PROTECTION_ONLY"],True,class_conflict=True)
        self.assertEqual((pres,pclass),("PROTECTED_CONFIRMED","CONFLICT"))
        self.assertFalse(pvisible(pres,pclass,"EXCLUDE_ANY_CONFIRMED_PROTECTION"))
        self.assertTrue(pvisible(pres,pclass,"EXCLUDE_HIGH_PROTECTION"))
        self.assertFalse(pvisible("UNKNOWN","UNKNOWN","ONLY_NO_PROTECTION_CONFIRMED"))

    def test_12_cwr_precedence_and_views(self):
        self.assertEqual(cwr_state([{"cwr_state":"CONFLICT"},{"cwr_state":"YES"}],False),"YES")
        self.assertEqual(cwr_state([{"cwr_state":"CONFLICT"},{"cwr_state":"UNKNOWN"}],False),"CONFLICT")
        self.assertEqual(cwr_state([{"cwr_state":"NO_CONFIRMED"}],False),"UNKNOWN")
        self.assertTrue(cvisible("YES","ONLY_CONFIRMED_CWR"))
        self.assertFalse(cvisible("CONFLICT","ONLY_CONFIRMED_CWR"))
        row={"cwr":"CONFLICT","pres":"NO_PROTECTION_CONFIRMED","pclass":"NO_PROTECTION_CONFIRMED","u":3,"i":4}
        out=profile(row,"EXCLUDE_CONFIRMED_CWR","ONLY_NO_PROTECTION_CONFIRMED")
        self.assertTrue(out["included"]); self.assertEqual((out["u"],out["i"]),(3,4))

    def test_13_f16_submission_precedence(self):
        self.assertEqual(readiness([{"blocks_submission":"YES"},{"blocks_submission":"UNKNOWN"}]),"HOLD_CONFIRMATION")

    def test_14_empty_reference_not_valid(self):
        rows=research([{"k":"A","R":1,"member":"NO","eligibility":"SEARCH_PARTIAL"}])
        self.assertEqual(rows[0]["distribution"],"EMPTY_REFERENCE")
        self.assertIsNone(rows[0]["percentile"]); self.assertIsNone(rows[0]["low"])

    def test_15_low_boundary_tie(self):
        rows=research([{"k":"A","R":1,"member":"YES","eligibility":"PASS"},{"k":"B","R":1,"member":"YES","eligibility":"PASS"},{"k":"C","R":10,"member":"YES","eligibility":"PASS"},{"k":"D","R":20,"member":"YES","eligibility":"PASS"}])
        a,b=rows[0],rows[1]
        self.assertEqual(a["percentile"],b["percentile"]); self.assertEqual(a["low"],b["low"])
        self.assertTrue(a["boundary_tie_state"]["q_l"]); self.assertTrue(b["boundary_tie_state"]["q_l"])

    def test_16_high_boundary_tie(self):
        rows=research([{"k":"A","R":1,"member":"YES","eligibility":"PASS"},{"k":"B","R":10,"member":"YES","eligibility":"PASS"},{"k":"C","R":20,"member":"YES","eligibility":"PASS"},{"k":"D","R":20,"member":"YES","eligibility":"PASS"}])
        c,d=rows[2],rows[3]
        self.assertEqual(c["percentile"],d["percentile"]); self.assertEqual(c["high"],d["high"])
        self.assertTrue(c["boundary_tie_state"]["q_h"]); self.assertTrue(d["boundary_tie_state"]["q_h"])

    def test_17_reference_metrics_and_f17(self):
        rows=research([{"k":"A","R":5,"member":"YES","eligibility":"PASS"},{"k":"B","R":5,"member":"NO","eligibility":"SEARCH_PARTIAL"},{"k":"C","R":20,"member":"YES","eligibility":"PASS"}])
        for r in rows:
            self.assertEqual(r["REFERENCE_N_TOTAL_CANDIDATE"],3); self.assertEqual(r["REFERENCE_N_ELIGIBLE"],2)
            self.assertEqual(r["REFERENCE_EXCLUDED_INSUFFICIENT_COVERAGE"],1); self.assertAlmostEqual(r["REFERENCE_ELIGIBILITY_RATE"],2/3)
        self.assertIsNotNone(rows[0]["percentile"]); self.assertIsNone(rows[1]["percentile"]); self.assertIsNone(rows[1]["low"])

    def test_18_selection_boundary_tie(self):
        self.assertTrue(boundary_tie([90,80,80,60],2)); self.assertFalse(boundary_tie([90,80,70,60],2))

    def test_19_scenarios(self):
        self.assertEqual(research_scenario(80,10,"MAX")["value"],80)
        self.assertAlmostEqual(research_scenario(80,10,"WEIGHTED",.25)["value"],27.5)
        d=cwr_scenario("CWR_ON_COMBINED",64,51); self.assertEqual((d["u_after"],d["i_after"],d["cwr_weight"]),(64,51,"UNSET"))

    def test_20_exsitu(self):
        self.assertEqual(exsitu([{"origin":"O1"},{"origin":"O1","backup_of":"A1"}]),{"A_b":1,"O_b":1,"UO_b":0})
        self.assertEqual(exsitu([{"origin":"O2"},{"origin":"O2"}]),{"A_b":2,"O_b":1,"UO_b":0})
        self.assertEqual(exsitu([{"origin":None}]),{"A_b":1,"O_b":0,"UO_b":1})

    def test_21_desktop_historical_locality(self):
        c={"taxon_key":"S","scientific_name":"Fictitia historica","rank":"species","proposed_action":"SEED_COLLECTION","material_type":"SEED","documented_spatial_scope_id":"H1","spatial_evidence_state":"HISTORICAL_LOCALITY","preferred_window":"M06","phenology_basis":SYN,"purpose":"EX_SITU","destination":"JBLR_SYN","responsible_persons":["SYN"]}
        a=desktop(c); self.assertTrue(a["ready"]); self.assertFalse(a["field_protocols_required"]); self.assertEqual(a["spatial_state"],"HISTORICAL_LOCALITY")

    def test_22_missing_phenology(self):
        c={"taxon_key":"S","scientific_name":"Fictitia aphena","rank":"species","proposed_action":"SEED_COLLECTION","material_type":"SEED","documented_spatial_scope_id":"H1","spatial_evidence_state":"POTENTIAL_SECTOR","preferred_window":"M06","phenology_basis":None,"purpose":"EX_SITU","destination":"JBLR_SYN","responsible_persons":["SYN"]}
        self.assertIn("phenology_basis",desktop(c)["missing"])

    def test_23_collection_go(self):
        self.assertFalse(collection_go("AUTHORIZED_WITH_SCOPE"))
        gates={k:True for k in ["identity","presence","population","maturity","sustainability","technical_limits"]}
        self.assertTrue(collection_go("AUTHORIZED_WITH_SCOPE",gates))

    def test_24_open_parameters_and_isolation(self):
        self.assertEqual(PARAMS["parameter_scope"],SYN)
        for k in ("scientific_weights","u_weights","i_weights","n_ref","cwr_weight"):
            self.assertEqual(PARAMS[k],"UNSET")
        validate_manifest(self.manifest,self.universe)

def run():
    universe=synthetic_universe(); manifest=base_manifest(universe); validate_manifest(manifest,universe)
    fixture_results=[{"fixture":f[0],"pass":fixture_ok(f,run_fixture(f)),"actual":run_fixture(f)} for f in FIXTURES]
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Tests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    out={
        "technical_state":"TECHNICAL_PASS" if result.wasSuccessful() and all(x["pass"] for x in fixture_results) else "FAIL",
        "tests_run":result.testsRun,"failures":len(result.failures),"errors":len(result.errors),
        "fixtures":17,"fixtures_pass":sum(x["pass"] for x in fixture_results),
        "universe_hash":manifest["universe_hash"],"scientific_validation":"NOT_PERFORMED","calibration":"NOT_PERFORMED",
        "real_cases":0,"corpus_rows":0,"event_bus_writes":0,"rc3_mutation":0,"master_doc_mutation":0,
        "external_evidence_queries":0,"actor_09_activation":0,"t2_state":"PREPARADO_NO_AUTORIZADO",
    }
    if "--write-results" in sys.argv:
        Path("T1_RESULT.json").write_text(json.dumps(out,indent=2,ensure_ascii=False)+"\n")
        Path("RUN_MANIFEST.json").write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n")
        Path("FIXTURE_RESULTS.json").write_text(json.dumps(fixture_results,indent=2,ensure_ascii=False)+"\n")
        Path("SYNTHETIC_UNIVERSE.json").write_text(json.dumps(universe,indent=2,ensure_ascii=False)+"\n")
    print(json.dumps(out,indent=2,ensure_ascii=False))
    return 0 if out["technical_state"]=="TECHNICAL_PASS" else 1

if __name__=="__main__":
    raise SystemExit(run())
