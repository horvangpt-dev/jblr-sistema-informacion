import json, hashlib
from pathlib import Path

SRC = Path('execution/06/v17/synonym-system-309/runs/FINAL_CONSOLIDATED_309_V17/CONSOLIDATED_309.jsonl')
OUTDIR = Path('execution/0000/v17/successor-rioja-2262/preflight')
OUTDIR.mkdir(parents=True, exist_ok=True)

rows=[]
with SRC.open(encoding='utf-8') as f:
    for line in f:
        if line.strip():
            x=json.loads(line)
            rows.append({
                'position309': x['position309'],
                'B_SOURCE_RECORD_ID': str(x['B_SOURCE_RECORD_ID']),
                'nameVerbatim': x['nameVerbatim'],
                'sourceRank': x.get('sourceRank'),
                'isHybrid': bool(x.get('isHybrid')),
                'finalCategory': x['finalCategory'],
                'ID_TAXON_EXACT': x.get('ID_TAXON_EXACT'),
                'closureIds': x.get('closureIds', []),
                'state': x.get('state'),
                'evidenceBatchPath': x.get('evidenceBatchPath'),
            })

assert len(rows)==309
assert sorted(r['position309'] for r in rows)==list(range(1,310))
assert len({r['B_SOURCE_RECORD_ID'] for r in rows})==309
counts={k:sum(r['finalCategory']==k for r in rows) for k in ('RESOLVED','CONFLICT','UNRESOLVED')}
assert counts=={'RESOLVED':47,'CONFLICT':48,'UNRESOLVED':214}, counts
for r in rows:
    if r['finalCategory']=='RESOLVED':
        assert r['ID_TAXON_EXACT'] not in (None,'')
        assert len(r['closureIds'])==1
        assert str(r['ID_TAXON_EXACT'])==str(r['closureIds'][0])

all_path=OUTDIR/'ALL_309_REDUCED.jsonl'
res_path=OUTDIR/'RESOLVED_47_REDUCED.jsonl'
with all_path.open('w',encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
with res_path.open('w',encoding='utf-8') as f:
    for r in rows:
        if r['finalCategory']=='RESOLVED':
            f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
summary={
    'scope':309,
    'counts':counts,
    'uniqueSourceIds':309,
    'all309Sha256':sha(all_path),
    'resolved47Sha256':sha(res_path),
    'source':'execution/06/v17/synonym-system-309/runs/FINAL_CONSOLIDATED_309_V17/CONSOLIDATED_309.jsonl',
    'sourceSha256Expected':'a2c49bd2f6ad05769dafecaf90b417656ef7e298305d1d250b95b32e1eb556f2',
    'qa':'PASS'
}
assert hashlib.sha256(SRC.read_bytes()).hexdigest()==summary['sourceSha256Expected']
(OUTDIR/'PREFLIGHT_309_SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
