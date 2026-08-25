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
if positions!=list(range(1,310)): violations.append({'type':'POSITION_SET_MISMATCH'})
if len(set(source_ids))!=309: violations.append({'type':'SOURCE_ID_DUPLICATION','unique':len(set(source_ids))})
if counts!={'RESOLVED':47,'CONFLICT':48,'UNRESOLVED':214}: violations.append({'type':'CATEGORY_COUNTS','actual':counts})

resolved_diagnostics=[]
for r in rows:
    if r['finalCategory']=='RESOLVED':
        rid=None if r['ID_TAXON_EXACT'] in (None,'') else str(r['ID_TAXON_EXACT'])
        d={'position309':r['position309'],'B_SOURCE_RECORD_ID':r['B_SOURCE_RECORD_ID'],'nameVerbatim':r['nameVerbatim'],'ID_TAXON_EXACT':rid,'closureIds':r['closureIds'],'state':r['state']}
        if rid is None:
            d['identityCheck']='FAIL_MISSING_ID'; violations.append({'type':'RESOLVED_MISSING_ID',**d})
        elif rid not in r['closureIds']:
            d['identityCheck']='FAIL_SELECTED_ID_NOT_IN_CLOSURE'; violations.append({'type':'RESOLVED_SELECTED_ID_NOT_IN_CLOSURE',**d})
        else:
            d['identityCheck']='PASS_SELECTED_ID_IN_CLOSURE'
            if len(r['closureIds'])>1: d['note']='MULTIPLE_CLOSURE_IDS_PRESERVED;FINAL_SELECTED_ID_TAXON_EXACT_IS_OPERATIONAL_RESOLUTION'
        resolved_diagnostics.append(d)

all_path=OUTDIR/'ALL_309_REDUCED.jsonl'; res_path=OUTDIR/'RESOLVED_47_REDUCED.jsonl'; min_path=OUTDIR/'ALL_309_IDENTITY_MIN.csv'
with all_path.open('w',encoding='utf-8') as f:
    for r in rows: f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
with res_path.open('w',encoding='utf-8') as f:
    for r in rows:
        if r['finalCategory']=='RESOLVED': f.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n')
with min_path.open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f); w.writerow(['position309','B_SOURCE_RECORD_ID','nameVerbatim','sourceRank','isHybrid','finalCategory','ID_TAXON_EXACT','state'])
    for r in rows: w.writerow([r['position309'],r['B_SOURCE_RECORD_ID'],r['nameVerbatim'],r['sourceRank'],r['isHybrid'],r['finalCategory'],r['ID_TAXON_EXACT'] or '',r['state'] or ''])
(OUTDIR/'RESOLVED_47_DIAGNOSTICS.json').write_text(json.dumps(resolved_diagnostics,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
summary={
    'scope':len(rows),'counts':counts,'uniqueSourceIds':len(set(source_ids)),
    'sourceSha256Actual':sha(SRC),'sourceSha256Expected':EXPECTED_SHA,
    'all309Sha256':sha(all_path),'resolved47Sha256':sha(res_path),'all309IdentityMinSha256':sha(min_path),
    'resolvedWithMultipleClosureIds':sum(1 for d in resolved_diagnostics if len(d['closureIds'])>1),
    'violations':violations,'qa':'PASS' if not violations else 'FAIL'
}
(OUTDIR/'PREFLIGHT_309_SUMMARY.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
if violations: raise SystemExit('PREFLIGHT_QA_FAIL')
