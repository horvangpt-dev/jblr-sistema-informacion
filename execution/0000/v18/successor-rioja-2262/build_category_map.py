import json
from pathlib import Path

SRC=Path('execution/0000/v17/successor-rioja-2262/preflight/ALL_309_REDUCED.jsonl')
OUT=Path('execution/0000/v18/successor-rioja-2262/CATEGORY_MAP_309_COMPACT.json')
rows=[]
with SRC.open(encoding='utf-8') as f:
    for line in f:
        if line.strip():
            rows.append(json.loads(line))
assert len(rows)==309
R={}
C=[]
U=[]
for x in rows:
    sid=str(x['B_SOURCE_RECORD_ID'])
    cat=x['finalCategory']
    if cat=='RESOLVED':
        tid=x.get('ID_TAXON_EXACT')
        assert tid not in (None,'')
        R[sid]=str(tid)
    elif cat=='CONFLICT':
        C.append(sid)
    elif cat=='UNRESOLVED':
        U.append(sid)
    else:
        raise AssertionError(cat)
assert len(R)==47 and len(C)==48 and len(U)==214
assert len(set(R)|set(C)|set(U))==309
payload={'schema':'JBLR_V18_CATEGORY_MAP_309_COMPACT_V1','R':R,'C':C,'U':U,'counts':{'R':47,'C':48,'U':214,'total':309}}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(json.dumps(payload['counts']))
