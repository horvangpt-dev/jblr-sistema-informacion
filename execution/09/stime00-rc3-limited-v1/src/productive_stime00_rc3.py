#!/usr/bin/env python3
import argparse, json, re, hashlib
from pathlib import Path
from collections import defaultdict, Counter

ALLOWED_EXTENSION_STATES = {
    "OFFICIAL_ID_EXACT_ACCEPTED",
    "TEMPORARY_JBLR_ID_VALID_AFTER_COMPLETED_OFFICIAL_SEARCH_WITH_NO_CONFIRMED_EXACT_ID",
    "CONFLICT_REVIEW_REQUIRED",
    "UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH",
}
ACCEPTED_STATUS = {"aceptado/válido","aceptado/valido","accepted","valid"}

def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("×","x")).strip(" .;,\t\r\n:").lower()

def clean_name(s):
    s = re.sub(r"\s+", " ", (s or "").replace("×","x")).strip(" .;,\t\r\n:")
    return s.replace(" ssp. ", " subsp. ")

def rank_norm(s):
    x = norm(s)
    return {"species":"Species","sp.":"Species","subspecies":"Subspecies","subsp.":"Subspecies","ssp.":"Subspecies","variety":"Variety","var.":"Variety","form":"Form","forma":"Form","f.":"Form","nothospecies":"Nothospecies","nothosubspecies":"Nothosubspecies"}.get(x, s or None)

def shape_rank(name):
    n = clean_name(name); low=f" {norm(n)} "; toks=n.split()
    if re.search(r"\b(?:sp\.|spp\.|gr\.)\b", low): return "OPEN_IDENTIFICATION"
    if " nothosubsp. " in low: return "Nothosubspecies"
    if " subsp. " in low: return "Subspecies"
    if " var. " in low: return "Variety"
    if " f. " in low: return "Form"
    if len(toks)>=3 and toks[1].lower()=="x" and re.match(r"^[a-z]", toks[2]): return "Nothospecies"
    if re.search(r"\s[x×]\s", name or ""): return "HYBRID_FORMULA"
    if len(toks)>=2 and re.match(r"^[A-ZÁÉÍÓÚÜÑ]",toks[0]) and re.match(r"^[a-záéíóúüñ]",toks[1]): return "Species"
    return "AMBIGUOUS"

def canonical_query(name):
    n=clean_name(name); r=shape_rank(n); toks=n.split()
    if r=="Species": return " ".join(toks[:2])
    if r=="Subspecies":
        for marker in ("subsp.","ssp."):
            if marker in toks:
                i=toks.index(marker)
                if i+1<len(toks): return f"{toks[0]} {toks[1]} subsp. {toks[i+1]}"
    if r=="Variety" and "var." in toks:
        i=toks.index("var.");
        if i+1<len(toks): return f"{toks[0]} {toks[1]} var. {toks[i+1]}"
    if r=="Form" and "f." in toks:
        i=toks.index("f.");
        if i+1<len(toks): return f"{toks[0]} {toks[1]} f. {toks[i+1]}"
    if r=="Nothospecies": return f"{toks[0]} x {toks[2]}"
    return n

def read_jsonl(path):
    with Path(path).open(encoding="utf-8") as f: return [json.loads(x) for x in f if x.strip()]
def write_jsonl(path,rows):
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True)
    with p.open("w",encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+"\n")
def write_json(path,obj):
    p=Path(path); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(obj,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
def file_sha(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()

def build_eidos(path):
    by_name=defaultdict(list); by_id=defaultdict(list); block=[]
    pats={k:re.compile(v) for k,v in {
      "taxonID":r'Darwin:taxonID\s+"([^"]+)"',"scientificName":r'Darwin:scientificName\s+"([^"]+)"',"genus":r'Darwin:genus\s+"([^"]+)"',"specificEpithet":r'Darwin:specificEpithet\s+"([^"]+)"',"infraspecificEpithet":r'Darwin:infraspecificEpithet\s+"([^"]+)"',"taxonRank":r'Darwin:taxonRank\s+"([^"]+)"',"taxonomicStatus":r'Darwin:taxonomicStatus\s+"([^"]+)"',"acceptedNameUsageID":r'Darwin:acceptedNameUsageID\s+"([^"]+)"',"nameAccordingTo":r'Darwin:nameAccordingTo\s+"([^"]+)"'}.items()}
    def emit(lines):
        if not lines:return
        txt="\n".join(lines); rec={}
        for k,p in pats.items():
            m=p.search(txt); rec[k]=m.group(1) if m else None
        if not rec["taxonID"] or not rec["scientificName"]: return
        rr=rank_norm(rec["taxonRank"]); g,s,i=rec["genus"],rec["specificEpithet"],rec["infraspecificEpithet"]
        can=None
        if g and s and rr=="Species": can=f"{g} {s}"
        elif g and s and i and rr=="Subspecies": can=f"{g} {s} subsp. {i}"
        elif g and s and i and rr=="Variety": can=f"{g} {s} var. {i}"
        elif g and s and i and rr=="Form": can=f"{g} {s} f. {i}"
        elif rr=="Nothospecies":
            m=re.match(r"^([A-ZÁÉÍÓÚÜÑA-Za-z.-]+)\s+[×x]\s*([a-záéíóúüñA-Za-z-]+)",rec["scientificName"])
            if m: can=f"{m.group(1)} x {m.group(2)}"
        if can is None: can=canonical_query(rec["scientificName"])
        rec["canonical"]=can; rec["rankNormalized"]=rr or shape_rank(can)
        by_name[norm(can)].append(rec); by_id[str(rec["taxonID"])].append(rec)
    with Path(path).open(encoding="utf-8",errors="replace") as f:
        for line in f:
            if not line.strip(): emit(block); block=[]
            else:block.append(line.rstrip("\n"))
        emit(block)
    return by_name,by_id

def is_accepted(r): return norm(r.get("taxonomicStatus")) in ACCEPTED_STATUS
def same_rank(r,required):
    rr=r.get("rankNormalized") or rank_norm(r.get("taxonRank"))
    if required=="HYBRID_FORMULA": return shape_rank(r.get("canonical") or r.get("scientificName"))=="HYBRID_FORMULA"
    return rr==required

def exact_lookup(by_name,alias,required):
    can=canonical_query(alias); recs=list(by_name.get(norm(can),[])); exact=[r for r in recs if norm(r.get("canonical"))==norm(can)]; same=[r for r in exact if same_rank(r,required)]; accepted=[r for r in same if is_accepted(r)]
    return {"alias":alias,"canonical":can,"aliasRank":shape_rank(alias),"recordCount":len(exact),"sameRankCount":len(same),"acceptedSameRankIds":sorted({str(r['taxonID']) for r in accepted}),"acceptedRecords":[{k:r.get(k) for k in ("taxonID","scientificName","taxonRank","taxonomicStatus","nameAccordingTo")} for r in accepted]}

def dedup_aliases(items):
    out=[];seen=set()
    for name,origin in items:
        if not name:continue
        c=canonical_query(name);k=norm(c)
        if not k or k in seen:continue
        seen.add(k);out.append((c,origin))
    return out

def hub_rank(row): return shape_rank(row.get("hub_display_name") or row.get("TAXON_DISPLAY_NAME") or "")
def parse_alias_field(value):
    if value is None:return []
    if isinstance(value,list):return [str(x).strip() for x in value if str(x).strip()]
    s=str(value).strip()
    if not s or s in ("[]","{}","null","None"):return []
    try:
        v=json.loads(s)
        if isinstance(v,list):return [str(x).strip() for x in v if str(x).strip()]
        if isinstance(v,str) and v.strip():return [v.strip()]
    except Exception:pass
    return [x.strip() for x in re.split(r"\s*[;|]\s*",s) if x.strip()]

def prior_06_guard(row):
    text=" ".join(str(row.get(k) or "") for k in ("state","finalCategory")); closure=row.get("closureIds") or []; guarded=row.get("guardedRelations") or []
    return {"priorState":row.get("state"),"priorFinalCategory":row.get("finalCategory"),"priorClosureIds":[str(x) for x in closure],"guardedRelationCount":len(guarded) if isinstance(guarded,list) else None,"hadPriorConflict":("CONFLICT" in text.upper()) or len(set(str(x) for x in closure))>1,"hadRankOrHybridGuard":any(x in text.upper() for x in ("RANK","HYBRID")) or bool(guarded)}

def process_new_temp(rows,final309,by_name):
    by_source={str(r.get("B_SOURCE_RECORD_ID")):r for r in final309}; results=[]
    for row in rows:
        name=row.get("hub_display_name") or ""; required=hub_rank(row); is_hybrid=required in ("HYBRID_FORMULA","Nothospecies","Nothosubspecies"); aliases=[(name,"RC3_HUB_DISPLAY_NAME")]; evrows=[]
        for sid in row.get("member_source_ids") or []:
            ev=by_source.get(str(sid))
            if not ev:continue
            evrows.append(ev)
            if ev.get("nameVerbatim"):aliases.append((ev["nameVerbatim"],f"ACTOR06_SOURCE:{sid}"))
            for q in ev.get("queries") or []:
                if q.get("closureEligible") is True and q.get("alias"):aliases.append((q["alias"],f"ACTOR06_CLOSURE_ELIGIBLE:{sid}:{q.get('origin')}"))
        aliases=dedup_aliases(aliases);lookups=[];rejected=[]
        for alias,origin in aliases:
            ar=shape_rank(alias)
            if is_hybrid and ar not in ("HYBRID_FORMULA","Nothospecies","Nothosubspecies"):
                rejected.append({"alias":alias,"origin":origin,"reason":"HYBRID_PARENT_OR_NONHYBRID_ALIAS_REJECTED"});continue
            if required not in ("AMBIGUOUS","OPEN_IDENTIFICATION","HYBRID_FORMULA") and ar!=required:
                rejected.append({"alias":alias,"origin":origin,"reason":"RANK_MISMATCH_REJECTED","requiredRank":required,"aliasRank":ar});continue
            x=exact_lookup(by_name,alias,required);x["origin"]=origin;lookups.append(x)
        ids=sorted({i for x in lookups for i in x["acceptedSameRankIds"]});guards=[prior_06_guard(x) for x in evrows]
        if required in ("AMBIGUOUS","OPEN_IDENTIFICATION"):state="UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH";oid=None
        elif len(ids)==1:state="OFFICIAL_ID_EXACT_ACCEPTED";oid=ids[0]
        elif len(ids)>1:state="CONFLICT_REVIEW_REQUIRED";oid=None
        else:state="TEMPORARY_JBLR_ID_VALID_AFTER_COMPLETED_OFFICIAL_SEARCH_WITH_NO_CONFIRMED_EXACT_ID";oid=None
        results.append({"TAXON_WORK_KEY":row["taxon_work_key"],"hub_display_name":name,"requiredRank":required,"originalTemporaryId":row.get("ID_TAXON_JBLR"),"member_source_ids":row.get("member_source_ids") or [],"actor06EvidenceRowsFound":len(evrows),"prior06Guards":guards,"priorConflictPreservedInEvidence":any(g["hadPriorConflict"] for g in guards),"priorRankOrHybridGuardPreservedInEvidence":any(g["hadRankOrHybridGuard"] for g in guards),"supportedAliasCount":len(aliases),"rejectedAliasEvidence":rejected,"exactEidosQueries":lookups,"currentAcceptedExactSameRankIds":ids,"terminal_state":state,"NATIONAL_ID":oid,"officialSearchComplete":True,"resolution_mode":"CURRENT_EIDOS_EXACT_OVER_ACCEPTED_ACTOR06_NAME_NETWORK","noFuzzy":True,"noParentIdInheritance":True,"noRankCollapse":True,"noHybridCollapse":True})
    return results

def process_new_official(rows,by_id):
    out=[]
    for row in rows:
        old=str(row.get("ID_TAXON_GOBIERNO") or row.get("ID_TAXON_JBLR") or "");required=hub_rank(row);recs=by_id.get(old,[]);accepted=[r for r in recs if is_accepted(r) and same_rank(r,required)]
        if accepted:state="OFFICIAL_ID_EXACT_ACCEPTED";contr=None
        elif recs:state="CONFLICT_REVIEW_REQUIRED";contr="CURRENT_EIDOS_ID_PRESENT_BUT_NOT_ACCEPTED_SAME_RANK"
        else:state="CONFLICT_REVIEW_REQUIRED";contr="CURRENT_EIDOS_ID_NOT_FOUND"
        out.append({"TAXON_WORK_KEY":row["taxon_work_key"],"hub_display_name":row.get("hub_display_name"),"requiredRank":required,"RC3_NATIONAL_ID":old,"terminal_state":state,"NATIONAL_ID":old,"resolution_mode":"REUSE_RC3_ACCEPTED","currentEidosRecords":[{k:r.get(k) for k in ("taxonID","scientificName","taxonRank","taxonomicStatus","nameAccordingTo")} for r in recs],"demonstratedContradiction":contr,"freshResearchPerformed":False})
    return out

def process_inherited(rows,by_id):
    out=[]
    for row in rows:
        oid=str(row.get("official_id") or "");required=rank_norm(row.get("source_rank")) or shape_rank(row.get("rioja_name") or "");recs=by_id.get(oid,[]);accepted=[r for r in recs if is_accepted(r) and same_rank(r,required)];names={norm(r.get("canonical")) for r in accepted};old={norm(x) for x in parse_alias_field(row.get("current_miteco_names"))}
        if accepted:state="SUPERSEDING_OFFICIAL_NAME_OBSERVED_NO_ID_CHANGE" if old and not names.intersection(old) else "CURRENT_EIDOS_RECONFIRMED_ADDITIVE"
        elif recs:state="CONTRADICTION_RANK_MISMATCH_PRESERVED_REVIEW"
        else:state="CURRENT_EIDOS_ID_NOT_FOUND_PRESERVE_EVIDENCE"
        out.append({**row,"current_reconciliation_state":state,"current_eidos_records":[{k:r.get(k) for k in ("taxonID","scientificName","taxonRank","taxonomicStatus","nameAccordingTo")} for r in recs],"evidenceMutation":"ADDITIVE_ONLY_ORIGINAL_PRESERVED"})
    return out

def process_historical(rows,by_name):
    out=[]
    for row in rows:
        qname=row["queue_name"];required=shape_rank(qname);aliases=[(qname,"QUEUE_CANONICAL_NAME")];hr=row.get("historical_row") if row.get("historical_exact_row_found") else None
        if hr:
            for col in ("TAX_POWO_WCVP","TAX_WFO","TAX_HISTORICOS"):
                for a in parse_alias_field(hr.get(col)):aliases.append((a,f"HISTORICAL_DOCUMENTED:{col}"))
            if str(hr.get("FUENTE_RELACION_SINONIMIA") or "").strip():
                for a in parse_alias_field(hr.get("SINONIMO_QUE_APORTA_ID")):aliases.append((a,"HISTORICAL_DOCUMENTED:SINONIMO_QUE_APORTA_ID"))
        aliases=dedup_aliases(aliases);lookups=[];rejected=[]
        for a,origin in aliases:
            ar=shape_rank(a)
            if required not in ("AMBIGUOUS","OPEN_IDENTIFICATION","HYBRID_FORMULA") and ar!=required:rejected.append({"alias":a,"origin":origin,"reason":"RANK_MISMATCH_REJECTED"});continue
            x=exact_lookup(by_name,a,required);x["origin"]=origin;lookups.append(x)
        ids=sorted({i for x in lookups for i in x["acceptedSameRankIds"]})
        if len(ids)==1:state="RESOLVED_CURRENT_OFFICIAL_ID";oid=ids[0]
        elif len(ids)>1:state="CONFLICT_REVIEW_REQUIRED";oid=None
        else:state="REVIEW_REMAINS_OPEN_NO_NEW_EXACT_OFFICIAL_ID";oid=None
        out.append({"queue_name":qname,"queue_state":row.get("queue_state"),"historical_exact_row_found":row.get("historical_exact_row_found"),"provenance_mismatch":row.get("provenance_mismatch"),"aliasesUsed":[{"name":a,"origin":o} for a,o in aliases],"rejectedAliases":rejected,"exactEidosQueries":lookups,"currentAcceptedExactSameRankIds":ids,"terminal_state":state,"NATIONAL_ID":oid})
    return out

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--inputs",required=True);ap.add_argument("--final309",required=True);ap.add_argument("--eidos",required=True);ap.add_argument("--out",required=True);ap.add_argument("--release-event",required=True);a=ap.parse_args();inp=Path(a.inputs);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    nt=read_jsonl(inp/"NEW_TEMP_261.jsonl");no=read_jsonl(inp/"NEW_OFFICIAL_562.jsonl");inh=read_jsonl(inp/"INHERITED_ID_EVIDENCE_1405_WITH_TWK.jsonl");hist=read_jsonl(inp/"HISTORICAL_REVIEW_ROWS_14.jsonl");f309=read_jsonl(a.final309)
    assert len(nt)==261 and len(no)==562 and len(inh)==1405 and len(hist)==14
    by_name,by_id=build_eidos(a.eidos);rt=process_new_temp(nt,f309,by_name);ro=process_new_official(no,by_id);ri=process_inherited(inh,by_id);rh=process_historical(hist,by_name);ext=ro+rt;assert len(ext)==823;bad=[r for r in ext if r["terminal_state"] not in ALLOWED_EXTENSION_STATES];assert not bad,bad[:3]
    write_jsonl(out/"NEW_TEMP_261_RESULTS.jsonl",rt);write_jsonl(out/"NEW_OFFICIAL_562_AUDIT.jsonl",ro);write_jsonl(out/"EXTENSION_823_RESULTS.jsonl",ext);write_jsonl(out/"INHERITED_EVIDENCE_1405_RECONCILED.jsonl",ri);write_json(out/"HISTORICAL_REVIEW_14_RESULTS.json",{"count":14,"rows":rh})
    ec=Counter(r["terminal_state"] for r in ext);tc=Counter(r["terminal_state"] for r in rt);oc=Counter(r["terminal_state"] for r in ro);hc=Counter(r["terminal_state"] for r in rh);ic=Counter(r["current_reconciliation_state"] for r in ri)
    counts={"extension823":dict(ec),"newTemp261":dict(tc),"newOfficial562":dict(oc),"historical14":dict(hc),"inheritedEvidence1405":dict(ic),"remainingTemporary":sum(r["terminal_state"]=="TEMPORARY_JBLR_ID_VALID_AFTER_COMPLETED_OFFICIAL_SEARCH_WITH_NO_CONFIRMED_EXACT_ID" for r in rt),"extensionConflicts":sum(r["terminal_state"]=="CONFLICT_REVIEW_REQUIRED" for r in ext),"historicalOpenOrConflict":sum(r["terminal_state"]!="RESOLVED_CURRENT_OFFICIAL_ID" for r in rh),"extensionUnresolved":sum(r["terminal_state"]=="UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH" for r in ext)};write_json(out/"FINAL_COUNTS.json",counts)
    ep=Path(a.eidos);receipt={"runClass":"STIME00_RC3_LIMITED_PRODUCTIVE_EXECUTION","releaseEvent":a.release_event,"scope":{"newTemp":261,"newOfficialReuseAudit":562,"extensionTotal":823,"historicalReviewQueue":14,"inheritedEvidence":1405},"currentEidos":{"bytes":ep.stat().st_size,"sha256":file_sha(ep)},"inputs":{p.name:{"bytes":p.stat().st_size,"sha256":file_sha(p)} for p in sorted(inp.glob("*.jsonl"))},"final309":{"path":str(a.final309),"bytes":Path(a.final309).stat().st_size,"sha256":file_sha(a.final309)},"counts":counts,"guards":{"doNotRerunAll3033":True,"hardGateAPolicy":"2210_OF_2210_NATIONAL_IDS_UNCHANGED","hardGateAReprovedInThisRun":False,"extensionGateB":"823_OF_823_AUDITABLE_TERMINAL_IDENTITY_STATE","noFuzzy":True,"noParentIdInheritance":True,"noRankCollapse":True,"noHybridCollapse":True,"sourceFailureNotFound":False,"neonWrites":0,"databaseWrites":0,"mutateRC2":False,"stime00FinalClose":False}};write_json(out/"RUN_RECEIPT.json",receipt)
    qa={"pass":True,"newTempProcessed":len(rt)==261,"newOfficialAudited":len(ro)==562,"extension823Accounted":len(ext)==823,"historical14Accounted":len(rh)==14,"inheritedEvidence1405Accounted":len(ri)==1405,"allExtensionStatesTerminalAllowed":not bad,"hardGateAReusedNotRerun":True,"doNotRerunAll3033":True,"neonWrites":0,"databaseWrites":0,"rc2Mutation":0,"stime00FinalClose":False};write_json(out/"QA_FINAL.json",qa);print(json.dumps({"qa":qa,"counts":counts,"eidosSha256":receipt["currentEidos"]["sha256"]},ensure_ascii=False))
if __name__=="__main__":main()
