#!/usr/bin/env python3
import csv, json, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import secondary_web_synonymy_185_v3 as v3


def main(groups_path, outdir):
    data=json.loads(Path(groups_path).read_text(encoding='utf-8'))
    rows=data['groups'][v3.core.ROOT_GROUP]
    assert len(rows)==185, len(rows)
    sources=v3.core.SOURCES
    stats={s['key']:{
        'taxaQueried':185,'searchFailureTaxa':0,'searchHitTaxa':0,
        'explicitSynonymyTaxa':0,'explicitPages':0,'fetchFailures':0,
        'discoveredNameOccurrences':0,'uniqueDiscoveredNames':0
    } for s in sources}
    per_source_names={s['key']:set() for s in sources}
    per_taxon=[]
    tasks=[]
    with ThreadPoolExecutor(max_workers=24) as ex:
        for row in rows:
            for src in sources:
                fut=ex.submit(v3.broad_source_hits,row['name'],src,6)
                tasks.append((fut,row,src))
        done=0
        for fut,row,src in tasks:
            try:
                sr=fut.result()
            except Exception as e:
                sr={'source':src['key'],'searchErrors':[f'{type(e).__name__}:{e}'],'searchResults':[],
                    'explicitSynonymyPages':[],'fetchFailures':[]}
            st=stats[src['key']]
            if sr.get('searchErrors'): st['searchFailureTaxa']+=1
            if sr.get('searchResults'): st['searchHitTaxa']+=1
            pages=sr.get('explicitSynonymyPages',[])
            if pages: st['explicitSynonymyTaxa']+=1
            st['explicitPages']+=len(pages)
            st['fetchFailures']+=len(sr.get('fetchFailures',[]))
            names=[]; seen=set()
            for p in pages:
                for n in p.get('names',[]):
                    c=v3.core.canonical(n); k=v3.core.norm(c)
                    if k and k not in seen:
                        seen.add(k); names.append(c); per_source_names[src['key']].add(k)
            st['discoveredNameOccurrences']+=len(names)
            per_taxon.append({'B_SOURCE_RECORD_ID':str(row['B_SOURCE_RECORD_ID']),'name':row['name'],
                              'source':src['key'],'searchHit':bool(sr.get('searchResults')),
                              'explicitSynonymy':bool(pages),'explicitPages':len(pages),
                              'discoveredNames':names,'searchErrors':sr.get('searchErrors',[]),
                              'fetchFailures':sr.get('fetchFailures',[])})
            done+=1
            if done%100==0: print(f'[{done}/{len(rows)*len(sources)}]',flush=True)
    for key in stats:
        stats[key]['uniqueDiscoveredNames']=len(per_source_names[key])
        stats[key]['taxaNoSearchHit']=185-stats[key]['searchHitTaxa']
        stats[key]['taxaNoExplicitSynonymy']=185-stats[key]['explicitSynonymyTaxa']
    ranking=sorted(([k,v] for k,v in stats.items()), key=lambda kv:(-kv[1]['explicitSynonymyTaxa'],-kv[1]['uniqueDiscoveredNames'],-kv[1]['searchHitTaxa'],kv[0]))
    out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    receipt={'runClass':'CORPUS_B_SECONDARY_SOURCE_YIELD_AUDIT_185','inputTaxa':185,'sourceCount':len(sources),
             'totalSourceTaxonQueries':185*len(sources),'workers':24,'noEidosAssignment':True,
             'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,'sourceStats':stats,
             'ranking':[{'source':k,**v} for k,v in ranking],
             'semantics':['SEARCH_HIT!=EXPLICIT_SYNONYMY','DISCOVERY_CANDIDATE!=VALIDATED_SYNONYM','SOURCE_FAILURE!=NOT_FOUND']}
    (out/'SOURCE_YIELD_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'SOURCE_YIELD_DETAIL_185.json').write_text(json.dumps({'receipt':receipt,'rows':per_taxon},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (out/'SOURCE_YIELD_RANKING.csv').open('w',encoding='utf-8',newline='') as f:
        w=csv.writer(f); w.writerow(['source','taxaQueried','searchHitTaxa','explicitSynonymyTaxa','explicitPages','uniqueDiscoveredNames','discoveredNameOccurrences','searchFailureTaxa','fetchFailures'])
        for k,v in ranking: w.writerow([k,v['taxaQueried'],v['searchHitTaxa'],v['explicitSynonymyTaxa'],v['explicitPages'],v['uniqueDiscoveredNames'],v['discoveredNameOccurrences'],v['searchFailureTaxa'],v['fetchFailures']])
    print(json.dumps(receipt,ensure_ascii=False,indent=2))

if __name__=='__main__': main(*sys.argv[1:3])
