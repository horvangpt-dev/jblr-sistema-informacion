#!/usr/bin/env python3
"""Score consolidated AMENAZA evidence using versioned working model v1.

Input evidence remains untouched. The output is a projection that can be regenerated
from the same evidence with any future scoring model.
"""
from __future__ import annotations
import argparse,csv,json,re,statistics
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path

SCORING_VERSION='AMENAZA_SCORING_MODEL_v1'
CURRENT_YEAR=2026

def read_csv(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write_csv(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def compact(v):return ' '.join(str(v or '').split())
def upper(v):return compact(v).upper()
def year_from(*vals):
    for v in vals:
        m=re.search(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)',compact(v))
        if m:return int(m.group(1))
    return None

def territory_class(r):
    scope=' '.join([compact(r.get('territorial_scope')),compact(r.get('country')),compact(r.get('sub_country')),compact(r.get('territorial_scope_type'))]).casefold()
    if 'la rioja' in scope:return 'LA_RIOJA'
    if 'global' in scope or 'world' in scope or 'mundial' in scope:return 'GLOBAL'
    if scope.strip() in {'europe','eu27','european union','eu'} or 'eu27' in scope:return 'EUROPE_CONTINENTAL_OR_EU27'
    if 'spain' in scope or 'españa' in scope:
        sub=compact(r.get('sub_country')).casefold()
        if sub and sub not in {'spain','españa'}:return 'SPAIN_OTHER_SUBNATIONAL'
        return 'SPAIN_NATIONAL'
    if compact(r.get('sub_country')):return 'OTHER_EUROPEAN_SUBNATIONAL'
    if compact(r.get('country')):return 'OTHER_EUROPEAN_COUNTRY'
    # EIDOS sometimes describes state/national scope without country string.
    if any(x in scope for x in ['nacional','national','estatal']):return 'SPAIN_NATIONAL'
    if any(x in scope for x in ['autonóm','autonom','regional','subnational']):return 'SPAIN_OTHER_SUBNATIONAL'
    return 'UNKNOWN_SCOPE'

def time_factor(y,model):
    if y is None:return model['temporal_relevance']['date_unknown']
    age=max(0,CURRENT_YEAR-y)
    if age<=10:return model['temporal_relevance']['age_0_10_years']
    if age<=20:return model['temporal_relevance']['age_11_20_years']
    if age<=30:return model['temporal_relevance']['age_21_30_years']
    if age<=40:return model['temporal_relevance']['age_31_40_years']
    return model['temporal_relevance']['age_over_40_years']

def category(r):
    for k in ('category','standardized_category','red_list_category'):
        c=upper(r.get(k))
        if c:return c
    return ''

def logical_unit(r):
    return (
        compact(r.get('source') or r.get('source_dataset')),
        compact(r.get('territorial_scope') or r.get('country'))+'|'+compact(r.get('sub_country')),
        compact(r.get('category_system') or r.get('authority')),
        compact(r.get('dataset_id') or r.get('reference') or r.get('source_identifier') or r.get('database_id')),
    )

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--evidence',required=True);ap.add_argument('--taxon-summary',required=True);ap.add_argument('--model',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    evidence=read_csv(a.evidence);summary=read_csv(a.taxon_summary);model=json.load(open(a.model,encoding='utf-8'))
    sev=model['category_severity'];tw=model['territorial_relevance'];by=defaultdict(list)
    for r in evidence:
        idx=int(r['universe_index']);c=category(r);base=sev.get(c)
        if base is None:continue
        tc=territory_class(r);y=year_from(r.get('evaluation_year'),r.get('publication_year'),r.get('publication_date'),r.get('reference'))
        assessment=dict(r);assessment.update({'normalized_category':c,'category_severity':base,'territory_class':tc,'territorial_weight':tw[tc],'evaluation_year_for_scoring':y or '','temporal_weight':time_factor(y,model)})
        assessment['weighted_assessment_score']=round(base*tw[tc]*assessment['temporal_weight'],4)
        assessment['logical_unit']=json.dumps(logical_unit(r),ensure_ascii=False)
        by[idx].append(assessment)
    projection=[];selected=[]
    for s in summary:
        idx=int(s['universe_index']);records=by.get(idx,[])
        # Select latest year inside each logical unit. Unknown-year records are retained only if no dated record exists in that unit.
        units=defaultdict(list)
        for r in records:units[r['logical_unit']].append(r)
        chosen=[]
        for unit,rs in units.items():
            dated=[r for r in rs if r['evaluation_year_for_scoring']!='']
            if dated:
                latest=max(int(r['evaluation_year_for_scoring']) for r in dated);pool=[r for r in dated if int(r['evaluation_year_for_scoring'])==latest]
            else:pool=rs
            # Same-unit same-version conflict: use precautionary max in scoring projection, preserve all rows through conflict flag.
            maxscore=max(r['weighted_assessment_score'] for r in pool)
            winner=max(pool,key=lambda r:r['weighted_assessment_score']);winner=dict(winner)
            cats=sorted({r['normalized_category'] for r in pool});winner['same_unit_conflict']='YES' if len(cats)>1 else 'NO';winner['same_unit_categories']=' | '.join(cats);winner['selected_for_scoring']='YES'
            chosen.append(winner);selected.append(winner)
        if not chosen:
            projection.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':'','score_state':'UNKNOWN','scoring_version':SCORING_VERSION,'evaluable_assessments':0,'selected_logical_units':0,'max_weighted_assessment':'','corroboration_mean_top3':'','unresolved_conflict':s.get('unresolved_conflict',''),'evidence_state':s.get('overall_evidence_state') or s.get('evidence_state') or 'UNKNOWN'})
            continue
        vals=sorted([r['weighted_assessment_score'] for r in chosen],reverse=True);top=vals[:model['aggregation']['corroboration_top_n']]
        score=model['aggregation']['max_component_weight']*vals[0]+model['aggregation']['corroboration_component_weight']*statistics.mean(top);score=min(model['aggregation']['cap'],score)
        projection.append({'universe_index':idx,'family':s.get('family',''),'input_taxon':s.get('input_taxon',''),'amenaza_score':round(score,2),'score_state':'SCORED','scoring_version':SCORING_VERSION,'evaluable_assessments':len(records),'selected_logical_units':len(chosen),'max_weighted_assessment':round(vals[0],2),'corroboration_mean_top3':round(statistics.mean(top),2),'unresolved_conflict':s.get('unresolved_conflict',''),'evidence_state':s.get('overall_evidence_state') or s.get('evidence_state') or ''})
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    write_csv(out/'amenaza_scores.csv',projection,list(projection[0].keys()))
    if selected:write_csv(out/'selected_assessments_for_scoring.csv',selected,list(selected[0].keys()))
    manifest={'objective':'AMENAZA','scoring_version':SCORING_VERSION,'model_status':'WORKING_ANALYTICAL_MODEL','taxon_universe':len(summary),'taxa_scored':sum(r['score_state']=='SCORED' for r in projection),'taxa_unknown_score':sum(r['score_state']=='UNKNOWN' for r in projection),'source_evidence_rows_input':len(evidence),'scoring_projection_rows':len(projection),'evidence_modified':False,'generated_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat()}
    (out/'scoring_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
