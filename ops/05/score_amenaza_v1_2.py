#!/usr/bin/env python3
"""Regenerable AMENAZA scoring projection using working model v1.2."""
from __future__ import annotations
import argparse,csv,json,re,statistics
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path
CURRENT_YEAR=2026

def read(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write(p,rows):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]),extrasaction='ignore');w.writeheader();w.writerows(rows)
def c(v):return ' '.join(str(v or '').split())
def cat(v):
    m=re.match(r'^(REW|EX|EW|RE|CR|EN|VU|NT|LC|DD|NE|NA|FV|U1|U2|XX)\b',c(v).upper());return m.group(1) if m else c(v).upper()
def system(r):
    s=(c(r.get('category_system'))+' '+c(r.get('source'))).casefold()
    return 'HABITATS_DIRECTIVE_ARTICLE_17' if ('art. 17' in s or 'article 17' in s or 'dir. hábitats' in s) else 'IUCN'
def territory(r):
    s=' '.join([c(r.get('territorial_scope')),c(r.get('country')),c(r.get('sub_country'))]).casefold()
    if 'la rioja' in s:return 'LA_RIOJA'
    if any(x in s for x in ('mundial','global','world')):return 'GLOBAL'
    if any(x in s for x in ('región mediterránea','region mediterranea','región atlántica','region atlantica','región alpina','region alpina')):return 'SPAIN_BIOGEOGRAPHIC_REGION'
    if s.strip() in {'europe','eu27','european union','eu'} or 'eu27' in s:return 'EUROPE_CONTINENTAL_OR_EU27'
    if any(x in s for x in ('españa','spain','península','peninsula')):return 'SPAIN_NATIONAL' if not c(r.get('sub_country')) else 'SPAIN_OTHER_SUBNATIONAL'
    if c(r.get('sub_country')):return 'OTHER_EUROPEAN_SUBNATIONAL'
    if c(r.get('country')):return 'OTHER_EUROPEAN_COUNTRY'
    return 'UNKNOWN_SCOPE'
def evyear(r):
    for v in (r.get('evaluation_year'),r.get('source_reference')):
        m=re.search(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)',c(v))
        if m:return int(m.group(1))
    return None
def time_weight(y,m):
    t=m['temporal_relevance']
    if y is None:return t['date_unknown']
    age=max(0,CURRENT_YEAR-y)
    if age<=10:return t['age_0_10_years']
    if age<=20:return t['age_11_20_years']
    if age<=30:return t['age_21_30_years']
    if age<=40:return t['age_31_40_years']
    return t['age_over_40_years']
def logical_unit(r):return (c(r.get('source_key') or r.get('source')),c(r.get('territorial_scope'))+'|'+c(r.get('country'))+'|'+c(r.get('sub_country')),c(r.get('category_system')),c(r.get('source_reference') or r.get('source_identifier')))
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--evidence',required=True);ap.add_argument('--taxon-summary',required=True);ap.add_argument('--model',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    evidence=read(a.evidence);summary=read(a.taxon_summary);model=json.load(open(a.model,encoding='utf-8'));by=defaultdict(list);excluded=[]
    for r in evidence:
        if c(r.get('evidence_state'))!='VALID_SOURCE_EVIDENCE':continue
        sys=system(r);code=cat(r.get('category'));base=model['category_systems'].get(sys,{}).get(code,'MISSING')
        if base=='MISSING' or base is None:
            excluded.append({'universe_index':r.get('universe_index',''),'input_taxon':r.get('input_taxon',''),'source':r.get('source',''),'category_system':r.get('category_system',''),'source_category':r.get('category',''),'normalized_system':sys,'normalized_category':code,'reason':'NON_EVALUABLE_CATEGORY_OR_UNMAPPED'});continue
        terr=territory(r);year=evyear(r);z=dict(r);z.update({'normalized_system':sys,'normalized_category':code,'base_severity':base,'territory_class':terr,'territorial_weight':model['territorial_relevance'][terr],'evaluation_year_for_scoring':year or '','temporal_weight':time_weight(year,model)});z['weighted_assessment_score']=round(base*z['territorial_weight']*z['temporal_weight'],4);z['logical_unit']=json.dumps(logical_unit(r),ensure_ascii=False);by[int(r['universe_index'])].append(z)
    selected=[];results=[]
    for s in summary:
        idx=int(s['universe_index']);groups=defaultdict(list)
        for r in by[idx]:groups[r['logical_unit']].append(r)
        chosen=[]
        for _,pool in groups.items():
            dated=[r for r in pool if r['evaluation_year_for_scoring']!='']
            if dated:
                latest=max(int(r['evaluation_year_for_scoring']) for r in dated);pool=[r for r in dated if int(r['evaluation_year_for_scoring'])==latest]
            cats=sorted({r['normalized_system']+':'+r['normalized_category'] for r in pool});win=dict(max(pool,key=lambda x:x['weighted_assessment_score']));win['same_unit_conflict']='YES' if len(cats)>1 else 'NO';win['same_unit_categories']=' | '.join(cats);win['selected_for_scoring']='YES';chosen.append(win);selected.append(win)
        if not chosen:
            results.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':'','score_state':'UNKNOWN','scoring_version':model['model_name'],'selected_logical_units':0,'max_weighted_assessment':'','corroboration_mean_top3':'','evidence_state':s.get('overall_evidence_state',''),'unresolved_conflict':s.get('unresolved_conflict','')});continue
        vals=sorted((r['weighted_assessment_score'] for r in chosen),reverse=True);top=vals[:model['aggregation']['corroboration_top_n']];mean=statistics.mean(top);score=model['aggregation']['max_component_weight']*vals[0]+model['aggregation']['corroboration_component_weight']*mean
        results.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':round(min(model['aggregation']['cap'],score),2),'score_state':'SCORED','scoring_version':model['model_name'],'selected_logical_units':len(chosen),'max_weighted_assessment':round(vals[0],2),'corroboration_mean_top3':round(mean,2),'evidence_state':s.get('overall_evidence_state',''),'unresolved_conflict':s.get('unresolved_conflict','')})
    write(out/'amenaza_scores.csv',results);write(out/'selected_assessments_for_scoring.csv',selected)
    if excluded:write(out/'non_evaluable_evidence_for_scoring.csv',excluded)
    manifest={'objective':'AMENAZA','scoring_version':model['model_name'],'model_status':model['model_status'],'taxon_universe':len(summary),'taxa_scored':sum(r['score_state']=='SCORED' for r in results),'taxa_unknown_score':sum(r['score_state']=='UNKNOWN' for r in results),'valid_evidence_rows_input':sum(c(r.get('evidence_state'))=='VALID_SOURCE_EVIDENCE' for r in evidence),'non_evaluable_valid_evidence_rows':len(excluded),'selected_assessment_rows':len(selected),'evidence_modified':False,'generated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat()}
    (out/'scoring_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
