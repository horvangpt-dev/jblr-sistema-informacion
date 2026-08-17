#!/usr/bin/env python3
"""Strict taxonomic-concept layer for Database of European vascular plants red lists.

Preserves every source row. Rows whose original assessed name differs from the JBLR
canonical input are not automatically transferred as threat assessments, even if the
source backbone supplies that canonical name as accepted. They remain taxonomic
evidence but are marked TAXON_UNRESOLVED until independent concept identity is
validated. This prevents infraspecific assessments being silently promoted to species.
"""
from __future__ import annotations
import argparse,csv,json,unicodedata
from collections import Counter,defaultdict
from pathlib import Path

METHOD='EUROPE_NATIONAL_REDLISTS_STRICT_IDENTITY_v2'
def norm(s):
    s=' '.join(str(s or '').split());s=unicodedata.normalize('NFKD',s)
    return ''.join(ch for ch in s if not unicodedata.combining(ch)).replace('×','x').casefold()
def read(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write(p,rows):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--evidence',required=True);ap.add_argument('--summary',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    rows=read(a.evidence);old_summary=read(a.summary);changed=0
    for r in rows:
        if r.get('evidence_state')=='VALID_SOURCE_EVIDENCE' and norm(r.get('original_taxonomic_name'))!=norm(r.get('input_taxon')):
            r['evidence_state']='TAXON_UNRESOLVED';r['identity_state']='SOURCE_ACCEPTED_SYNONYM_NOT_INDEPENDENTLY_VALIDATED_FOR_CANONICAL_CONCEPT';changed+=1
    by=defaultdict(list)
    for r in rows:by[int(r['universe_index'])].append(r)
    summary=[]
    for s in old_summary:
        idx=int(s['universe_index']);rr=by[idx];valid=sum(r.get('evidence_state')=='VALID_SOURCE_EVIDENCE' for r in rr);unresolved=sum(r.get('evidence_state')=='TAXON_UNRESOLVED' for r in rr)
        state='VALID_SOURCE_EVIDENCE' if valid else ('TAXON_UNRESOLVED' if unresolved else 'NO_EVALUATION_FOUND')
        z=dict(s);z['valid_evidence_rows']=valid;z['taxonomically_unresolved_rows']=unresolved;z['source_state']=state;summary.append(z)
    write(out/'evidence_records.csv',rows);write(out/'taxon_summary.csv',summary)
    counts=Counter(r['source_state'] for r in summary)
    manifest={'method_version':METHOD,'source_rows':len(rows),'downgraded_synonym_mapped_rows':changed,'valid_evidence_rows':sum(r.get('evidence_state')=='VALID_SOURCE_EVIDENCE' for r in rows),'taxonomically_unresolved_rows':sum(r.get('evidence_state')=='TAXON_UNRESOLVED' for r in rows),'taxa_state_counts':dict(counts),'scoring_performed':False,'source_rows_preserved':True,'reason':'Threat assessment of a source taxon is not automatically transferable to a differently named canonical taxon concept without independent taxonomic identity validation.'}
    (out/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
