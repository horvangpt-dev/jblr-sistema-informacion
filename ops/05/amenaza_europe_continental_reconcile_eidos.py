#!/usr/bin/env python3
"""Reconcile European Red List 2011 source taxa through EIDOS accepted identities.

This is a source-taxonomy reconciliation layer. It queries EIDOS only for the 1,826
source names from the European publication; canonical JBLR names are NOT requeried.
Positive evidence is joined through accepted EIDOS IDs. Negative source states are
conservative: if unresolved source names remain in the same genus, a canonical taxon
without a match is UNKNOWN rather than NO_EVALUATION_FOUND.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,re,time,unicodedata
from collections import Counter,defaultdict
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.parse import quote
from urllib.request import Request,urlopen

NAME_ENDPOINT='https://iepnb.gob.es:443/api/especie/rpc/obtenertaxonespornombre?_nombretaxon='
METHOD_VERSION='AMENAZA_EUROPE_CONTINENTAL_2011_EIDOS_RECON_v1'
SOURCE='European Red List of Vascular Plants'
SOURCE_URL='https://doi.org/10.2779/8515'
USER_AGENT='JBLR-05-Analytical-Evidence/1.0'
VALID_RECON={'EXACT_ACCEPTED','EXACT_NAME_NON_ACCEPTED'}

def now(): return datetime.now(timezone.utc).replace(microsecond=0).isoformat()
def compact(v): return ' '.join(str(v or '').split())
def norm(s):
    s=compact(s); s=unicodedata.normalize('NFKD',s); return ''.join(c for c in s if not unicodedata.combining(c)).casefold()
def genus(s): return compact(s).split()[0].casefold() if compact(s) else ''
def sha(b): return hashlib.sha256(b).hexdigest()
def read_csv(p):
    with open(p,encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def write_csv(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def as_rows(x):
    if isinstance(x,list):return x
    if isinstance(x,dict):
        for k in ('data','result','results','items'):
            if isinstance(x.get(k),list):return x[k]
        return [x] if x else []
    return []
def cname(r):
    return compact(r.get('name') or r.get('nombre') or r.get('scientificname') or r.get('scientificName'))
def nametype(r): return compact(r.get('nametype') or r.get('tiponombre') or r.get('name_type'))
def aid(r): return compact(r.get('acceptednameid') or r.get('accepted_name_id') or r.get('acceptedtaxonid'))
def nid(r): return compact(r.get('nameid') or r.get('idtaxon') or r.get('taxonid'))

def fetch_one(source_taxon):
    url=NAME_ENDPOINT+quote(source_taxon,safe='')
    last=None
    for attempt in range(5):
        started=now(); status=''; body=b''; headers={}
        try:
            req=Request(url,headers={'User-Agent':USER_AGENT,'Accept':'application/json'})
            with urlopen(req,timeout=45) as resp:
                status=getattr(resp,'status',200);headers=dict(resp.headers.items());body=resp.read()
            payload=json.loads(body.decode('utf-8'))
            return source_taxon,payload,{'source_taxon':source_taxon,'endpoint':NAME_ENDPOINT,'query_parameter':'_nombretaxon','query_value':source_taxon,'url':url,'requested_at':started,'completed_at':now(),'http_status':status,'response_sha256':sha(body),'response_bytes':len(body),'rate_limit_limit':headers.get('X-RateLimit-Limit',''),'rate_limit_remaining':headers.get('X-RateLimit-Remaining',''),'rate_limit_reset':headers.get('X-RateLimit-Reset',''),'attempt':attempt+1,'error':'','api_version':'UNVERSIONED_ENDPOINT','script_method_version':METHOD_VERSION}
        except HTTPError as e:
            try:body=e.read()
            except Exception:body=b''
            last=f'HTTPError:{e.code}:{e.reason}'; status=e.code
            if e.code not in (408,425,429) and e.code<500:break
        except (URLError,TimeoutError,json.JSONDecodeError) as e:last=f'{type(e).__name__}:{e}'
        time.sleep(min(8,2**attempt))
    return source_taxon,None,{'source_taxon':source_taxon,'endpoint':NAME_ENDPOINT,'query_parameter':'_nombretaxon','query_value':source_taxon,'url':url,'requested_at':started,'completed_at':now(),'http_status':status,'response_sha256':sha(body) if body else '','response_bytes':len(body),'rate_limit_limit':'','rate_limit_remaining':'','rate_limit_reset':'','attempt':5,'error':last or 'UNKNOWN_ERROR','api_version':'UNVERSIONED_ENDPOINT','script_method_version':METHOD_VERSION}

def resolve(source_taxon,payload):
    rows=as_rows(payload); exact=[r for r in rows if norm(cname(r))==norm(source_taxon)]
    if not exact:return {'state':'TAXON_UNRESOLVED','accepted_id':'','source_returned_name':'','nameid':'','nametype':'','candidate_count':len(rows)}
    accepted=[]
    for r in exact:
        accepted_id=aid(r) or nid(r)
        if accepted_id:accepted.append((accepted_id,r))
    ids=sorted({x[0] for x in accepted})
    if len(ids)!=1:return {'state':'TAXON_UNRESOLVED','accepted_id':'','source_returned_name':' | '.join(sorted({cname(r) for r in exact if cname(r)})),'nameid':'','nametype':'','candidate_count':len(rows)}
    selected=next(r for x,r in accepted if x==ids[0])
    state='EXACT_ACCEPTED' if (aid(selected) in ('',nid(selected)) or nametype(selected).casefold() in {'accepted','aceptado','accepted name'}) else 'EXACT_NAME_NON_ACCEPTED'
    return {'state':state,'accepted_id':ids[0],'source_returned_name':cname(selected),'nameid':nid(selected),'nametype':nametype(selected),'candidate_count':len(rows)}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source-records',required=True);ap.add_argument('--canonical-reconciliation',required=True);ap.add_argument('--universe',required=True);ap.add_argument('--out',required=True);ap.add_argument('--workers',type=int,default=4);a=ap.parse_args()
    src=read_csv(a.source_records); canon=read_csv(a.canonical_reconciliation); universe=read_csv(a.universe)
    assert len(src)==1826 and len(canon)==len(universe)==2742
    canon_by_id=defaultdict(list)
    for r in canon:
        if r.get('reconciliation_state') in VALID_RECON and compact(r.get('accepted_taxon_id')):
            canon_by_id[compact(r['accepted_taxon_id'])].append(int(r['universe_index']))
    uby={int(r['universe_index']):r for r in universe}
    cache={};qlog=[]
    names=sorted({r['source_taxon'] for r in src})
    with ThreadPoolExecutor(max_workers=max(1,min(a.workers,6))) as ex:
        futs={ex.submit(fetch_one,n):n for n in names}
        for i,f in enumerate(as_completed(futs),1):
            n,p,prov=f.result();cache[n]=p;qlog.append(prov)
            if i%200==0 or i==len(names):print(json.dumps({'source_name_queries_done':i,'total':len(names)},ensure_ascii=False),flush=True)
    recon=[]; unresolved_genera=set(); mapped=defaultdict(list)
    for s in src:
        rr=resolve(s['source_taxon'],cache.get(s['source_taxon'])) if cache.get(s['source_taxon']) is not None else {'state':'SOURCE_ERROR','accepted_id':'','source_returned_name':'','nameid':'','nametype':'','candidate_count':0}
        idxs=canon_by_id.get(rr['accepted_id'],[]) if rr['accepted_id'] else []
        if len(idxs)==1: final='ACCEPTED_ID_TO_CANONICAL'; idx=idxs[0];mapped[idx].append(s)
        elif len(idxs)>1: final='UNRESOLVED_MULTIPLE_CANONICAL_INPUTS_FOR_ACCEPTED_ID';idx='';unresolved_genera.add(genus(s['source_taxon']))
        else: final=rr['state'] if rr['state']!='EXACT_ACCEPTED' and rr['state']!='EXACT_NAME_NON_ACCEPTED' else 'ACCEPTED_ID_NOT_PRESENT_IN_CANONICAL_UNIVERSE';idx='';unresolved_genera.add(genus(s['source_taxon']))
        recon.append({'source_taxon':s['source_taxon'],'source_family':s.get('source_family',''),'pdf_page':s.get('pdf_page',''),'source_reconciliation_state':rr['state'],'source_returned_name':rr['source_returned_name'],'source_nameid':rr['nameid'],'source_nametype':rr['nametype'],'accepted_taxon_id':rr['accepted_id'],'canonical_mapping_state':final,'universe_index':idx,'input_taxon':uby[idx]['taxon'] if idx else '','candidate_count':rr['candidate_count']})
    evidence=[]
    for idx,recs in mapped.items():
        u=uby[idx]
        for s in recs:
            for scope,cat,criteria in [('Europe',s['europe_category'],s.get('europe_criteria','')),('EU27',s['eu27_category'],s.get('eu27_criteria',''))]:
                evidence.append({'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'source_taxon':s['source_taxon'],'territorial_scope':scope,'category':cat,'category_system':'IUCN Red List Categories and Criteria','criteria':criteria,'evaluation_year':'2011','source':SOURCE,'institution':'European Commission / IUCN','source_identifier':'10.2779/8515','source_url':SOURCE_URL,'pdf_page':s.get('pdf_page',''),'source_record_text':s.get('source_record_text',''),'validation_state':'SOURCE_PUBLICATION_RECORD_TAXONOMICALLY_RECONCILED_BY_EIDOS','uncertainty':'','scoring_performed':'NO'})
    counts=Counter(int(r['universe_index']) for r in evidence); summary=[]
    for idx,u in uby.items():
        if counts[idx]: state='VALID_SOURCE_EVIDENCE'
        elif genus(u['taxon']) in unresolved_genera: state='UNKNOWN'
        else: state='NO_EVALUATION_FOUND'
        summary.append({'universe_index':idx,'family':u['family'],'input_taxon':u['taxon'],'valid_evidence_records':counts[idx],'source_state':state,'uncertainty':'UNRESOLVED_SOURCE_TAXON_EXISTS_IN_SAME_GENUS' if state=='UNKNOWN' else ''})
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    write_csv(out/'taxon_reconciliation.csv',recon,list(recon[0].keys()));write_csv(out/'evidence_records.csv',evidence,list(evidence[0].keys()));write_csv(out/'taxon_summary.csv',summary,list(summary[0].keys()));write_csv(out/'query_provenance.csv',qlog,list(qlog[0].keys()))
    manifest={'objective':'AMENAZA','source':SOURCE,'method_version':METHOD_VERSION,'source_records':len(src),'source_names_queried':len(names),'canonical_taxa_with_valid_evidence':sum(1 for r in summary if r['source_state']=='VALID_SOURCE_EVIDENCE'),'canonical_taxa_unknown_due_source_taxonomy':sum(1 for r in summary if r['source_state']=='UNKNOWN'),'canonical_taxa_no_evaluation_found':sum(1 for r in summary if r['source_state']=='NO_EVALUATION_FOUND'),'valid_evidence_records':len(evidence),'unresolved_source_genera':len(unresolved_genera),'scoring_performed':False,'generated_at':now()}
    (out/'run_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8');print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
