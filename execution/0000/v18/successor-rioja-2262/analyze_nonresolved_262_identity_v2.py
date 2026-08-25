#!/usr/bin/env python3
import json,re,unicodedata
from pathlib import Path
from collections import defaultdict

ROOT=Path('execution/0000/v18/successor-rioja-2262')
CAT=ROOT/'CATEGORY_MAP_309_COMPACT.json'; RES=ROOT/'RESOLVED_47_ROUTING_SUMMARY.json'
CONSOLIDATED=Path('/tmp/CONSOLIDATED_309.jsonl'); RC2=Path('/tmp/RC2_MEMBERSHIP_2210.jsonl')
OUT=ROOT/'NONRESOLVED_262_IDENTITY_ROUTING_STAGE1.json'; EDGES=ROOT/'NONRESOLVED_262_IDENTITY_EDGES_STAGE1.json'
NAMES=ROOT/'NONRESOLVED_262_EXPLICIT_NAMES.json'; QAOUT=ROOT/'QA_NONRESOLVED_262_IDENTITY_STAGE1.json'

def norm_name(v):
    s=unicodedata.normalize('NFKC',str(v or '').strip()).replace('×','x')
    return re.sub(r'\s+',' ',s).casefold()
def rank_norm(v,name=''):
    s=str(v or '').strip().casefold()
    if s in {'species','especie'}: return 'species'
    if s in {'subspecies','subespecie'}: return 'subspecies'
    if s in {'variety','variedad'}: return 'variety'
    if s in {'form','forma'}: return 'form'
    n=str(name or '')
    if re.search(r'\bsubsp\.',n,re.I): return 'subspecies'
    if re.search(r'\bvar\.',n,re.I): return 'variety'
    if re.search(r'\bf\.',n,re.I): return 'form'
    return 'species'
def hybrid(v,flag=None):
    if flag is True:return True
    return bool(re.search(r'\sx\s',' '+str(v or '').replace('×','x')+' ',re.I))
def key(name,rank,hyb): return (norm_name(name),rank_norm(rank,name),bool(hyb))
def aliases(rec,mode):
    out=[];seen=set();sr=rank_norm(rec.get('sourceRank'),rec.get('nameVerbatim'));sh=hybrid(rec.get('nameVerbatim'),rec.get('isHybrid'))
    if mode=='explicit':
        seq=[]
        for e in rec.get('newSpanishRelations') or []: seq.append((e,'REL'))
        for q in rec.get('queries') or []:
            if q.get('origin')=='SPANISH_VERIFIED': seq.append((q,'QUERY'))
        for e,_ in seq:
            st=str(e.get('relationState') or ''); a=e.get('alias'); ar=rank_norm(e.get('aliasRank'),a); ah=hybrid(a)
            if a and st.startswith('DOCUMENTED_') and 'SAME_RANK' in st and 'GUARD' not in st and ar==sr and ah==sh:
                k=(norm_name(a),ar,ah,str(e.get('source') or ''))
                if k not in seen:
                    seen.add(k);out.append({'name':a,'rank':ar,'hybrid':ah,'source':e.get('source'),'relationState':st,'sourceUrl':e.get('sourceUrl')})
    else:
        for q in rec.get('queries') or []:
            a=q.get('alias');ar=rank_norm(q.get('aliasRank'),a);ah=hybrid(a)
            if a and q.get('origin')=='PRIOR_DOCUMENTED_NETWORK' and q.get('closureEligible') is True and ar==sr and ah==sh and norm_name(a)!=norm_name(rec.get('nameVerbatim')):
                k=(norm_name(a),ar,ah)
                if k not in seen: seen.add(k);out.append({'name':a,'rank':ar,'hybrid':ah})
    return out

cat=json.loads(CAT.read_text()); resolved=set(cat['R']); nonresolved=set(cat['C'])|set(cat['U'])
assert len(resolved)==47 and len(nonresolved)==262 and not resolved&nonresolved
rows={}
for line in CONSOLIDATED.read_text().splitlines():
    if line.strip():
        r=json.loads(line);rows[str(r['B_SOURCE_RECORD_ID'])]=r
assert set(rows)==resolved|nonresolved and len(rows)==309

rc2=[]
for line in RC2.read_text().splitlines():
    if not line.strip():continue
    r=json.loads(line);name=r.get('source_name_verbatim') or r.get('TAX_RIOJA') or r.get('tax_rioja');rid=r.get('release_row_id') or r.get('RELEASE_ROW_ID')
    if not name or not rid:raise RuntimeError('RC2_MEMBERSHIP_SCHEMA_UNEXPECTED')
    rc2.append({'targetType':'RC2','targetId':str(rid),'name':name,'rank':rank_norm(None,name),'hybrid':hybrid(name)})
assert len(rc2)==2210

res=json.loads(RES.read_text());new13=set(res['createNewOfficialIdHubSourceIds']);assert len(new13)==13
existing=defaultdict(list)
for t in rc2: existing[key(t['name'],t['rank'],t['hybrid'])].append(t)
for sid in new13:
    r=rows[sid];base={'targetType':'NEW13_OFFICIAL','targetId':'SOURCE_ID:'+sid,'sourceId':sid,'idTaxon':str(cat['R'][sid])}
    sr=rank_norm(r.get('sourceRank'),r['nameVerbatim']);sh=hybrid(r['nameVerbatim'],r.get('isHybrid'))
    existing[key(r['nameVerbatim'],sr,sh)].append({**base,'name':r['nameVerbatim'],'rank':sr,'hybrid':sh})
    for a in aliases(r,'explicit'): existing[key(a['name'],a['rank'],a['hybrid'])].append({**base,'name':a['name'],'rank':a['rank'],'hybrid':a['hybrid'],'aliasEvidence':a})

info={}
for sid in nonresolved:
    r=rows[sid];sr=rank_norm(r.get('sourceRank'),r['nameVerbatim']);sh=hybrid(r['nameVerbatim'],r.get('isHybrid'))
    info[sid]={'sid':sid,'category':r['finalCategory'],'name':r['nameVerbatim'],'rank':sr,'hybrid':sh,'sourceKey':key(r['nameVerbatim'],sr,sh),'explicit':aliases(r,'explicit'),'prior':aliases(r,'prior'),'state':r.get('state')}
NAMES.write_text(json.dumps({'schema':'JBLR_V18_NONRESOLVED_262_EXPLICIT_NAMES_V1','rows':[{k:v for k,v in x.items() if k not in {'sourceKey','prior'}} for x in sorted(info.values(),key=lambda z:int(z['sid']))]},ensure_ascii=False,separators=(',',':'))+'\n')

hits=defaultdict(list)
for sid,x in info.items():
    checks=[('EXACT_SOURCE_NAME_SAME_RANK',x['sourceKey'],None)]+[('DOCUMENTED_SAME_RANK_ALIAS',key(a['name'],a['rank'],a['hybrid']),a) for a in x['explicit']]
    seen=set()
    for reason,k,ev in checks:
        for t in existing.get(k,[]):
            ident=(t['targetType'],t['targetId'])
            if ident not in seen:seen.add(ident);hits[sid].append({'reason':reason,'target':t,'evidence':ev})

strong=[];review=[];edge_seen=set();source_by=defaultdict(list);explicit_by=defaultdict(list);prior_by=defaultdict(list)
for sid,x in info.items():
    source_by[x['sourceKey']].append(sid)
    for a in x['explicit']:explicit_by[key(a['name'],a['rank'],a['hybrid'])].append((sid,a))
    for a in x['prior']:prior_by[key(a['name'],a['rank'],a['hybrid'])].append(sid)
def edge(dst,a,b,reason,evidence=None):
    if a==b:return
    a,b=sorted((a,b),key=int);k=(a,b,reason)
    if k in edge_seen:return
    edge_seen.add(k);dst.append({'a':a,'b':b,'reason':reason,'evidence':evidence})
for k,sids in source_by.items():
    for i in range(len(sids)):
        for j in range(i+1,len(sids)):edge(strong,sids[i],sids[j],'EXACT_SOURCE_NAME_SAME_RANK')
for k,arr in explicit_by.items():
    for sid,a in arr:
        for other in source_by.get(k,[]):edge(strong,sid,other,'DOCUMENTED_ALIAS_TO_OTHER_SOURCE_NAME',a)
    bysrc=defaultdict(list)
    for sid,a in arr:bysrc[str(a.get('source') or '')].append((sid,a))
    for src,vals in bysrc.items():
        if src:
            for i in range(len(vals)):
                for j in range(i+1,len(vals)):edge(strong,vals[i][0],vals[j][0],'SHARED_DOCUMENTED_ALIAS_SAME_SOURCE',{'source':src,'alias':vals[i][1]['name']})
for sid,x in info.items():
    for a in x['prior']:
        k=key(a['name'],a['rank'],a['hybrid'])
        for other in source_by.get(k,[]):edge(review,sid,other,'PRIOR_NETWORK_ALIAS_TO_SOURCE_REVIEW_ONLY',a)
for k,sids in prior_by.items():
    for i in range(len(sids)):
        for j in range(i+1,len(sids)):edge(review,sids[i],sids[j],'SHARED_PRIOR_NETWORK_ALIAS_REVIEW_ONLY',{'aliasKey':k[0]})

parent={s:s for s in nonresolved}
def find(x):
    if parent[x]!=x:parent[x]=find(parent[x])
    return parent[x]
def union(a,b):
    a,b=find(a),find(b)
    if a!=b:parent[b]=a
for e in strong:union(e['a'],e['b'])
groups=defaultdict(list)
for s in nonresolved:groups[find(s)].append(s)
blockers=[];routing={}
for _,members in groups.items():
    targets={}
    for sid in members:
        for h in hits.get(sid,[]):targets.setdefault((h['target']['targetType'],h['target']['targetId']),[]).append({'sourceId':sid,**h})
    if len(targets)>1:
        blockers.append({'type':'IDENTITY_COLLISION_MULTIPLE_EXISTING_HUBS','members':sorted(members,key=int),'targets':[{'targetType':k[0],'targetId':k[1],'evidence':v} for k,v in targets.items()]});route={'route':'BLOCKED_IDENTITY_COLLISION','groupMembers':sorted(members,key=int)}
    elif len(targets)==1:
        ident,evid=next(iter(targets.items()));route={'route':'MERGE_EXISTING_HUB','targetType':ident[0],'targetId':ident[1],'groupMembers':sorted(members,key=int),'evidence':evid}
    else:route={'route':'PENDING_DIRECT_OFFICIAL_CHECK','groupMembers':sorted(members,key=int)}
    for sid in members:routing[sid]=route
for sid,hs in hits.items():
    if len({(h['target']['targetType'],h['target']['targetId']) for h in hs})>1:blockers.append({'type':'ROW_MATCHES_MULTIPLE_EXISTING_HUBS','sourceId':sid,'hits':hs})

out={'schema':'JBLR_V18_NONRESOLVED_262_IDENTITY_ROUTING_STAGE1_V1','scope':{'conflict':48,'unresolved':214,'total':262},'appliedTargets':['RC2_2210','NEW13_OFFICIAL'],'deferredTarget':'DIRECT_OFFICIAL_550','method':'STRICT_EXACT_NAME_OR_DOCUMENTED_SAME_RANK_ALIAS_ONLY;NO_FUZZY;PRIOR_NETWORK_OVERLAP_REVIEW_ONLY','counts':{'rows':262,'strongInternalEdges':len(strong),'reviewOnlyEdges':len(review),'identityGroups':len(groups),'mergeExistingRows':sum(routing[s]['route']=='MERGE_EXISTING_HUB' for s in nonresolved),'pendingDirectRows':sum(routing[s]['route']=='PENDING_DIRECT_OFFICIAL_CHECK' for s in nonresolved),'blockers':len(blockers)},'routing':{s:routing[s] for s in sorted(routing,key=int)},'existingHits':{s:hits[s] for s in sorted(hits,key=int) if hits[s]},'blockers':blockers}
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');EDGES.write_text(json.dumps({'schema':'JBLR_V18_NONRESOLVED_262_IDENTITY_EDGES_STAGE1_V1','strong':strong,'reviewOnly':review},ensure_ascii=False,indent=2)+'\n')
qa={'schema':'JBLR_V18_QA_NONRESOLVED_262_IDENTITY_STAGE1_V1','membership262':len(nonresolved)==262,'all262Accounted':set(routing)==nonresolved,'resolvedOverlap':len(resolved&nonresolved),'fuzzyMerges':0,'rankCollapse':0,'hybridCollapse':0,'sourceRowsLost':262-len(routing),'identityCollisionBlockers':len(blockers),'qaState':'PASS_STAGE1_PENDING_DIRECT_OFFICIAL_CHECK' if not blockers else 'STOP_REQUIRED_IDENTITY_COLLISION_UNRESOLVABLE'}
QAOUT.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'counts':out['counts'],'qa':qa},ensure_ascii=False))
if blockers:raise SystemExit(42)
