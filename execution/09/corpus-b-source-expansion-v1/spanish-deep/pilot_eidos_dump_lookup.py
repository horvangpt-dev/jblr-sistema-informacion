#!/usr/bin/env python3
import json, sys, hashlib
from pathlib import Path

aliases=Path(sys.argv[1])
ttl=Path(sys.argv[2])
out=Path(sys.argv[3])
doc=json.loads(aliases.read_text(encoding='utf-8'))
targets=[]
for row in doc['rows']:
    targets.append((row['B_SOURCE_RECORD_ID'], row['original'], 'ORIGINAL'))
    for n in row['names']:
        targets.append((row['B_SOURCE_RECORD_ID'], n, 'SPANISH_DOCUMENTED_NAME'))
lines=ttl.read_text(encoding='utf-8', errors='replace').splitlines()
results=[]
for bid,name,kind in targets:
    hits=[]
    for i,line in enumerate(lines):
        if name in line:
            a=max(0,i-8); b=min(len(lines),i+9)
            hits.append({'line':i+1,'context':lines[a:b]})
            if len(hits)>=10: break
    results.append({'B_SOURCE_RECORD_ID':bid,'name':name,'kind':kind,'hit_count_capped':len(hits),'hits':hits})
receipt={
  'source':'OFFICIAL_MITECO_EIDOS_OPEN_DATA_TTL',
  'source_url':'https://datos.iepnb.es/datasets/eidos.ttl',
  'ttl_bytes':ttl.stat().st_size,
  'ttl_sha256':hashlib.sha256(ttl.read_bytes()).hexdigest(),
  'target_count':len(targets),
  'targets_with_literal_hits':sum(1 for r in results if r['hits']),
  'rows':results,
  'semantics':'LITERAL_HIT_IS_EVIDENCE_POINTER_ONLY;ID_EXTRACTION_REQUIRES_GRAPH_CONTEXT_VALIDATION'
}
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'ttl_bytes':receipt['ttl_bytes'],'target_count':len(targets),'targets_with_literal_hits':receipt['targets_with_literal_hits']}))
