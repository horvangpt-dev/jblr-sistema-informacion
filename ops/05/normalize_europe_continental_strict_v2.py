#!/usr/bin/env python3
"""Strict hybrid taxonomic normalization for European Red List of Vascular Plants 2011.

Valid evidence = (A) literal canonical-name matches from the publication, plus
(B) non-literal source names independently mapped through EIDOS accepted IDs to one
canonical JBLR concept. For remaining canonical taxa, NO_EVALUATION_FOUND is assigned
only when no unresolved source name remains in the same genus; otherwise UNKNOWN.
"""
from __future__ import annotations
import argparse,csv,json,unicodedata
from collections import Counter,defaultdict
from pathlib import Path
METHOD='AMENAZA_EUROPE_CONTINENTAL_2011_STRICT_v2'
def norm(s):
    s=' '.join(str(s or '').split());s=unicodedata.normalize('NFKD',s)
    return ''.join(ch for ch in s if not unicodedata.combining(ch)).replace('×','x').casefold()
def read(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write(p,rows):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),extrasaction='ignore');w.writeheader();w.writerows(rows)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--universe',required=True);ap.add_argument('--direct-evidence',required=True);ap.add_argument('--eidos-reconciliation',required=True);ap.add_argument('--eidos-evidence',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    universe=read(a.universe);direct=read(a.direct_evidence);recon=read(a.eidos_reconciliation);syn_ev=read(a.eidos_evidence);uby={int(r['universe_index']):r for r in universe};assert len(universe)==2742
    direct=[r for r in direct if norm(r.get('source_taxon'))==norm(r.get('input_taxon'))]
    added=[r for r in syn_ev if norm(r.get('source_taxon'))!=norm(r.get('input_taxon'))]
    evidence=[];seen=set()
    for r in direct:
        z=dict(r);z['validation_state']='SOURCE_PUBLICATION_EXACT_CANONICAL_NAME';z['uncertainty']='';key=(z['universe_index'],z['source_taxon'],z['territorial_scope'],z['category'])
        if key not in seen:seen.add(key);evidence.append(z)
    for r in added:
        z={'universe_index':r['universe_index'],'family':r['family'],'input_taxon':r['input_taxon'],'source_taxon':r['source_taxon'],'territorial_scope':r['territorial_scope'],'category':r['category'],'category_system':r['category_system'],'criteria':r['criteria'],'evaluation_year':r['evaluation_year'],'source':r['source'],'institution':r['institution'],'source_identifier':r['source_identifier'],'source_url':r['source_url'],'pdf_page':r['pdf_page'],'source_record_text':r['source_record_text'],'validation_state':r['validation_state'],'uncertainty':'','scoring_performed':'NO'};key=(z['universe_index'],z['source_taxon'],z['territorial_scope'],z['category'])
        if key not in seen:seen.add(key);evidence.append(z)
    unresolved_genera=set()
    for r in recon:
        if not str(r.get('universe_index','')).strip() and str(r.get('source_taxon','')).strip():unresolved_genera.add(str(r['source_taxon']).split()[0].casefold())
    counts=Counter(int(r['universe_index']) for r in evidence);summary=[]
    for idx,u in uby.items():
        if counts[idx]:state='VALID_SOURCE_EVIDENCE';unc=''
        elif u['taxon'].split()[0].casefold() in unresolved_genera:state='UNKNOWN';unc='UNRESOLVED_SOURCE_TAXON_EXISTS_IN_SAME_GENUS'
        else:state='NO_EVALUATION_FOUND';unc=''
        summary.append({'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'valid_evidence_records':counts[idx],'source_state':state,'uncertainty':unc})
    write(out/'evidence_records.csv',evidence);write(out/'taxon_summary.csv',summary)
    manifest={'method_version':METHOD,'source_records':1826,'exact_direct_taxa':len({r['universe_index'] for r in direct}),'accepted_id_synonym_taxa_added':len({r['universe_index'] for r in added}),'valid_evidence_records':len(evidence),'taxa_state_counts':dict(Counter(r['source_state'] for r in summary)),'scoring_performed':False,'absence_inference_performed':False}
    (out/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
