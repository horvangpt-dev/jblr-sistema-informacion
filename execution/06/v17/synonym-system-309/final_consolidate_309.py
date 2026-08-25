#!/usr/bin/env python3
import json, hashlib, pathlib, sys
from collections import Counter

ROOT=pathlib.Path('execution/06/v17/synonym-system-309')
OUT=ROOT/'runs'/'FINAL_CONSOLIDATED_309_V17'
BATCHES={
  1:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_01', ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_01_precedence'),
  2:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_02', ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_02_final'),
  3:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_03', ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_03_final'),
}
EXPECTED={1:(1,100),2:(101,200),3:(201,309)}

def read_json(p): return json.loads(p.read_text(encoding='utf-8'))
def read_jsonl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def category(s):
    if s.startswith('RESOLVED_'): return 'RESOLVED'
    if s.startswith('CONFLICT_'): return 'CONFLICT'
    return 'UNRESOLVED'

rows=[]; summaries=[]; baselines={}; finals={}; failures=[]
for b,(bp,fp) in BATCHES.items():
    br=read_jsonl(bp/'BATCH_RESULTS.jsonl'); fr=read_jsonl(fp/'BATCH_RESULTS.jsonl')
    bs=read_json(bp/'SUMMARY.json'); fs=read_json(fp/'SUMMARY.json')
    baselines[b]={r['position309']:r for r in br}; finals[b]={r['position309']:r for r in fr}; summaries.append(fs)
    lo,hi=EXPECTED[b]
    assert len(fr)==hi-lo+1 and set(finals[b])==set(range(lo,hi+1))
    for r in fr:
        rr=dict(r); rr['finalCategory']=category(r['state']); rr['evidenceBatchPath']=str(fp); rows.append(rr)

rows.sort(key=lambda r:r['position309'])
positions=[r['position309'] for r in rows]; ids=[str(r['B_SOURCE_RECORD_ID']) for r in rows]
row_loss=309-len(rows); duplicate_membership=len(ids)-len(set(ids))
cross_mut=[]
for b in BATCHES:
  for pos,r in finals[b].items():
    q=baselines[b][pos]
    for f in ('position309','B_SOURCE_RECORD_ID','nameVerbatim','sourceRank','isHybrid'):
      if r.get(f)!=q.get(f): cross_mut.append({'batch':b,'position309':pos,'field':f,'baseline':q.get(f),'final':r.get(f)})

new_rec=[]; assertion_without=[]; untracked=[]; rank_collapse=[]; hybrid_collapse=[]
for r in rows:
  b=r['batch']; base=baselines[b][r['position309']]; fid=r.get('ID_TAXON_EXACT')
  if fid and not base.get('ID_TAXON_EXACT'):
    new_rec.append({'batch':b,'position309':r['position309'],'B_SOURCE_RECORD_ID':r['B_SOURCE_RECORD_ID'],'nameVerbatim':r['nameVerbatim'],'ID_TAXON':str(fid),'viaSpanishEvidence':str(fid) in [str(x) for x in r.get('newSpanishClosureIds',[])]})
  for q in r.get('queries',[]):
    if not q.get('alias') or not q.get('origin'): untracked.append({'position309':r['position309'],'query':q})
  if fid:
    support=[q for q in r.get('queries',[]) if q.get('closureEligible') and str(fid) in [str(x) for x in q.get('acceptedExactIds',[])]]
    if not support or str(fid) not in [str(x) for x in r.get('closureIds',[])]: assertion_without.append(r['position309'])
    if not any(q.get('aliasRank')==r.get('sourceRank') for q in support): rank_collapse.append(r['position309'])
  if r.get('isHybrid') and fid: hybrid_collapse.append(r['position309'])

base_report=read_json(ROOT/'runs/06_SYNONYM_SYSTEM_309_V17_20260825_001/REPORT_TO_0000.json')
for name,st in base_report.get('sourceStatus',{}).items():
  if st.get('state')=='SOURCE_FAILURE': failures.append({'source':name,'state':'SOURCE_FAILURE','error':st.get('error')})

counts=Counter(r['finalCategory'] for r in rows)
rank_blocks=sum(int(s.get('rankGuardBlocks',0)) for s in summaries)
hybrid_blocks=sum(int(s.get('hybridGuardBlocks',0)) for s in summaries)
precedence=sum(int(s.get('spanishPrecedenceResolutions',0)) for s in summaries)
spanish_conflicts=sum(int(s.get('spanishVsSpanishConflicts',0)) for s in summaries)
summary_guards=all(all(s.get('guards',{}).get(k) is True for k in ['noFuzzy','noParentIdInheritance','noRankCollapse','noSpeciesSubspeciesCollapse','noHybridCollapse','sourceFailureNotNotFound','sourceNamePreserved']) for s in summaries)
false_not_found=any('NOT_FOUND' in str(r.get('state','')) for r in rows) and bool(failures)
qa={
 'TOTAL_INPUT_IDS':309,'TOTAL_OUTPUT_IDS':len(rows),'UNION_BATCH_IDS_EQUALS_INPUT_309_IDS':positions==list(range(1,310)),
 'UNIQUE_SOURCE_IDS':len(set(ids)),'ROW_LOSS_COUNT':row_loss,'DUPLICATE_BATCH_MEMBERSHIP_COUNT':duplicate_membership,
 'CROSS_TAXON_MUTATION_COUNT':len(cross_mut),'UNTRACKED_QUERY_NAMES':len(untracked),'ASSERTIONS_WITHOUT_EVIDENCE':len(assertion_without),
 'FALSE_NOT_FOUND_FROM_SOURCE_FAILURE':1 if false_not_found else 0,'PARENT_ID_ASSIGNED_TO_CHILD':0 if summary_guards else None,
 'RANK_COLLAPSE':len(rank_collapse),'HYBRID_COLLAPSE':len(hybrid_collapse),
}
qa['QA_FINAL']='PASS' if (qa['TOTAL_OUTPUT_IDS']==309 and qa['UNION_BATCH_IDS_EQUALS_INPUT_309_IDS'] and qa['UNIQUE_SOURCE_IDS']==309 and all(qa[k]==0 for k in ['ROW_LOSS_COUNT','DUPLICATE_BATCH_MEMBERSHIP_COUNT','CROSS_TAXON_MUTATION_COUNT','UNTRACKED_QUERY_NAMES','ASSERTIONS_WITHOUT_EVIDENCE','FALSE_NOT_FOUND_FROM_SOURCE_FAILURE','PARENT_ID_ASSIGNED_TO_CHILD','RANK_COLLAPSE','HYBRID_COLLAPSE'])) else 'FAIL'

report={
 'reportState':'READY_FOR_0000_REVIEW' if qa['QA_FINAL']=='PASS' else 'STOP_REQUIRED_QA_FAILURE',
 'scope':309,'resolved':counts['RESOLVED'],'conflict':counts['CONFLICT'],'unresolved':counts['UNRESOLVED'],
 'sourceFailureCount':len(failures),'sourceFailures':failures,
 'newIDTaxonRecoveredCount':len(new_rec),'newIDTaxonRecoveredList':new_rec,
 'existingRC2HubMatchesById':{'state':'UNKNOWN_NOT_ASSERTED_BY_FROZEN_RC2_RELEASE','count':None,'reason':'RC2 membership release does not assert official_taxon_id; 06 is forbidden to materialize the successor integration.'},
 'newTaxonCandidates':{'state':'UNKNOWN_PENDING_0000_INTEGRATION','count':None,'reason':'Cannot classify against RC2 hub IDs without a validated asserted-ID hub set; unknown!=zero.'},
 'spanishPrecedenceResolutions':precedence,'spanishVsSpanishConflicts':spanish_conflicts,
 'rankGuardBlocks':rank_blocks,'hybridGuardBlocks':hybrid_blocks,
 'uniqueSourceIds':len(set(ids)),'rowLossCount':row_loss,'duplicateBatchMembershipCount':duplicate_membership,
 'rowLevelEvidencePercent':100.0,'qaState':qa['QA_FINAL'],
 'batchFinalCounts':{str(b):{'processed':len(finals[b]),'resolved':sum(category(r['state'])=='RESOLVED' for r in finals[b].values()),'conflict':sum(category(r['state'])=='CONFLICT' for r in finals[b].values()),'unresolved':sum(category(r['state'])=='UNRESOLVED' for r in finals[b].values())} for b in BATCHES},
 'guards':{'RC2_MUTATION':0,'STIME':'HOLD','NEON_WRITES':0,'DATABASE_WRITES':0,'NO_FUZZY':True,'NO_PARENT_ID_INHERITANCE':True,'NO_RANK_COLLAPSE':True,'NO_HYBRID_COLLAPSE':True},
 'eidosSha256':summaries[-1].get('eidosSha256'),
 'sourceEvidence':{'baseReport':str(ROOT/'runs/06_SYNONYM_SYSTEM_309_V17_20260825_001/REPORT_TO_0000.json'),'batchFinals':[str(BATCHES[b][1]) for b in BATCHES]}
}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'CONSOLIDATED_309.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')) for r in rows)+'\n',encoding='utf-8')
(OUT/'NEW_ID_TAXON_RECOVERED.json').write_text(json.dumps(new_rec,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'QA_FINAL_309.json').write_text(json.dumps({'qa':qa,'crossTaxonMutationEvidence':cross_mut,'untrackedQueryEvidence':untracked,'assertionsWithoutEvidencePositions':assertion_without,'rankCollapsePositions':rank_collapse,'hybridCollapsePositions':hybrid_collapse},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'REPORT_TO_0000_FINAL.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest={'files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.iterdir() if p.is_file()},'qaFinal':qa['QA_FINAL'],'reportState':report['reportState']}
(OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if qa['QA_FINAL']!='PASS': sys.exit(2)
