#!/usr/bin/env python3
"""Rebuild AMENAZA_EIDOS_EVIDENCE_v2 normalized tables exclusively from cached EIDOS RAW.

No network access. No scoring. Intended to reuse a complete RAW acquisition while
excluding any previously generated normalized tables from the validated milestone.
Fails closed if required RAW records are absent for a resolved taxon.
"""
from __future__ import annotations

import argparse, csv, hashlib, json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from amenaza_eidos import (
    as_rows, compact_ws, is_accepted, pick_candidate, accepted_taxon_id,
    returned_name, safe_int, choose_accepted_identity, query_variants,
    SOURCE_NAME, SOURCE_INSTITUTION,
)

METHOD_VERSION = "AMENAZA_EIDOS_EVIDENCE_v2_RAW_RENORMALIZED"


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def csv_write(path: Path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--universe", required=True)
    ap.add_argument("--raw-root", required=True, help="Root containing raw/taxonomy_by_name, raw/taxonomy_by_id, raw/conservation")
    ap.add_argument("--out", required=True)
    a=ap.parse_args()
    raw_root=Path(a.raw_root); out=Path(a.out); out.mkdir(parents=True, exist_ok=True)
    with open(a.universe, encoding="utf-8-sig", newline="") as f:
        universe=list(csv.DictReader(f))
    assert len(universe)==2742, len(universe)

    recon=[]; evidence=[]; summary=[]; failures=[]
    consulted_values=[]
    for u in universe:
        idx=int(u["universe_index"]); taxon=compact_ws(u["taxon"]); family=compact_ws(u.get("family"))
        name_file=raw_root/"raw"/"taxonomy_by_name"/f"{idx:04d}_{hashlib.sha1(taxon.encode()).hexdigest()[:12]}.json"
        if not name_file.exists():
            failures.append(f"missing taxonomy_by_name raw for {idx} {taxon}"); continue
        nr=read_json(name_file); consulted_values.append(compact_ws(nr.get("consulted_at")))
        candidates=[]; query_errors=[]
        for q in nr.get("queries", []):
            if q.get("error"):
                query_errors.append(compact_ws(q.get("error")))
            candidates.extend(as_rows(q.get("payload")))
        unique=[]; seen=set()
        for cand in candidates:
            token=json.dumps(cand, ensure_ascii=False, sort_keys=True, default=str)
            if token not in seen: seen.add(token); unique.append(cand)
        chosen, match_state=pick_candidate(taxon, unique)
        source_queried_name=returned_name(chosen) if chosen else ""
        source_nametype=compact_ws(chosen.get("nametype")) if chosen else ""
        source_nameid=safe_int(chosen.get("nameid")) if chosen else None
        accepted_id=accepted_taxon_id(chosen) if chosen else None
        reconciliation_state="SOURCE_ERROR" if query_errors and not unique else match_state

        accepted_name=""; accepted_identity_state="NOT_RESOLVED"; accepted_identity_error=""
        if accepted_id is not None and reconciliation_state in ("EXACT_ACCEPTED","EXACT_NAME_NON_ACCEPTED"):
            id_file=raw_root/"raw"/"taxonomy_by_id"/f"{accepted_id}.json"
            if not id_file.exists():
                failures.append(f"missing taxonomy_by_id raw for {idx} {taxon} accepted_id={accepted_id}")
            else:
                ir=read_json(id_file); id_rows=as_rows(ir.get("payload")); accepted_name,accepted_identity_state=choose_accepted_identity(id_rows,accepted_id)
        if is_accepted(chosen or {}) and not accepted_name:
            accepted_name=source_queried_name
            if accepted_identity_state=="NOT_RESOLVED": accepted_identity_state="ACCEPTED_BY_NAME_RESPONSE"

        recon.append({
            "universe_index":idx,"family":family,"input_taxon":taxon,"query_variants":" | ".join(query_variants(taxon)),
            "candidate_count":len(unique),"reconciliation_state":reconciliation_state,"source_queried_name":source_queried_name,
            "source_nametype":source_nametype,"source_nameid":source_nameid or "","accepted_taxon_id":accepted_id or "",
            "accepted_source_taxon":accepted_name,"accepted_identity_state":accepted_identity_state,"query_errors":" | ".join(query_errors),
            "accepted_identity_error":accepted_identity_error,"taxonomy_by_name_raw_file":str(name_file.relative_to(raw_root)),
            "consulted_at":compact_ws(nr.get("consulted_at")),
        })

        evidence_count=0; conservation_error=""
        if accepted_id is not None and reconciliation_state in ("EXACT_ACCEPTED","EXACT_NAME_NON_ACCEPTED"):
            cf=raw_root/"raw"/"conservation"/f"{accepted_id}.json"
            if not cf.exists():
                failures.append(f"missing conservation raw for {idx} {taxon} accepted_id={accepted_id}")
            else:
                cr=read_json(cf); cons_url=compact_ws(cr.get("url")); cons_rows=as_rows(cr.get("payload"))
                for crec in cons_rows:
                    evidence_count+=1
                    evidence.append({
                        "universe_index":idx,"family":family,"input_taxon":taxon,"source_queried_name":source_queried_name,
                        "accepted_source_taxon":accepted_name,"accepted_taxon_id":accepted_id,"source":SOURCE_NAME,
                        "institution":SOURCE_INSTITUTION,
                        "territorial_scope":compact_ws(crec.get("aplicaa") or crec.get("aplicacion") or crec.get("ambito") or crec.get("ámbito")),
                        "category":compact_ws(crec.get("categoriaconservacion") or crec.get("conservacion") or crec.get("categoria") or crec.get("categoría")),
                        "category_system":compact_ws(crec.get("autoridad") or crec.get("sistema")),
                        "evaluation_year":compact_ws(crec.get("anio") or crec.get("año") or crec.get("year")),
                        "criteria":compact_ws(crec.get("criterios") or crec.get("criteria")),"dataset_id":compact_ws(crec.get("iddataset")),
                        "category_id":compact_ws(crec.get("idcategoria")),"scope_id":compact_ws(crec.get("idaplicaa")),
                        "authority_id":compact_ws(crec.get("idautoridad")),"validity":compact_ws(crec.get("vigencia")),
                        "is_current_source_record":compact_ws(crec.get("idvigente")),"source_record_date_added":compact_ws(crec.get("fechaalta")),
                        "source_record_date_removed":compact_ws(crec.get("fechabaja")),"source_url":cons_url,
                        "evidence_structured_json":json.dumps(crec,ensure_ascii=False,sort_keys=True),
                        "consulted_at":compact_ws(cr.get("consulted_at")),"validation_state":"SOURCE_STRUCTURED_RECORD",
                        "uncertainty":"" if accepted_name else "ACCEPTED_SOURCE_NAME_UNRESOLVED","raw_file":str(cf.relative_to(raw_root)),
                    })
        if reconciliation_state=="SOURCE_ERROR" or conservation_error: estate="SOURCE_ERROR"
        elif accepted_id is None: estate="TAXON_UNRESOLVED"
        elif evidence_count==0: estate="NO_EVALUATION_FOUND_IN_EIDOS"
        else: estate="VALID_SOURCE_EVIDENCE"
        summary.append({
            "universe_index":idx,"family":family,"input_taxon":taxon,"reconciliation_state":reconciliation_state,
            "source_queried_name":source_queried_name,"accepted_taxon_id":accepted_id or "","accepted_source_taxon":accepted_name,
            "accepted_identity_state":accepted_identity_state,"evidence_records":evidence_count,"evidence_state":estate,
            "conservation_query_error":conservation_error,"consulted_at":compact_ws(nr.get("consulted_at")),
        })

    assert not failures, "RAW completeness failures: " + " ; ".join(failures[:20])
    assert len(summary)==len(recon)==2742
    assert {int(r['universe_index']) for r in summary}==set(range(1,2743))
    assert all(r['territorial_scope'] and r['category'] and r['category_system'] and r['evaluation_year'] for r in evidence)

    rf=["universe_index","family","input_taxon","query_variants","candidate_count","reconciliation_state","source_queried_name","source_nametype","source_nameid","accepted_taxon_id","accepted_source_taxon","accepted_identity_state","query_errors","accepted_identity_error","taxonomy_by_name_raw_file","consulted_at"]
    ef=["universe_index","family","input_taxon","source_queried_name","accepted_source_taxon","accepted_taxon_id","source","institution","territorial_scope","category","category_system","evaluation_year","criteria","dataset_id","category_id","scope_id","authority_id","validity","is_current_source_record","source_record_date_added","source_record_date_removed","source_url","evidence_structured_json","consulted_at","validation_state","uncertainty","raw_file"]
    sf=["universe_index","family","input_taxon","reconciliation_state","source_queried_name","accepted_taxon_id","accepted_source_taxon","accepted_identity_state","evidence_records","evidence_state","conservation_query_error","consulted_at"]
    csv_write(out/"taxon_reconciliation.csv",recon,rf); csv_write(out/"evidence_records.csv",evidence,ef); csv_write(out/"taxon_summary.csv",summary,sf)
    manifest={
        "objective":"AMENAZA","stage":"EVIDENCE_COLLECTION","method_version":METHOD_VERSION,"source":SOURCE_NAME,
        "taxa_attempted":2742,"evidence_records":len(evidence),"evidence_state_counts":dict(Counter(r['evidence_state'] for r in summary)),
        "reconciliation_state_counts":dict(Counter(r['reconciliation_state'] for r in recon)),
        "accepted_identity_state_counts":dict(Counter(r['accepted_identity_state'] for r in summary)),
        "raw_reuse_only":True,"network_calls":0,"scoring_performed":False,"absence_inference_performed":False,"generated_at":now(),
    }
    (out/"run_manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding="utf-8")
    print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))

if __name__=="__main__": main()
