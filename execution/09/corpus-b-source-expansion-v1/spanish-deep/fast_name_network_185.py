#!/usr/bin/env python3
import hashlib,json,math,os,sys,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path
import requests
import secondary_web_synonymy_185_v2 as core

TARGET_GROUP='NO_RESULT_IN_SPANISH_SOURCES_CONSULTED'
METHOD='DOCUMENTED_STRUCTURED_NAME_NETWORK_THEN_EXACT_EIDOS_CONTRAST'
SOURCE='GBIF_BACKBONE_EXACT_STRUCTURED_API'
GBIF='https://api.gbif.org/v1'
EIDOS_SHA='810467771b2493676e47423e1a5705e7983b3bc11d2f5abde902006fc9286737'
RELEASE='JBLR-EVT-0000-20260824-RELEASE-09-FAST-NAME-NETWORK-185-001'
ELIGIBLE={'species','subspecies','variety','nothospecies'}

def n(s): return core.norm(core.canonical(s or ''))
def rk(s): return (s or '').replace(' ','').replace('-','').lower()
def rank_ok(required,got): return rk(got)==rk(required)
def uniq(vals,limit=20):
    out=[]; seen=set()
    for v in vals:
        c=core.canonical(v or ''); k=n(c)
        if k and k not in seen:
            seen.add(k); out.append(c)
            if len(out)>=limit: break
    return out

def getj(session,url,params=None):
    last=None
    for attempt in range(3):
        try:
            r=session.get(url,params=params,timeout=25,headers={'Accept':'application/json'})
            if r.status_code==200: return r.json(),{'url':r.url,'status':200,'attempt':attempt+1}
            last=RuntimeError(f'HTTP_{r.status_code}')
        except Exception as e: last=e
        time.sleep(.5*(attempt+1))
    raise RuntimeError(f'{type(last).__name__}:{last}')

def network(row):
    bid=str(row['B_SOURCE_RECORD_ID']); seed=row['name']; rr=core.rank_of(seed); seedc=core.canonical(seed); seedk=n(seed)
    ev={'source':SOURCE,'seed':seed,'requiredRank':rr,'search':None,'exactUsageKeys':[],'acceptedRootKeys':[],'detailFetches':[],'synonymFetches':[]}
    base={'B_SOURCE_RECORD_ID':bid,'NOMBRE_RIOJA_VERBATIM':seed,'names':[seedc],'evidence':[ev]}
    if rr not in ELIGIBLE:
        return {**base,'query_state':'NON_AUTOMATIC_SPECIAL_CASE','source_state':'NOT_QUERIED_SPECIAL_RANK','source_failure':False}
    s=requests.Session()
    try:
        data,meta=getj(s,f'{GBIF}/species/search',{'name':seedc,'limit':100}); ev['search']=meta
    except Exception as e:
        ev['search']={'status':'FAILURE','error':str(e)}
        return {**base,'query_state':'SOURCE_FAILURE','source_state':'SOURCE_FAILURE','source_failure':True}
    exact=[]
    for rec in data.get('results',[]):
        can=rec.get('canonicalName') or rec.get('scientificName') or ''
        if n(can)!=seedk or not rank_ok(rr,rec.get('rank')): continue
        kingdom=(rec.get('kingdom') or '').casefold()
        if kingdom and kingdom!='plantae': continue
        key=rec.get('nubKey') or rec.get('key')
        if key is not None: exact.append(str(key))
    keys=[]
    for key in exact:
        if key not in keys: keys.append(key)
        if len(keys)>=4: break
    ev['exactUsageKeys']=keys
    if not keys:
        return {**base,'query_state':'SOURCE_EXACT_NAME_NOT_FOUND','source_state':'SOURCE_EXACT_NAME_NOT_FOUND','source_failure':False}
    names=[seedc]; roots=[]; detail_fail=0; syn_fail=0
    for key in keys:
        try:
            d,meta=getj(s,f'{GBIF}/species/{key}'); ev['detailFetches'].append(meta)
        except Exception as e:
            detail_fail+=1; ev['detailFetches'].append({'key':key,'status':'FAILURE','error':str(e)}); continue
        root=str(d.get('acceptedKey') or d.get('key') or key)
        if root not in roots: roots.append(root)
        if rank_ok(rr,d.get('rank')): names.append(d.get('canonicalName') or d.get('scientificName') or '')
    ev['acceptedRootKeys']=roots
    for root in roots[:4]:
        try:
            syns,meta=getj(s,f'{GBIF}/species/{root}/synonyms',{'limit':100}); ev['synonymFetches'].append(meta)
        except Exception as e:
            syn_fail+=1; ev['synonymFetches'].append({'key':root,'status':'FAILURE','error':str(e)}); continue
        rows=syns.get('results',[]) if isinstance(syns,dict) else (syns if isinstance(syns,list) else [])
        for x in rows:
            if rank_ok(rr,x.get('rank')): names.append(x.get('canonicalName') or x.get('scientificName') or '')
    names=uniq(names); alt=max(0,len(names)-1); ev.update({'networkNameCount':len(names),'alternateNameCount':alt})
    if not roots and detail_fail: state='SOURCE_FAILURE'; fail=True
    elif roots and syn_fail==len(roots): state='SOURCE_PARTIAL_FAILURE_EXACT_NAME_ONLY'; fail=True
    elif alt: state='SOURCE_SUCCESS_EXACT_NETWORK'; fail=False
    else: state='SOURCE_SUCCESS_EXACT_NAME_ONLY'; fail=False
    return {**base,'names':names,'query_state':state,'source_state':state,'source_failure':fail}

def evaluate(eidx,row):
    seed=row['NOMBRE_RIOJA_VERBATIM']; rr=core.rank_of(seed); vals=[]
    for name in row.get('names',[]):
        e=core.eval_eidos(eidx,name,rr); tid=e.get('taxonID'); same=e.get('sameRankRecords') or []
        hit=next((r for r in same if tid and str(r.get('taxonID'))==str(tid)),None)
        vals.append({'name':name,'state':e.get('state'),'taxonID':tid,'acceptedName':(hit or {}).get('scientificName'),'matchedRank':(hit or {}).get('taxonRank')})
    ids=sorted({str(x['taxonID']) for x in vals if x.get('taxonID')})
    terminal='UNRESOLVED_AFTER_NAME_NETWORK_EIDOS'; tid=None; ename=None
    if rr not in ELIGIBLE: terminal='NON_AUTOMATIC_SPECIAL_CASE'
    elif len(ids)==1:
        tid=ids[0]; terminal='RESOLVED_UNIQUE_EIDOS_ID_FROM_DOCUMENTED_NAME_NETWORK'; hit=next(x for x in vals if str(x.get('taxonID'))==tid); ename=hit.get('acceptedName')
    elif len(ids)>1: terminal='EIDOS_CONFLICT_MULTIPLE_ACCEPTED_IDS_FROM_DOCUMENTED_NETWORK'
    return {'B_SOURCE_RECORD_ID':row['B_SOURCE_RECORD_ID'],'NOMBRE_RIOJA_VERBATIM':seed,'requiredRank':rr,'sourceState':row.get('source_state'),'sourceFailure':bool(row.get('source_failure')),'networkNames':row.get('names',[]),'terminalState':terminal,'MITECO_IDTAXON':tid,'EIDOS_NAME':ename,'eidosEvidence':vals,'networkEvidence':row.get('evidence',[])}

def dump(path,obj): path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    if len(sys.argv)!=5: raise SystemExit('usage: fast_name_network_185.py GROUPS EIDOS OUT REQUEST')
    gp,ep,out,rp=map(Path,sys.argv[1:]); out.mkdir(parents=True,exist_ok=True); req=json.loads(rp.read_text())
    assert req['enabled'] is True and req['scope']==185 and req['batchSize']==25
    assert req['method']=='NAME_NETWORK_TO_EXACT_EIDOS' and req['releaseEvent']==RELEASE and req['primaryNetworkSource']==SOURCE
    assert req['top4Primary'] is False and req['top4RescueOnly'] is True and req['crossWithA'] is False and req['neonWrites']==0 and req['corpusBFreeze'] is False
    assert req['noFuzzy'] is True and req['noParentIdInheritance'] is True and req['noRankCollapse'] is True
    rows=json.loads(gp.read_text())['groups'][TARGET_GROUP]; assert len(rows)==185,len(rows)
    sha=hashlib.sha256(ep.read_bytes()).hexdigest(); assert sha==EIDOS_SHA,sha
    eidx,emeta=core.build_eidos(ep)
    receipts=[]; results_all=[]; networks_all=[]; stop=False; reason=None
    for bi,off in enumerate(range(0,185,25),1):
        chunk=rows[off:off+25]; started=time.time(); nets=[None]*len(chunk)
        with ThreadPoolExecutor(max_workers=min(8,len(chunk))) as ex:
            fs={ex.submit(network,row):i for i,row in enumerate(chunk)}
            for f in as_completed(fs):
                i=fs[f]; row=chunk[i]
                try: nets[i]=f.result()
                except Exception as e: nets[i]={'B_SOURCE_RECORD_ID':str(row['B_SOURCE_RECORD_ID']),'NOMBRE_RIOJA_VERBATIM':row['name'],'names':[core.canonical(row['name'])],'query_state':'WORKER_SOURCE_FAILURE','source_state':'SOURCE_FAILURE','source_failure':True,'evidence':[{'source':SOURCE,'error':f'{type(e).__name__}:{e}'}]}
        res=[evaluate(eidx,x) for x in nets]; resolved=[x for x in res if x.get('MITECO_IDTAXON')]; conflicts=[x for x in res if x['terminalState'].startswith('EIDOS_CONFLICT')]
        unresolved=[x for x in res if x['terminalState']=='UNRESOLVED_AFTER_NAME_NETWORK_EIDOS']; special=[x for x in res if x['terminalState']=='NON_AUTOMATIC_SPECIAL_CASE']
        failures=[x for x in nets if x.get('source_failure')]; notfound=[x for x in nets if x.get('source_state')=='SOURCE_EXACT_NAME_NOT_FOUND']; alt=[x for x in nets if len(x.get('names',[]))>1]
        threshold=max(5,math.ceil(len(chunk)*.40)); cluster=len(failures)>=threshold; nearzero=len(resolved)==0; anomalous=cluster or nearzero
        why=f'SOURCE_FAILURE_CLUSTER_{len(failures)}_OF_{len(chunk)}' if cluster else (f'NEAR_ZERO_RESOLUTION_YIELD_0_OF_{len(chunk)}' if nearzero else None)
        br={'batchIndex':bi,'offset':off,'inputRows':len(chunk),'runtimeSeconds':round(time.time()-started,3),'resolvedCount':len(resolved),'unresolvedCount':len(unresolved),'conflictCount':len(conflicts),'specialCaseCount':len(special),'sourceFailureCount':len(failures),'sourceNotFoundCount':len(notfound),'networkRowsWithAlternates':len(alt),'sourceFailureCluster':cluster,'nearZeroYield':nearzero,'anomalous':anomalous,'anomalyReason':why,'method':METHOD,'primaryNetworkSource':SOURCE,'top4Primary':False,'top4RescueOnly':True,'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True}
        bd=out/f'batch_{bi:02d}'; bd.mkdir(parents=True,exist_ok=True); dump(bd/'NETWORK.json',{'receipt':br,'rows':nets}); dump(bd/'COMPACT_RESULTS.json',{'receipt':br,'rows':res}); dump(bd/'RESOLVED.json',{'receipt':br,'rows':resolved}); dump(bd/'BATCH_RECEIPT.json',br)
        receipts.append(br); results_all+=res; networks_all+=nets; print(json.dumps(br,ensure_ascii=False),flush=True)
        if anomalous: stop=True; reason=why; break
    resolved=[x for x in results_all if x.get('MITECO_IDTAXON')]; conflicts=[x for x in results_all if x['terminalState'].startswith('EIDOS_CONFLICT')]; failures=[x for x in networks_all if x.get('source_failure')]; notfound=[x for x in networks_all if x.get('source_state')=='SOURCE_EXACT_NAME_NOT_FOUND']
    receipt={'runClass':'CORPUS_B_FAST_DOCUMENTED_NAME_NETWORK_EIDOS_185','githubRunId':os.getenv('GITHUB_RUN_ID'),'releaseEvent':RELEASE,'method':METHOD,'primaryNetworkSource':SOURCE,'targetGroup':TARGET_GROUP,'inputRows':185,'batchSize':25,'plannedBatches':8,'completedBatches':len(receipts),'processedRows':len(results_all),'allBatchesCompleted':len(results_all)==185 and not stop,'stopRequired':stop,'stopReason':reason,'resolvedCount':len(resolved),'conflictCount':len(conflicts),'sourceFailureCount':len(failures),'sourceNotFoundCount':len(notfound),'batchReceipts':receipts,'eidosSource':'https://datos.iepnb.es/datasets/eidos.ttl','eidosBytes':emeta['bytes'],'eidosSha256':sha,'top4Primary':False,'top4RescueOnly':True,'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,'semantics':['REALITY_FIRST','NO_SILENT_INFERENCE','UNRESOLVED!=ABSENCE','SOURCE_FAILURE!=NOT_FOUND','NO_FUZZY','NO_PARENT_ID_INHERITANCE','NO_RANK_COLLAPSE']}
    dump(out/'RUN_RECEIPT.json',receipt); dump(out/'COMPACT_RESULTS_PROCESSED.json',{'receipt':receipt,'rows':results_all}); dump(out/'RESOLVED_PROCESSED.json',{'receipt':receipt,'rows':resolved}); dump(out/'NETWORK_PROVENANCE_PROCESSED.json',{'receipt':receipt,'rows':networks_all}); print(json.dumps(receipt,ensure_ascii=False),flush=True)
if __name__=='__main__': main()
