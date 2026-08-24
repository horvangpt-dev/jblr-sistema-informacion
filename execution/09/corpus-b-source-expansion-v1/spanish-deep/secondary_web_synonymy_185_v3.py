#!/usr/bin/env python3
import json, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import secondary_web_synonymy_185_v2 as core

# Extend the secondary-source universe discovered during the live web validation.
EXTRA = [
    {"key":"FLORA_VASCULAR_BIOSCRIPTS","domain":"floravascular.com","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]},
    {"key":"UGR_HERBARIUM_FLORA_ANDALUCIA_ORIENTAL","domain":"herbarium.ugr.es","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]},
    {"key":"US_FLORA_ANDALUCIA_AUTHOR_PAGES","domain":"personal.us.es","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]},
    {"key":"UMA_ACTA_BOTANICA_MALACITANA","domain":"revistas.uma.es","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]},
    {"key":"JOLUBE_BOTANICAL_CATALOGS","domain":"jolube.net","markers":["Sinónimos","Sinonimos","Sinonimia","Syn."]},
]
existing={x['key'] for x in core.SOURCES}
core.SOURCES = core.SOURCES + [x for x in EXTRA if x['key'] not in existing]
BASE_HITS = core.source_hits

SYMBOL_RE = re.compile(r"(?:\[\s*)?(?:=|≡|≠)\s*", re.I)
SYN_LABEL_RE = re.compile(r"\b(?:syn\.|synonym(?:s)?|sinonim(?:ia|ias|o|os)?|sinónim(?:ia|ias|o|os)?)\b", re.I)

def symbolic_relation_windows(text):
    out=[]
    lines=(text or '').splitlines()
    for i,line in enumerate(lines):
        s=line.strip()
        if not s: continue
        # Capture explicit nomenclatural/synonymic relation notation even without a titled section.
        if SYMBOL_RE.search(s) or SYN_LABEL_RE.search(s):
            block=' '.join(lines[max(0,i-1):min(len(lines),i+2)])
            names=core.scientific_names(block)
            if names:
                out.append({"text":core.short(block,1000),"names":names})
    return out

def broad_source_hits(seed,src,max_results=6):
    res=BASE_HITS(seed,src,max_results=max_results)
    # Re-fetch only returned source pages to discover explicit = / ≡ / Syn. relations that are
    # not inside a section headed 'Sinónimos'. Search ranking itself is not taxonomic evidence.
    seen={p['url'] for p in res.get('explicitSynonymyPages',[])}
    for sr in res.get('searchResults',[]):
        url=sr.get('url')
        if not url: continue
        try: doc=core.fetch_document(url)
        except Exception as e:
            res.setdefault('fetchFailures',[]).append({"url":url,"error":f"SYMBOLIC_REFETCH:{type(e).__name__}:{e}"}); continue
        rels=symbolic_relation_windows(doc.get('text',''))
        if not rels: continue
        primary=core.canonical(doc.get('title') or '')
        names=[]; keys=set()
        if len(primary.split())>=2: names.append(primary); keys.add(core.norm(primary))
        for rel in rels:
            for n in rel['names']:
                if core.norm(n) not in keys: keys.add(core.norm(n)); names.append(n)
        if not names: continue
        entry={"url":doc['url'],"kind":doc['kind'],"pagePrimary":primary,"names":names,"windows":[r['text'] for r in rels[:6]],"discoverySeed":seed,"relationExtraction":"EXPLICIT_SYMBOL_OR_SYNONYM_LABEL"}
        # It is safe to retain a second evidence record for the same URL because provenance is
        # later deduplicated by scientific name, not by page.
        res.setdefault('explicitSynonymyPages',[]).append(entry)
    return res

core.source_hits = broad_source_hits

def main(groups_path,eidos_path,outdir):
    data=json.loads(Path(groups_path).read_text(encoding='utf-8'))
    rows=data['groups'][core.ROOT_GROUP]
    assert len(rows)==185
    eidx,emeta=core.build_eidos(eidos_path)
    results=[None]*len(rows)
    # Parallelize taxa while preserving taxon-by-taxon outputs. Each taxon still searches each source independently.
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures={ex.submit(core.process_taxon,row,eidx):(i,row) for i,row in enumerate(rows)}
        done=0
        for fut in as_completed(futures):
            i,row=futures[fut]
            try: r=fut.result()
            except Exception as e:
                r={"B_SOURCE_RECORD_ID":str(row['B_SOURCE_RECORD_ID']),"NOMBRE_RIOJA_VERBATIM":row['name'],"RANK":core.rank_of(row['name']),"FINAL_GROUP":"EXECUTION_FAILURE_TAXON","MITECO_IDTAXON":None,"ERROR":f"{type(e).__name__}:{e}","SYNONYMY_COMPENDIUM":[],"EIDOS_UNIQUE_NAME_QUERIES":[],"SOURCE_RUNS":[],"DISCOVERY_MODE":True,"NO_FUZZY_EQUIVALENCE":True,"PARENT_ID_INHERITANCE":False,"NO_RANK_COLLAPSE":True}
            results[i]=r; done+=1
            print(f"[{done:03d}/185] source-row={r['B_SOURCE_RECORD_ID']} {r['NOMBRE_RIOJA_VERBATIM']} => {r['FINAL_GROUP']} {r.get('MITECO_IDTAXON') or ''}",flush=True)
    assert all(r is not None for r in results)
    groups={}
    source_stats={s['key']:{"taxaQueried":185,"searchFailureTaxa":0,"searchHitTaxa":0,"explicitSynonymyTaxa":0,"explicitPages":0,"fetchFailures":0} for s in core.SOURCES}
    for r in results:
        groups.setdefault(r['FINAL_GROUP'],[]).append(r)
        for sr in r.get('SOURCE_RUNS',[]):
            st=source_stats[sr['source']]
            if sr.get('searchErrors'): st['searchFailureTaxa']+=1
            if sr.get('searchResults'): st['searchHitTaxa']+=1
            if sr.get('explicitSynonymyPages'): st['explicitSynonymyTaxa']+=1
            st['explicitPages']+=len(sr.get('explicitSynonymyPages',[])); st['fetchFailures']+=len(sr.get('fetchFailures',[]))
    counts={k:len(v) for k,v in groups.items()}; resolved=sum(1 for r in results if r.get('MITECO_IDTAXON'))
    total_names=sum(len(r.get('SYNONYMY_COMPENDIUM',[])) for r in results)
    out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    receipt={"runClass":"CORPUS_B_SECONDARY_WEB_SYNONYMY_DISCOVERY_185_V3_TO_EIDOS","inputRows":185,"outputRows":185,"resolvedRows":resolved,"groupCounts":counts,"sources":[s['key'] for s in core.SOURCES],"sourceStats":source_stats,"discoveredUniqueNamesAcrossTaxa":total_names,"eidosSource":"https://datos.iepnb.es/datasets/eidos.ttl","eidosBytes":emeta['bytes'],"eidosSha256":emeta['sha256'],"singleEidosLoad":True,"discoveryMode":True,"seedNotRequiredInsideSynonymyBlock":True,"searchRankingNotEvidence":True,"explicitSymbolRelationsIncluded":True,"deduplicateNamesPerTaxonBeforeEidos":True,"sourceCountPreserved":True,"queryEveryUniqueDiscoveredNameOnce":True,"taxonWorkers":4,"crossWithA":False,"neonWrites":0,"corpusBFreeze":False,"noFuzzy":True,"noParentIdInheritance":True,"noRankCollapse":True,"semantics":["SOURCE_FAILURE!=NOT_FOUND","NOT_FOUND!=ABSENCE","NO_SILENT_INFERENCE","DISCOVERY_CANDIDATE!=VALIDATED_SYNONYM"]}
    (out/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'SECONDARY_WEB_COMPENDIUM_185_V3.json').write_text(json.dumps({"receipt":receipt,"rows":results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'GROUPED_RESULTS_185_V3.json').write_text(json.dumps({"receipt":receipt,"groups":groups},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'RESOLVED_185_V3.json').write_text(json.dumps({"receipt":receipt,"rows":[r for r in results if r.get('MITECO_IDTAXON')]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False,indent=2))

if __name__=='__main__': main(*sys.argv[1:4])
