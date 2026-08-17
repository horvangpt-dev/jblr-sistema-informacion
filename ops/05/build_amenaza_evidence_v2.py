#!/usr/bin/env python3
"""Build consolidated, source-preserving AMENAZA evidence v2 for all 2,742 taxa.

The consolidated layer standardizes fields but does not replace source-specific RAW or
normalized datasets. Source limitations propagate conservatively into overall states.
"""
from __future__ import annotations
import argparse,csv,json,re
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path

METHOD_VERSION='AMENAZA_EVIDENCE_v2'
CANONICAL={'VALID_SOURCE_EVIDENCE','NO_EVALUATION_FOUND','TAXON_UNRESOLVED','SOURCE_ERROR','UNKNOWN','UNRESOLVED_CONFLICT'}

def now():return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
def c(v):return ' '.join(str(v or '').split())
def read_csv(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write_csv(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def y(*vals):
    for v in vals:
        m=re.search(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)',c(v))
        if m:return m.group(1)
    return ''

def base_row(idx,fam,taxon,source_key,source,institution):
    return {'universe_index':idx,'family':fam,'input_taxon':taxon,'source_key':source_key,'source':source,'institution':institution,'source_taxon':'','accepted_source_taxon':'','accepted_taxon_id':'','territorial_scope':'','country':'','sub_country':'','category':'','category_system':'','evaluation_year':'','criteria':'','source_reference':'','source_identifier':'','source_url':'','validation_state':'','taxonomic_state':'','evidence_state':'','uncertainty':'','raw_record_json':'','consulted_at':''}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--universe',required=True);ap.add_argument('--eidos-dir',required=True);ap.add_argument('--europe-national-dir',required=True);ap.add_argument('--europe-continental-dir');ap.add_argument('--rioja-csv',required=True);ap.add_argument('--source-registry',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    universe=read_csv(a.universe);assert len(universe)==2742
    uby={int(r['universe_index']):r for r in universe}
    all_ev=[]; source_state=defaultdict(dict); unresolved_external=[]

    # EIDOS
    ed=Path(a.eidos_dir); es=read_csv(ed/'taxon_summary.csv');ee=read_csv(ed/'evidence_records.csv');er=read_csv(ed/'taxon_reconciliation.csv');assert len(es)==len(er)==2742
    for s in es:
        st=c(s.get('evidence_state')).replace('NO_EVALUATION_FOUND_IN_EIDOS','NO_EVALUATION_FOUND')
        source_state[int(s['universe_index'])]['EIDOS']=st
    for r in ee:
        idx=int(r['universe_index']);z=base_row(idx,r.get('family',''),r.get('input_taxon',''),'EIDOS',r.get('source') or 'IEPNB / EIDOS',r.get('institution') or 'MITECO / IEPNB')
        z.update({'source_taxon':r.get('source_queried_name',''),'accepted_source_taxon':r.get('accepted_source_taxon',''),'accepted_taxon_id':r.get('accepted_taxon_id',''),'territorial_scope':r.get('territorial_scope',''),'category':r.get('category',''),'category_system':r.get('category_system',''),'evaluation_year':r.get('evaluation_year',''),'criteria':r.get('criteria',''),'source_identifier':r.get('dataset_id',''),'source_url':r.get('source_url',''),'validation_state':r.get('validation_state',''),'taxonomic_state':'ACCEPTED_IDENTITY_RESOLVED','evidence_state':'VALID_SOURCE_EVIDENCE','uncertainty':r.get('uncertainty',''),'raw_record_json':r.get('evidence_structured_json',''),'consulted_at':r.get('consulted_at','')});all_ev.append(z)

    # Europe national/subnational database
    nd=Path(a.europe_national_dir);ns=read_csv(nd/'taxon_summary.csv');ne=read_csv(nd/'evidence_records.csv');assert len(ns)==2742
    for s in ns:
        raw=c(s.get('source_state'))
        if raw in {'EVIDENCE_FOUND','VALID_SOURCE_EVIDENCE'}:st='VALID_SOURCE_EVIDENCE'
        elif raw in {'TAXONOMICALLY_UNRESOLVED_ONLY','TAXON_UNRESOLVED'}:st='TAXON_UNRESOLVED'
        elif raw in {'SOURCE_ERROR'}:st='SOURCE_ERROR'
        else:st='NO_EVALUATION_FOUND'
        source_state[int(s['universe_index'])]['EUROPE_NATIONAL_REDLISTS']=st
    for r in ne:
        idx=int(r['universe_index']);evstate=c(r.get('evidence_state'))
        z=base_row(idx,r.get('family',''),r.get('input_taxon',''),'EUROPE_NATIONAL_REDLISTS',r.get('source_dataset') or 'Database of European vascular plants red lists','Scientific Data / Figshare')
        z.update({'source_taxon':r.get('original_taxonomic_name',''),'accepted_source_taxon':r.get('accepted_taxonomic_name',''),'territorial_scope':r.get('territorial_scope_type',''),'country':r.get('country',''),'sub_country':r.get('sub_country',''),'category':r.get('standardized_category') or r.get('red_list_category',''),'category_system':r.get('category_system',''),'evaluation_year':y(r.get('reference')),'source_reference':r.get('reference',''),'source_identifier':r.get('database_id',''),'source_url':r.get('source_url',''),'validation_state':r.get('identity_state',''),'taxonomic_state':r.get('match_basis',''),'evidence_state':evstate,'uncertainty':'' if evstate=='VALID_SOURCE_EVIDENCE' else 'SOURCE_RECORD_MATCHED_BY_NAME_BUT_ACCEPTED_TAXONOMIC_IDENTITY_UNRESOLVED','raw_record_json':json.dumps(r,ensure_ascii=False,sort_keys=True),'consulted_at':r.get('consulted_at','')});all_ev.append(z)

    # Europe continental reconciled, if available.
    if a.europe_continental_dir:
        cd=Path(a.europe_continental_dir);cs=read_csv(cd/'taxon_summary.csv');ce=read_csv(cd/'evidence_records.csv');assert len(cs)==2742
        for s in cs:source_state[int(s['universe_index'])]['EUROPE_CONTINENTAL_2011']=c(s.get('source_state'))
        for r in ce:
            idx=int(r['universe_index']);z=base_row(idx,r.get('family',''),r.get('input_taxon',''),'EUROPE_CONTINENTAL_2011',r.get('source') or 'European Red List of Vascular Plants',r.get('institution') or 'European Commission / IUCN')
            z.update({'source_taxon':r.get('source_taxon',''),'territorial_scope':r.get('territorial_scope',''),'category':r.get('category',''),'category_system':r.get('category_system',''),'evaluation_year':r.get('evaluation_year',''),'criteria':r.get('criteria',''),'source_identifier':r.get('source_identifier',''),'source_url':r.get('source_url',''),'validation_state':r.get('validation_state',''),'taxonomic_state':'SOURCE_NAME_RECONCILED_THROUGH_EIDOS_ACCEPTED_IDENTITY','evidence_state':'VALID_SOURCE_EVIDENCE','raw_record_json':r.get('source_record_text',''),'consulted_at':r.get('consulted_at','')});all_ev.append(z)

    # Rioja: available publication is explicitly partial; unmatched canonical taxa are UNKNOWN for this source.
    rio=read_csv(a.rioja_csv)
    for idx in uby:source_state[idx]['RIOJA_RED_BOOK']='UNKNOWN'
    for r in rio:
        if c(r.get('universe_index')):
            idx=int(r['universe_index']);st=c(r.get('evidence_state')) or 'UNKNOWN';source_state[idx]['RIOJA_RED_BOOK']=st
            z=base_row(idx,r.get('family',''),r.get('input_taxon',''),'RIOJA_RED_BOOK',r.get('source',''),r.get('source_institution',''))
            z.update({'source_taxon':r.get('source_taxon',''),'accepted_source_taxon':r.get('accepted_source_taxon',''),'territorial_scope':r.get('territorial_scope',''),'category':r.get('category',''),'category_system':r.get('category_system',''),'evaluation_year':r.get('publication_year',''),'source_reference':r.get('source_reference',''),'source_url':r.get('source_url',''),'validation_state':r.get('taxonomic_resolution_state',''),'taxonomic_state':r.get('taxonomic_resolution_state',''),'evidence_state':st,'uncertainty':r.get('uncertainty',''),'consulted_at':'2026-08-17'});all_ev.append(z)
        else:unresolved_external.append(dict(r,source_key='RIOJA_RED_BOOK'))

    # True conflict detection is limited to same source/scope/version/reference logical unit.
    groups=defaultdict(list)
    for r in all_ev:
        if r['evidence_state']!='VALID_SOURCE_EVIDENCE' or not c(r['category']):continue
        key=(r['universe_index'],r['source_key'],c(r['territorial_scope']),c(r['country']),c(r['sub_country']),c(r['category_system']),c(r['evaluation_year']),c(r['source_reference']) or c(r['source_identifier']))
        groups[key].append(r)
    conflicts=[]; conflict_taxa=set()
    for key,rs in groups.items():
        cats=sorted({c(r['category']) for r in rs if c(r['category'])})
        if len(cats)>1:
            idx=int(key[0]);conflict_taxa.add(idx);conflicts.append({'universe_index':idx,'input_taxon':uby[idx]['taxon'],'source_key':key[1],'logical_unit':json.dumps(key[2:],ensure_ascii=False),'categories':' | '.join(cats),'state':'UNRESOLVED_CONFLICT'})

    valid_counts=Counter(int(r['universe_index']) for r in all_ev if r['evidence_state']=='VALID_SOURCE_EVIDENCE')
    unresolved_counts=Counter(int(r['universe_index']) for r in all_ev if r['evidence_state']=='TAXON_UNRESOLVED')
    summary=[]
    for idx,u in uby.items():
        states=source_state[idx]
        if idx in conflict_taxa:overall='UNRESOLVED_CONFLICT'
        elif valid_counts[idx]>0:overall='VALID_SOURCE_EVIDENCE'
        elif 'SOURCE_ERROR' in states.values():overall='SOURCE_ERROR'
        elif unresolved_counts[idx]>0 or 'TAXON_UNRESOLVED' in states.values():overall='TAXON_UNRESOLVED'
        elif 'UNKNOWN' in states.values():overall='UNKNOWN'
        else:overall='NO_EVALUATION_FOUND'
        assert overall in CANONICAL
        summary.append({'universe_index':idx,'genus':u.get('genus',''),'family':u['family'],'input_taxon':u['taxon'],'overall_evidence_state':overall,'valid_evidence_records_total':valid_counts[idx],'unresolved_evidence_records_total':unresolved_counts[idx],'unresolved_conflict':'YES' if idx in conflict_taxa else 'NO','eidos_state':states.get('EIDOS','UNKNOWN'),'europe_national_state':states.get('EUROPE_NATIONAL_REDLISTS','UNKNOWN'),'europe_continental_state':states.get('EUROPE_CONTINENTAL_2011','UNKNOWN' if a.europe_continental_dir else 'SOURCE_NOT_INTEGRATED'),'rioja_state':states.get('RIOJA_RED_BOOK','UNKNOWN'),'global_direct_iucn_state':'SOURCE_NOT_ACQUIRED_AUTH_REQUIRED','uncertainty':' | '.join([x for x in [('RIOJA_COMPLETE_DATASET_NOT_ACCESSIBLE' if states.get('RIOJA_RED_BOOK')=='UNKNOWN' else ''),('DIRECT_IUCN_NOT_ACQUIRED' if valid_counts[idx]==0 else '')] if x])})

    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    fields=list(base_row('','','','','','').keys());write_csv(out/'evidence_records.csv',all_ev,fields);write_csv(out/'taxon_summary.csv',summary,list(summary[0].keys()));write_csv(out/'conflicts.csv',conflicts,['universe_index','input_taxon','source_key','logical_unit','categories','state'])
    if unresolved_external:write_csv(out/'source_records_taxon_unresolved_outside_universe.csv',unresolved_external,list(unresolved_external[0].keys()))
    registry=read_csv(a.source_registry);write_csv(out/'source_registry.csv',registry,list(registry[0].keys()))
    counts=Counter(r['overall_evidence_state'] for r in summary)
    manifest={'objective':'AMENAZA','stage':'VALIDATED_EVIDENCE','evidence_version':METHOD_VERSION,'taxon_universe':2742,'evidence_records_total':len(all_ev),'taxa_with_valid_evidence':counts['VALID_SOURCE_EVIDENCE'],'taxa_with_unknown':counts['UNKNOWN'],'taxa_with_unresolved_conflict':counts['UNRESOLVED_CONFLICT'],'taxa_with_taxon_unresolved':counts['TAXON_UNRESOLVED'],'taxa_with_source_error':counts['SOURCE_ERROR'],'taxa_no_evaluation_found':counts['NO_EVALUATION_FOUND'],'state_counts':dict(counts),'source_keys_integrated':sorted({r['source_key'] for r in all_ev}),'source_registry_rows':len(registry),'scoring_performed':False,'absence_inference_performed':False,'generated_at':now()}
    assert sum(counts.values())==2742
    (out/'evidence_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
