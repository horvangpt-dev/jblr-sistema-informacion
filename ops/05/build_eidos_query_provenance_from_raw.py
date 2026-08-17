#!/usr/bin/env python3
"""Reconstruct query provenance ledger from cached EIDOS RAW evidence without requery.

HTTP status/headers were not captured by the original v2 client. They are explicitly
recorded as NOT_CAPTURED_PRE_QUERY_PROVENANCE_POLICY rather than inferred.
"""
from __future__ import annotations
import argparse,csv,hashlib,json
from pathlib import Path

METHOD='EIDOS_QUERY_PROVENANCE_RECONSTRUCTED_FROM_RAW_v1'
NOT_CAPTURED='NOT_CAPTURED_PRE_QUERY_PROVENANCE_POLICY'

def sha_file(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def write_csv(p,rows,fields):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--eidos-dir',required=True);ap.add_argument('--collector-commit',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    d=Path(a.eidos_dir);out=Path(a.out);out.mkdir(parents=True,exist_ok=True);rows=[]
    for p in sorted((d/'raw'/'taxonomy_by_name').glob('*.json')):
        obj=json.loads(p.read_text(encoding='utf-8'));idx=obj['universe_index'];taxon=obj['input_taxon'];ts=obj.get('consulted_at','')
        for q in obj.get('queries',[]):
            payload=q.get('payload');payload_hash=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest() if 'payload' in q else ''
            rows.append({'universe_index':idx,'input_taxon':taxon,'query_type':'TAXON_BY_NAME','endpoint':'obtenertaxonespornombre','query_value':q.get('query_variant',''),'url':q.get('url',''),'accepted_taxon_id':'','consulted_at':ts,'raw_file':str(p.relative_to(d)),'raw_file_sha256':sha_file(p),'payload_canonical_sha256':payload_hash,'http_status':NOT_CAPTURED,'rate_limit':NOT_CAPTURED,'error':q.get('error',''),'collector_commit':a.collector_commit,'provenance_method':METHOD})
    for sub,qtype,endpoint in [('taxonomy_by_id','TAXON_BY_ID','obtenertaxonporid'),('conservation','CONSERVATION_BY_TAXON_ID','obtenerestadosconservacionportaxonid')]:
        for p in sorted((d/'raw'/sub).glob('*.json')):
            obj=json.loads(p.read_text(encoding='utf-8'));aid=str(obj.get('accepted_id') or obj.get('accepted_taxon_id') or p.stem);payload=obj.get('payload')
            payload_hash=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest() if 'payload' in obj else ''
            rows.append({'universe_index':obj.get('universe_index',''),'input_taxon':obj.get('input_taxon',''),'query_type':qtype,'endpoint':endpoint,'query_value':aid,'url':obj.get('url',''),'accepted_taxon_id':aid,'consulted_at':obj.get('consulted_at',''),'raw_file':str(p.relative_to(d)),'raw_file_sha256':sha_file(p),'payload_canonical_sha256':payload_hash,'http_status':NOT_CAPTURED,'rate_limit':NOT_CAPTURED,'error':'','collector_commit':a.collector_commit,'provenance_method':METHOD})
    fields=['universe_index','input_taxon','query_type','endpoint','query_value','url','accepted_taxon_id','consulted_at','raw_file','raw_file_sha256','payload_canonical_sha256','http_status','rate_limit','error','collector_commit','provenance_method']
    write_csv(out/'query_provenance.csv',rows,fields)
    manifest={'method':METHOD,'rows':len(rows),'http_status_state':NOT_CAPTURED,'rate_limit_state':NOT_CAPTURED,'external_requeries':0,'collector_commit':a.collector_commit}
    (out/'query_provenance_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2,sort_keys=True),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,sort_keys=True))
if __name__=='__main__':main()
