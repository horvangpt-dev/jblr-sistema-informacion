#!/usr/bin/env python3
import base64,gzip,json,re,unicodedata
from pathlib import Path
from collections import defaultdict

ROOT=Path('execution/0000/v18/successor-rioja-2262')
CAT=ROOT/'CATEGORY_MAP_309_COMPACT.json'
RES=ROOT/'RESOLVED_47_ROUTING_SUMMARY.json'
DIRECT_B64=ROOT/'inputs/DIRECT_OFFICIAL_550_INDEX.json.gz.b64'
CONSOLIDATED=Path('/tmp/CONSOLIDATED_309.jsonl')
RC2=Path('/tmp/RC2_MEMBERSHIP_2210.jsonl')
OUT=ROOT/'NONRESOLVED_262_IDENTITY_ROUTING.json'
EDGES=ROOT/'NONRESOLVED_262_IDENTITY_EDGES.json'
QAOUT=ROOT/'QA_NONRESOLVED_262_IDENTITY.json'


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
    if flag is True: return True
    s=' '+str(v or '').replace('×','x')+' '
    return bool(re.search(r'\sx\s',s,re.I))

def key(name,rank,hyb):
    return (norm_name(name),rank_norm(rank,name),bool(hyb))

def explicit_aliases(rec):
    out=[]; seen=set(); sr=rank_norm(rec.get('sourceRank'),rec.get('nameVerbatim')); sh=hybrid(rec.get('nameVerbatim'),rec.get('isHybrid'))
    for e in rec.get('newSpanishRelations') or []:
        st=str(e.get('relationState') or '')
        alias=e.get('alias'); ar=rank_norm(e.get('aliasRank'),alias); ah=hybrid(alias)
        if alias and st.startswith('DOCUMENTED_') and 'SAME_RANK' in st and 'GUARD' not in st and ar==sr and ah==sh:
            k=(norm_name(alias),ar,ah,str(e.get('source') or ''))
            if k not in seen:
                seen.add(k); out.append({'name':alias,'rank':ar,'hybrid':ah,'source':e.get('source'),'relationState':st,'sourceUrl':e.get('sourceUrl')})
    for q in rec.get('queries') or []:
        st=str(q.get('relationState') or '')
        alias=q.get('alias'); ar=rank_norm(q.get('aliasRank'),alias); ah=hybrid(alias)
        if alias and q.get('origin')=='SPANISH_VERIFIED' and st.startswith('DOCUMENTED_') and 'SAME_RANK' in st and 'GUARD' not in st and ar==sr and ah==sh:
            k=(norm_name(alias),ar,ah,str(q.get('source') or ''))
            if k not in seen:
                seen.add(k); out.append({'name':alias,'rank':ar,'hybrid':ah,'source':q.get('source'),'relationState':st,'sourceUrl':q.get('sourceUrl')})
    return out

def prior_aliases(rec):
    out=[]; seen=set(); sr=rank_norm(rec.get('sourceRank'),rec.get('nameVerbatim')); sh=hybrid(rec.get('nameVerbatim'),rec.get('isHybrid'))
    for q in rec.get('queries') or []:
        alias=q.get('alias'); ar=rank_norm(q.get('aliasRank'),alias); ah=hybrid(alias)
        if alias and q.get('origin')=='PRIOR_DOCUMENTED_NETWORK' and q.get('closureEligible') is True and ar==sr and ah==sh:
            k=(norm_name(alias),ar,ah)
            if k not in seen and norm_name(alias)!=norm_name(rec.get('nameVerbatim')):
                seen.add(k); out.append({'name':alias,'rank':ar,'hybrid':ah})
    return out

cat=json.loads(CAT.read_text())
resolved=set(cat['R']); nonresolved=set(cat['C'])|set(cat['U'])
assert len(resolved)==47 and len(nonresolved)==262 and not resolved&nonresolved

rows={}
for line in CONSOLIDATED.read_text().splitlines():
    if line.strip():
        r=json.loads(line); rows[str(r['B_SOURCE_RECORD_ID'])]=r
assert set(rows)==resolved|nonresolved and len(rows)==309

rc2_rows=[]
for line in RC2.read_text().splitlines():
    if not line.strip(): continue
    r=json.loads(line)
    name=r.get('source_name_verbatim') or r.get('TAX_RIOJA') or r.get('tax_rioja')
    rid=r.get('release_row_id') or r.get('RELEASE_ROW_ID')
    if not name or not rid: raise RuntimeError('RC2_MEMBERSHIP_SCHEMA_UNEXPECTED')
    rc2_rows.append({'targetType':'RC2','targetId':str(rid),'name':name,'rank':rank_norm(None,name),'hybrid':hybrid(name)})
assert len(rc2_rows)==2210

direct=json.loads(gzip.decompress(base64.b64decode(DIRECT_B64.read_text().strip())))
assert direct['count']==550 and len(direct['rows'])==550

direct_rows=[]
for r in direct['rows']:
    if r.get('special_existing_rc2_by_identity'):
        direct_rows.append({'targetType':'RC2','targetId':'JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2:ROW:0679','name':r['name'],'rank':r['rank'],'hybrid':r['hybrid'],'viaDirectId':r['id_taxon'],'sourceRiojaId':r['rioja_id']})
    else:
        direct_rows.append({'targetType':'DIRECT_OFFICIAL','targetId':'RIOJA_ID:'+str(r['rioja_id']),'name':r['name'],'rank':r['rank'],'hybrid':r['hybrid'],'idTaxon':r['id_taxon']})

res=json.loads(RES.read_text())
new13=set(res['createNewOfficialIdHubSourceIds']); assert len(new13)==13
new13_rows=[]
for sid in sorted(new13,key=int):
    r=rows[sid]; base={'targetType':'NEW13_OFFICIAL','targetId':'SOURCE_ID:'+sid,'sourceId':sid,'idTaxon':str(cat['R'][sid])}
    new13_rows.append({**base,'name':r['nameVerbatim'],'rank':rank_norm(r.get('sourceRank'),r['nameVerbatim']),'hybrid':hybrid(r['nameVerbatim'],r.get('isHybrid'))})
    for a in explicit_aliases(r): new13_rows.append({**base,'name':a['name'],'rank':a['rank'],'hybrid':a['hybrid'],'aliasEvidence':a})

indexes=defaultdict(list)
for t in rc2_rows+direct_rows+new13_rows:
    indexes[key(t['name'],t['rank'],t['hybrid'])].append(t)

info={}
for sid in nonresolved:
    r=rows[sid]; sr=rank_norm(r.get('sourceRank'),r['nameVerbatim']); sh=hybrid(r['nameVerbatim'],r.get('isHybrid'))
    info[sid]={'sid':sid,'category':r['finalCategory'],'name':r['nameVerbatim'],'rank':sr,'hybrid':sh,'sourceKey':key(r['nameVerbatim'],sr,sh),'explicit':explicit_aliases(r),'prior':prior_aliases(r),'state':r.get('state')}

# Existing-hub evidence. Exact source-name equality and explicit documented same-rank aliases only.
existing_hits=defaultdict(list)
for sid,x in info.items():
    evidence_keys=[('EXACT_SOURCE_NAME_SAME_RANK',x['sourceKey'],None)]
    for a in x['explicit']:
        evidence_keys.append(('DOCUMENTED_SAME_RANK_ALIAS',key(a['name'],a['rank'],a['hybrid']),a))
    seen=set()
    for reason,k,ev in evidence_keys:
        for t in indexes.get(k,[]):
            ident=(t['targetType'],t['targetId'])
            if ident in seen: continue
            seen.add(ident); existing_hits[sid].append({'reason':reason,'target':t,'evidence':ev})

# Strong internal equivalence edges.
strong=[]; review=[]
ids=sorted(nonresolved,key=int)
source_by_key=defaultdict(list)
explicit_by_key=defaultdict(list)
prior_by_key=defaultdict(list)
for sid,x in info.items():
    source_by_key[x['sourceKey']].append(sid)
    for a in x['explicit']:
        explicit_by_key[key(a['name'],a['rank'],a['hybrid'])].append((sid,a))
    for a in x['prior']:
        prior_by_key[key(a['name'],a['rank'],a['hybrid'])].append(sid)

edge_seen=set()
def add_edge(dst,a,b,reason,evidence=None):
    if a==b:return
    aa,bb=sorted((a,b),key=int); k=(aa,bb,reason)
    if k in edge_seen:return
    edge_seen.add(k); dst.append({'a':aa,'b':bb,'reason':reason,'evidence':evidence})

for k,sids in source_by_key.items():
    if len(sids)>1:
        for i in range(len(sids)):
            for j in range(i+1,len(sids)): add_edge(strong,sids[i],sids[j],'EXACT_SOURCE_NAME_SAME_RANK')
for k,arr in explicit_by_key.items():
    for sid,a in arr:
        for other in source_by_key.get(k,[]): add_edge(strong,sid,other,'DOCUMENTED_ALIAS_TO_OTHER_SOURCE_NAME',a)
    # same documented alias from same named source => same treatment anchor
    bysrc=defaultdict(list)
    for sid,a in arr: bysrc[str(a.get('source') or '')].append((sid,a))
    for src,vals in bysrc.items():
        if src and len(vals)>1:
            for i in range(len(vals)):
                for j in range(i+1,len(vals)): add_edge(strong,vals[i][0],vals[j][0],'SHARED_DOCUMENTED_ALIAS_SAME_SOURCE',{'source':src,'alias':vals[i][1]['name']})
# prior network overlap is review-only, never auto-merged.
for sid,x in info.items():
    for a in x['prior']:
        k=key(a['name'],a['rank'],a['hybrid'])
        for other in source_by_key.get(k,[]): add_edge(review,sid,other,'PRIOR_NETWORK_ALIAS_TO_SOURCE_REVIEW_ONLY',a)
for k,sids in prior_by_key.items():
    if len(sids)>1:
        for i in range(len(sids)):
            for j in range(i+1,len(sids)): add_edge(review,sids[i],sids[j],'SHARED_PRIOR_NETWORK_ALIAS_REVIEW_ONLY',{'aliasKey':k[0]})

# Union-find on strong edges only.
parent={sid:sid for sid in nonresolved}
def find(x):
    while parent[x]!=x:
        parent[x]=parent[parent[x]];x=parent[x]
    return x
def union(a,b):
    ra,rb=find(a),find(b)
    if ra!=rb: parent[rb]=ra
for e in strong: union(e['a'],e['b'])
groups=defaultdict(list)
for sid in nonresolved: groups[find(sid)].append(sid)

blockers=[]; routing={}
for root,members in groups.items():
    targets={}
    for sid in members:
        for h in existing_hits.get(sid,[]):
            ident=(h['target']['targetType'],h['target']['targetId'])
            targets.setdefault(ident,[]).append({'sourceId':sid,**h})
    if len(targets)>1:
        blockers.append({'type':'IDENTITY_COLLISION_MULTIPLE_EXISTING_HUBS','members':sorted(members,key=int),'targets':[{'targetType':k[0],'targetId':k[1],'evidence':v} for k,v in targets.items()]})
        route={'route':'BLOCKED_IDENTITY_COLLISION','groupMembers':sorted(members,key=int)}
    elif len(targets)==1:
        ident,evid=next(iter(targets.items()))
        route={'route':'MERGE_EXISTING_HUB','targetType':ident[0],'targetId':ident[1],'groupMembers':sorted(members,key=int),'evidence':evid}
    else:
        route={'route':'NEW_TEMPORARY_IDENTITY_HUB','groupMembers':sorted(members,key=int)}
    for sid in members: routing[sid]=route

# Rows individually matching >1 hub are already captured by group blocker; record exact diagnostics.
for sid,hits in existing_hits.items():
    distinct={(h['target']['targetType'],h['target']['targetId']) for h in hits}
    if len(distinct)>1:
        blockers.append({'type':'ROW_MATCHES_MULTIPLE_EXISTING_HUBS','sourceId':sid,'hits':hits})

merge_rows=sum(1 for sid in nonresolved if routing[sid]['route']=='MERGE_EXISTING_HUB')
temp_groups={tuple(routing[s]['groupMembers']) for s in nonresolved if routing[s]['route']=='NEW_TEMPORARY_IDENTITY_HUB'}
merge_groups={tuple(routing[s]['groupMembers']) for s in nonresolved if routing[s]['route']=='MERGE_EXISTING_HUB'}
blocked_rows=sum(1 for sid in nonresolved if routing[sid]['route']=='BLOCKED_IDENTITY_COLLISION')

out={
 'schema':'JBLR_V18_NONRESOLVED_262_IDENTITY_ROUTING_V1',
 'scope':{'conflict':48,'unresolved':214,'total':262},
 'method':'STRICT_EXACT_NAME_OR_DOCUMENTED_SAME_RANK_ALIAS_ONLY;NO_FUZZY;PRIOR_NETWORK_OVERLAP_REVIEW_ONLY',
 'counts':{'rows':262,'strongInternalEdges':len(strong),'reviewOnlyEdges':len(review),'identityGroups':len(groups),'mergeExistingRows':merge_rows,'mergeExistingGroups':len(merge_groups),'newTemporaryIdentityGroups':len(temp_groups),'blockedRows':blocked_rows,'blockers':len(blockers)},
 'routing':{sid:routing[sid] for sid in sorted(routing,key=int)},
 'existingHits':{sid:existing_hits[sid] for sid in sorted(existing_hits,key=int) if existing_hits[sid]},
 'blockers':blockers
}
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
EDGES.write_text(json.dumps({'schema':'JBLR_V18_NONRESOLVED_262_IDENTITY_EDGES_V1','strong':strong,'reviewOnly':review},ensure_ascii=False,indent=2)+'\n')
qa={
 'schema':'JBLR_V18_QA_NONRESOLVED_262_IDENTITY_V1',
 'membership262':len(nonresolved)==262,
 'all262Accounted':set(routing)==nonresolved,
 'resolvedOverlap':len(resolved&nonresolved),
 'strongEdgesUseExactOrExplicitEvidence':True,
 'fuzzyMerges':0,
 'rankCollapse':0,
 'hybridCollapse':0,
 'sourceRowsLost':262-len(routing),
 'identityCollisionBlockers':len(blockers),
 'qaState':'PASS_READY_FOR_TEMP_ID_ALLOCATION' if not blockers else 'STOP_REQUIRED_IDENTITY_COLLISION_UNRESOLVABLE'
}
QAOUT.write_text(json.dumps(qa,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'counts':out['counts'],'qa':qa},ensure_ascii=False))
if blockers: raise SystemExit(42)
