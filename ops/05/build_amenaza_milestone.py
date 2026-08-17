#!/usr/bin/env python3
"""Build JBLR 05 AMENAZA evidence milestone from validated source outputs.

This is an evidence consolidator only. It does not score, weight, rank or select a
prevalent territorial assessment. Multiple valid assessments are preserved.
"""
from __future__ import annotations

import argparse, csv, json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

METHOD_VERSION = "AMENAZA_EVIDENCE_MILESTONE_v1"


def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def read_csv(p):
    with open(p, encoding="utf-8-sig", newline="") as f: return list(csv.DictReader(f))

def write_csv(p, rows, fields):
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8-sig", newline="") as f:
        w=csv.DictWriter(f, fieldnames=fields, extrasaction="ignore"); w.writeheader(); w.writerows(rows)

def nonempty(s): return str(s or "").strip()


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--universe",required=True)
    ap.add_argument("--eidos",required=True)
    ap.add_argument("--europe",required=True)
    ap.add_argument("--out",required=True)
    a=ap.parse_args(); out=Path(a.out); out.mkdir(parents=True,exist_ok=True)

    universe=read_csv(a.universe); assert len(universe)==2742
    eidos=Path(a.eidos); europe=Path(a.europe)
    eidos_summary=read_csv(eidos/"taxon_summary.csv"); eidos_evidence=read_csv(eidos/"evidence_records.csv"); eidos_recon=read_csv(eidos/"taxon_reconciliation.csv")
    eur_summary=read_csv(europe/"taxon_summary.csv"); eur_evidence=read_csv(europe/"evidence_records.csv")
    assert len(eidos_summary)==len(eidos_recon)==len(eur_summary)==2742
    eidos_by={int(r['universe_index']):r for r in eidos_summary}; eur_by={int(r['universe_index']):r for r in eur_summary}
    assert set(eidos_by)==set(eur_by)==set(range(1,2743))

    # Evidence-level conflict detection. Different territories, authorities, years or
    # references are deliberately NOT collapsed into a conflict.
    conflict_taxa=set(); conflict_rows=[]
    g=defaultdict(set)
    for r in eidos_evidence:
        key=(r['universe_index'], 'EIDOS', nonempty(r.get('territorial_scope')), nonempty(r.get('category_system')), nonempty(r.get('evaluation_year')), nonempty(r.get('dataset_id')))
        g[key].add(nonempty(r.get('category')))
    for r in eur_evidence:
        if r.get('evidence_state')!='VALID_SOURCE_EVIDENCE': continue
        key=(r['universe_index'], 'EUROPE_NATIONAL_REDLISTS', nonempty(r.get('country')), nonempty(r.get('sub_country')), nonempty(r.get('reference')))
        g[key].add(nonempty(r.get('standardized_category') or r.get('red_list_category')))
    for key,cats in g.items():
        cats={c for c in cats if c}
        if len(cats)>1:
            idx=int(key[0]); conflict_taxa.add(idx); conflict_rows.append({'universe_index':idx,'conflict_key':json.dumps(key[1:],ensure_ascii=False),'categories':' | '.join(sorted(cats)),'conflict_state':'UNRESOLVED_CONFLICT'})

    eidos_counts=Counter(int(r['universe_index']) for r in eidos_evidence)
    eur_valid_counts=Counter(int(r['universe_index']) for r in eur_evidence if r.get('evidence_state')=='VALID_SOURCE_EVIDENCE')
    eur_unresolved_counts=Counter(int(r['universe_index']) for r in eur_evidence if r.get('evidence_state')=='TAXON_UNRESOLVED')
    rows=[]
    for u in universe:
        idx=int(u['universe_index']); es=eidos_by[idx]; us=eur_by[idx]
        valid=eidos_counts[idx]+eur_valid_counts[idx]
        unresolved=(es.get('evidence_state')=='TAXON_UNRESOLVED') or eur_unresolved_counts[idx]>0
        source_error=es.get('evidence_state')=='SOURCE_ERROR'
        if idx in conflict_taxa: state='UNRESOLVED_CONFLICT'
        elif valid>0: state='EVIDENCE_FOUND'
        elif source_error: state='SOURCE_ERROR'
        elif unresolved: state='TAXON_UNRESOLVED'
        else: state='NO_EVALUATION_FOUND_IN_SEARCHED_SOURCES'
        uncertainties=[]
        if source_error: uncertainties.append('EIDOS_SOURCE_ERROR')
        if unresolved: uncertainties.append('TAXONOMIC_IDENTITY_UNRESOLVED_IN_AT_LEAST_ONE_SOURCE')
        if idx in conflict_taxa: uncertainties.append('CONTRADICTORY_CATEGORIES_WITHIN_SAME_SOURCE_SCOPE_VERSION_KEY')
        if valid==0: uncertainties.append('NO_VALID_EVIDENCE_LOCATED_IN_STRUCTURED_SOURCES_SEARCHED')
        rows.append({
            'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'overall_evidence_state':state,
            'valid_evidence_records_total':valid,'eidos_valid_records':eidos_counts[idx],'eidos_state':es.get('evidence_state',''),
            'eidos_reconciliation_state':es.get('reconciliation_state',''),'eidos_accepted_source_taxon':es.get('accepted_source_taxon',''),
            'europe_national_valid_records':eur_valid_counts[idx],'europe_national_unresolved_records':eur_unresolved_counts[idx],
            'europe_national_state':us.get('source_state',''),'europe_national_countries':us.get('country_list',''),
            'unresolved_conflict':'YES' if idx in conflict_taxa else 'NO','uncertainty':' | '.join(uncertainties),
        })
    fields=list(rows[0].keys()); write_csv(out/'taxon_summary.csv',rows,fields)
    write_csv(out/'conflicts.csv',conflict_rows,['universe_index','conflict_key','categories','conflict_state'])
    # Keep validated source tables as separate milestone files rather than flattening them.
    for src,dst in [(eidos/'evidence_records.csv',out/'evidence_eidos.csv'),(eidos/'taxon_reconciliation.csv',out/'reconciliation_eidos.csv'),(europe/'evidence_records.csv',out/'evidence_europe_national.csv')]:
        dst.write_bytes(src.read_bytes())

    state_counts=Counter(r['overall_evidence_state'] for r in rows)
    manifest={
        'objective':'AMENAZA','stage':'EVIDENCE_COLLECTION','method_version':METHOD_VERSION,'taxon_universe':2742,
        'taxa_with_valid_evidence':sum(r['valid_evidence_records_total']>0 for r in rows),
        'taxa_with_unknown':sum(r['overall_evidence_state']=='UNKNOWN' for r in rows),
        'taxa_with_unresolved_conflict':len(conflict_taxa),'taxa_with_taxon_unresolved':state_counts['TAXON_UNRESOLVED'],
        'taxa_with_source_error':state_counts['SOURCE_ERROR'],'taxa_no_evaluation_found_in_searched_sources':state_counts['NO_EVALUATION_FOUND_IN_SEARCHED_SOURCES'],
        'overall_state_counts':dict(state_counts),'eidos_evidence_records':len(eidos_evidence),'europe_national_valid_evidence_records':sum(r.get('evidence_state')=='VALID_SOURCE_EVIDENCE' for r in eur_evidence),
        'scoring_performed':False,'weighting_performed':False,'absence_inference_performed':False,'generated_at':now(),
    }
    (out/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))

if __name__=='__main__': main()
