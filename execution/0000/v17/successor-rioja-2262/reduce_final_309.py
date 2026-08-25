import json, hashlib, csv
from pathlib import Path

SRC = Path('execution/06/v17/synonym-system-309/runs/FINAL_CONSOLIDATED_309_V17/CONSOLIDATED_309.jsonl')
OUTDIR = Path('execution/0000/v17/successor-rioja-2262/preflight')
OUTDIR.mkdir(parents=True, exist_ok=True)
EXPECTED_SHA='a2c49bd2f6ad05769dafecaf90b417656ef7e298305d1d250b95b32e1eb556f2'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

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
                'closureIds': [str(v) for v in x.get('closureIds', [])],
                'oldNetworkClosureIds': [str(v) for v in x.get('oldNetworkClosureIds', [])],
                'newSpanishClosureIds': [str(v) for v in x.get('newSpanishClosureIds', [])],
                'state': x.get('state'),
                'evidenceBatchPath': x.get('evidenceBatchPath'),
            })

counts={k:sum(r['finalCategory']==k for r in rows) for k in ('RESOLVED','CONFLICT','UNRESOLVED')}
positions=sorted(r['position309'] for r in rows)
source_ids=[r['B_SOURCE_RECORD_ID'] for r in rows]
violations=[]
if sha(SRC)!=EXPECTED_SHA: violations.append({'type':'SOURCE_SHA_MISMATCH','actual':sha(SRC),'expected':EXPECTED_SHA})
if len(rows)!=309: violations.append({'type':'ROW_COUNT','actual':len(rows),'expected':309})
if positions!=list(range(1,310):): pass
