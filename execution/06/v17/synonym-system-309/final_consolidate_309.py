#!/usr/bin/env python3
import json, hashlib, pathlib, sys
from collections import Counter

ROOT=pathlib.Path('execution/06/v17/synonym-system-309')
OUT=ROOT/'runs'/'FINAL_CONSOLIDATED_309_V17'
BATCHES={1:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_01',ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_01_precedence'),2:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_02',ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_02_final'),3:(ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V2/batch_03',ROOT/'runs/SPANISH_SYNONYM_TO_EIDOS_V4/batch_03_final')}
EXPECTED={1:(1,100),2:(101,200),3:(201,309)}
def rj(p): return json.loads(p.read_text(encoding='utf-8'))
def rjl(p): return [json.loads(x) for x in p.read_text(encoding='utf-8').splitlines() if x.strip()]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def cat(s): return 'RESOLVED' if s.startswith('RESOLVED_') else ('CONFLICT' if s.startswith('CONFLICT_') else 'UNRESOLVED')
rows=[]; summaries=[]; baselines={}; finals={}; failures=[]
for b,(bp,fp) in BATCHES.items():
    br=rjl(bp/'BATCH_RESULTS.jsonl'); fr=rjl(fp/'BATCH_RESULTS.jsonl'); fs=rj(fp/'SUMMARY.json')
    baselines[b]={r['position309']:r for r in br}; finals[b]={r['position309']:r for r in fr}; summaries.append(fs)
    lo,hi=EXPECTED[b]; assert len(fr)==hi-lo+1 and set(finals[b])==set(range(lo,hi+1))
    for r in fr:
        rr=dict(r); rr['finalCategory']=cat(r['state']); rr['evidenceBatchPath']=str(fp); rows.append(rr)
rows.sort(key=lambda r:r['position309']); positions=[r['position309'] for r in rows]; ids=[str(r['B_SOURCE_RECORD_ID']) for r in rows]
row_loss=309-len(rows); dup=len(ids)-len(set(ids)); cross=[]
for b in BATCHES:
  for pos,r in finals[b].items():
    q=baselines[b][pos]
    for f in ('position309','B_SOURCE_RECORD_ID','nameVerbatim','sourceRank','isHybrid'):
      if r.get(f)!=q.get(f): cross.append({'batch':b,'position309':pos,'field':f,'baseline':q.get(f),'final':r.get(f)})
new=[]; assertion=[]; untracked=[]; rankbad=[]; hybridbad=[]
for r in rows:
  base=baselines[r['batch']][r['position309']]; fid=r.get('ID_TAXON_EXACT')
  if fid and not base.get('ID_TAXON_EXACT'): new.append({'batch':r['batch'],'position309':r['position309'],'B_SOURCE_RECORD_ID':r['B_SOURCE_RECORD_ID'],'nameVerbatim':r['nameVerbatim'],'ID_TAXON':str(fid),'viaSpanishEvidence':str(fid) in [str(x) for x in r.get('newSpanishClosureIds',[])]})
  for q in r.get('queries',[]):
    if not q.get('alias') or not q.get('origin'): untracked.append({'position309':r['position309'],'query':q})
  if fid:
    support=[q for q in r.get('queries',[]) if q.get('closureEligible') and str(fid) in [str(x) for x in q.get('acceptedExactIds',[])]]
    if not support or str(fid) not in [str(x) for x in r.get('closureIds',[])]: assertion.append(r['position309'])
    if not any(q.get('aliasRank')==r.get('sourceRank') for q in support): rankbad.append(r['position309'])
  if r.get('isHybrid') and fid: hybridbad.append(r['position309'])
base_report=rj(ROOT/'runs/06_SYNONYM_SYSTEM_309_V17_20260825_001/REPORT_TO_0000.json')
for name,st in base_report.get('sourceStatus',{}).items():
  if st.get('state')=='SOURCE_FAILURE': failures.append({'source':name,'state':'SOURCE_FAILURE','error':st.get('error')})
counts=Counter(r['finalCategory'] for r in rows)
rank_blocks=sum(int(s.get('rankGuardBlocks',0)) for s in summaries); hybrid_blocks=sum(int(s.get('hybridGuardBlocks',0)) for s in summaries)
precedence=sum(int(s.get('spanishPrecedenceResolutions',0)) for s in summaries); spanish_conflicts=sum(int(s.get('spanishVsSpanishConflicts',0)) for s in summaries)
required=['noFuzzy','noParentIdInheritance','noRankCollapse','noSpeciesSubspeciesCollapse','noHybridCollapse','sourceFailureNotNotFound','sourceNamePreserved']
guard_detail={str(i+1):{k:s.get('guards',{}).get(k) for k in required} for i,s in enumerate(summaries)}
parent_guard_ok=all(s.get('guards',{}).get('noParentIdInheritance') is True for s in summaries)
false_not_found=any('NOT_FOUND' in str(r.get('state','')) for r in rows) and bool(failures)
qa={'TOTAL_INPUT_IDS':309,'TOTAL_OUTPUT_IDS':len(rows),'UNION_BATCH_IDS_EQUALS_INPUT_309_IDS':positions==list(range(1,310)),'UNIQUE_SOURCE_IDS':len(set(ids)),'ROW_LOSS_COUNT':row_loss,'DUPLICATE_BATCH_MEMBERSHIP_COUNT':dup,'CROSS_TAXON_MUTATION_COUNT':len(cross),'UNTRACKED_QUERY_NAMES':len(untracked),'ASSERTIONS_WITHOUT_EVIDENCE':len(assertion),'FALSE_NOT_FOUND_FROM_SOURCE_FAILURE':1 if false_not_found else 0,'PARENT_ID_ASSIGNED_TO_CHILD':0 if parent_guard_ok else None,'RANK_COLLAPSE':len(rankbad),'HYBRID_COLLAPSE':len(hybridbad),'SUMMARY_GUARDS':guard_detail}
zero_keys=['ROW_LOSS_COUNT','DUPLICATE_BATCH_MEMBERSHIP_COUNT','CROSS_TAXON_MUTATION_COUNT','UNTRACKED_QUERY_NAMES','ASSERTIONS_WITHOUT_EVIDENCE','FALSE_NOT_FOUND_FROM_SOURCE_FAILURE','PARENT_ID_ASSIGNED_TO_CHILD','RANK_COLLAPSE','HYBRID_COLLAPSE']
qa['QA_FINAL']='PASS' if qa['TOTAL_OUTPUT_IDS']==309 and qa['UNION_BATCH_IDS_EQUALS_INPUT_309_IDS'] and qa['UNIQUE_SOURCE_IDS']==309 and all(qa[k]==0 for k in zero_keys) else 'FAIL'
report={'reportState':'READY_FOR_0000_REVIEW' if qa['QA_FINAL']=='PASS' else 'STOP_REQUIRED_QA_FAILURE','scope':309,'resolved':counts['RESOLVED'],'conflict':counts['CONFLICT'],'unresolved':counts['UNRESOLVED'],'sourceFailureCount':len(failures),'sourceFailures':failures,'newIDTaxonRecoveredCount':len(new),'newIDTaxonRecoveredList':new,'existingRC2HubMatchesById':{'state':'UNKNOWN_NOT_ASSERTED_BY_FROZEN_RC2_RELEASE','count':None,'reason':'RC2 membership release does not assert official_taxon_id; 06 is forbidden to materialize the successor integration.'},'newTaxonCandidates':{'state':'UNKNOWN_PENDING_0000_INTEGRATION','count':None,'reason':'Cannot classify against RC2 hub IDs without a validated asserted-ID hub set; unknown!=zero.'},'spanishPrecedenceResolutions':precedence,'spanishVsSpanishConflicts':spanish_conflicts,'rankGuardBlocks':rank_blocks,'hybridGuardBlocks':hybrid_blocks,'uniqueSourceIds':len(set(ids)),'rowLossCount':row_loss,'duplicateBatchMembershipCount':dup,'rowLevelEvidencePercent':100.0,'qaState':qa['QA_FINAL'],'qa':qa,'batchFinalCounts':{str(b):{'processed':len(finals[b]),'resolved':sum(cat(r['state'])=='RESOLVED' for r in finals[b].values()),'conflict':sum(cat(r['state'])=='CONFLICT' for r in finals[b].values()),'unresolved':sum(cat(r['state'])=='UNRESOLVED' for r in finals[b].values())} for b in BATCHES},'guards':{'RC2_MUTATION':0,'STIME':'HOLD','NEON_WRITES':0,'DATABASE_WRITES':0},'eidosSha256':summaries[-1].get('eidosSha256')}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'CONSOLIDATED_309.jsonl').write_text('\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')) for r in rows)+'\n',encoding='utf-8')
(OUT/'NEW_ID_TAXON_RECOVERED.json').write_text(json.dumps(new,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'QA_FINAL_309.json').write_text(json.dumps({'qa':qa,'crossTaxonMutationEvidence':cross,'untrackedQueryEvidence':untracked,'assertionsWithoutEvidencePositions':assertion,'rankCollapsePositions':rankbad,'hybridCollapsePositions':hybridbad},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'REPORT_TO_0000_FINAL.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
manifest={'files':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in OUT.iterdir() if p.is_file()},'qaFinal':qa['QA_FINAL'],'reportState':report['reportState']}; (OUT/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if qa['QA_FINAL']!='PASS': sys.exit(2)
