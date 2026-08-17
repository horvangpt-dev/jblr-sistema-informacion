#!/usr/bin/env python3
"""Regenerable AMENAZA scoring projection using working model v1.1.
Evidence is read-only; all selected assessments and calculations are emitted separately.
"""
from __future__ import annotations
import argparse,csv,json,re,statistics
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path

CURRENT_YEAR=2026

def read_csv(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write_csv(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def c(v):return ' '.join(str(v or '').split())
def year(*vals):
    for v in vals:
        m=re.search(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)',c(v))
        if m:return int(m.group(1))
    return None
def cat_code(v):
    x=c(v).upper()
    m=re.match(r'^(EX|EW|RE|CR|EN|VU|NT|LC|DD|NE|NA|FV|U1|U2|XX)\b',x)
    return m.group(1) if m else x

def system_key(r):
    s=(c(r.get('category_system'))+' '+c(r.get('source'))).casefold()
    if 'art. 17' in s or 'article 17' in s or 'dir. hábitats' in s or 'habitats directive' in s:return 'HABITATS_DIRECTIVE_ARTICLE_17'
    return 'IUCN'
def territory(r):
    scope=' '.join([c(r.get('territorial_scope')),c(r.get('country')),c(r.get('sub_country'))]).casefold()
    if 'la rioja' in scope:return 'LA_RIOJA'
    if 'mundial' in scope or 'global' in scope or 'world' in scope:return 'GLOBAL'
    if 'región mediterránea' in scope or 'region mediterranea' in scope or 'región atlántica' in scope or 'region atlantica' in scope or 'región alpina' in scope or 'region alpina' in scope:return 'SPAIN_BIOGEOGRAPHIC_REGION'
    if scope.strip() in {'europe','eu27','european union','eu'} or 'eu27' in scope:return 'EUROPE_CONTINENTAL_OR_EU27'
    if 'españa' in scope or 'spain' in scope or 'península' in scope or 'peninsula' in scope:
        return 'SPAIN_NATIONAL' if not c(r.get('sub_country')) else 'SPAIN_OTHER_SUBNATIONAL'
    if c(r.get('sub_country')):return 'OTHER_EUROPEAN_SUBNATIONAL'
    if c(r.get('country')):return 'OTHER_EUROPEAN_COUNTRY'
    return 'UNKNOWN_SCOPE'
def tfactor(y,m):
    t=m['temporal_relevance']
    if y is None:return t['date_unknown']
    a=max(0,CURRENT_YEAR-y)
    if a<=10:return t['age_0_10_years']
    if a<=20:return t['age_11_20_years']
    if a<=30:return t['age_21_30_years']
    if a<=40:return t['age_31_40_years']
    return t['age_over_40_years']
def unit(r):
    return (c(r.get('source_key') or r.get('source')),c(r.get('territorial_scope'))+'|'+c(r.get('country'))+'|'+c(r.get('sub_country')),c(r.get('category_system')),c(r.get('source_reference') or r.get('source_identifier')))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--evidence',required=True);ap.add_argument('--taxon-summary',required=True);ap.add_argument('--model',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    ev=read_csv(a.evidence);summ=read_csv(a.taxon_summary);m=json.load(open(a.model,encoding='utf-8')); by=defaultdict(list); excluded=[]
    for r in ev:
        if c(r.get('evidence_state'))!='VALID_SOURCE_EVIDENCE':continue
        sys=system_key(r);code=cat_code(r.get('category'));base=m['category_systems'].get(sys,{}).get(code,'MISSING')
        if base=='MISSING' or base is None:
            excluded.append({'universe_index':r.get('universe_index',''),'input_taxon':r.get('input_taxon',''),'source':r.get('source',''),'category_system':r.get('category_system',''),'source_category':r.get('category',''),'normalized_system':sys,'normalized_category':code,'reason':'NON_EVALUABLE_CATEGORY_OR_UNMAPPED'});continue
        tc=territory(r);yy=year(r.get('evaluation_year'),r.get('source_reference'));tw=m['territorial_relevance'][tc];tm=tfactor(yy,m)
        z=dict(r);z.update({'normalized_system':sys,'normalized_category':code,'base_severity':base,'territory_class':tc,'territorial_weight':tw,'evaluation_year_for_scoring':yy or '','temporal_weight':tm,'weighted_assessment_score':round(base*tw*tm,4),'logical_unit':json.dumps(unit(r),ensure_ascii=False)})
        by[int(r['universe_index'])].append(z)
    selected=[];results=[]
    for s in summ:
        idx=int(s['universe_index']);rs=by.get(idx,[]);groups=defaultdict(list)
        for r in rs:groups[r['logical_unit']].append(r)
        chosen=[]
        for _,pool in groups.items():
            dated=[r for r in pool if r['evaluation_year_for_scoring']!='']
            if dated:
                latest=max(int(r['evaluation_year_for_scoring']) for r in dated);pool2=[r for r in dated if int(r['evaluation_year_for_scoring'])==latest]
            else:pool2=pool
            cats=sorted({r['normalized_system']+':'+r['normalized_category'] for r in pool2});win=max(pool2,key=lambda r:r['weighted_assessment_score']);win=dict(win);win['same_unit_conflict']='YES' if len(cats)>1 else 'NO';win['same_unit_categories']=' | '.join(cats);win['selected_for_scoring']='YES';chosen.append(win);selected.append(win)
        if not chosen:
            results.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':'','score_state':'UNKNOWN','scoring_version':m['model_name'],'selected_logical_units':0,'max_weighted_assessment':'','corroboration_mean_top3':'','evidence_state':s.get('overall_evidence_state',''),'unresolved_conflict':s.get('unresolved_conflict','')});continue
        vals=sorted((r['weighted_assessment_score'] for r in chosen),reverse=True);top=vals[:m['aggregation']['corroboration_top_n']];mean=statistics.mean(top);score=m['aggregation']['max_component_weight']*vals[0]+m['aggregation']['corroboration_component_weight']*mean
        results.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':round(min(m['aggregation']['cap'],score),2),'score_state':'SCORED','scoring_version':m['model_name'],'selected_logical_units':len(chosen),'max_weighted_assessment':round(vals[0],2),'corroboration_mean_top3':round(mean,2),'evidence_state':s.get('overall_evidence_state',''),'unresolved_conflict':s.get('unresolved_conflict','')})
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True);write_csv(out/'amenaza_scores.csv',results,list(results[0].keys()));
    if selected:write_csv(out/'selected_assessments_for_scoring.csv',selected,list(selected[0].keys()))
    if excluded:write_csv(out/'non_evaluable_evidence_for_scoring.csv',excluded,list(excluded[0].keys()))
    manifest={'objective':'AMENAZA','scoring_version':m['model_name'],'model_status':m['model_status'],'taxon_universe':len(summ),'taxa_scored':sum(r['score_state']=='SCORED' for r in results),'taxa_unknown_score':sum(r['score_state']=='UNKNOWN' for r in results),'valid_evidence_rows_input':sum(c(r.get('evidence_state'))=='VALID_SOURCE_EVIDENCE' for r in ev),'non_evaluable_valid_evidence_rows':len(excluded),'selected_assessment_rows':len(selected),'evidence_modified':False,'generated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat()}
    (out/'scoring_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
