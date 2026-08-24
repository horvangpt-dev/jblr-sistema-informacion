#!/usr/bin/env python3
import json,re,sys
from pathlib import Path

def clean(s): return re.sub(r'\s+',' ',(s or '').replace('×','x')).strip()

def unsafe_shape(name):
    s=clean(name); low=s.lower(); toks=s.split()
    if re.search(r'\bgr\.?$',low): return 'QUALIFIED_GROUP_NAME'
    if re.search(r'\b(?:agg\.|aggregate)$',low): return 'QUALIFIED_AGGREGATE_NAME'
    if ' x ' in low: return 'HYBRID_FORMULA_OR_SHORTHAND'
    if re.search(r'\b(?:sp\.|spp\.)$',low): return 'OPEN_TAXON_NAME'
    if not re.search(r'\b(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\b',low):
        if len(toks)==3 and re.match(r'^[A-Z][A-Za-zÀ-ÿ-]+$',toks[0]) and re.match(r'^[a-z][A-Za-zÀ-ÿ0-9.-]+$',toks[1]) and re.match(r'^[a-z][A-Za-zÀ-ÿ0-9.-]+$',toks[2]):
            return 'UNMARKED_TRINOMIAL'
    return None

def main(inp,outdir):
    doc=json.loads(Path(inp).read_text(encoding='utf-8')); rows=doc['rows']
    assert len(rows)==313
    changed=[]; out=[]
    for r0 in rows:
        r=dict(r0); sh=unsafe_shape(r['NOMBRE_RIOJA_VERBATIM'])
        if sh:
            r['STRICT_NAME_SHAPE']=sh
            # Never inherit a species ID from a qualified, hybrid shorthand, open taxon or unmarked trinomial.
            if r.get('FINAL_GROUP')=='RESOLVED':
                changed.append({'B_SOURCE_RECORD_ID':r['B_SOURCE_RECORD_ID'],'NOMBRE_RIOJA_VERBATIM':r['NOMBRE_RIOJA_VERBATIM'],'oldId':r.get('MITECO_IDTAXON'),'shape':sh})
                r['FINAL_GROUP']='FAILED'
                r['FAILURE_OR_RESOLUTION_TYPE']='QUALIFIED_OR_UNMARKED_NAME_REQUIRES_EXPLICIT_SAME_FORM_RELATION'
                r['MITECO_IDTAXON']=None
                r['STRICT_QA_DEMOTED_FROM_RESOLVED']=True
            elif r.get('FAILURE_OR_RESOLUTION_TYPE') in ('NO_RESULT_IN_SPANISH_SOURCES_CONSULTED','SPANISH_RESULT_FOUND_BUT_NAMES_NOT_FOUND_IN_EIDOS'):
                r['FAILURE_OR_RESOLUTION_TYPE']='QUALIFIED_OR_UNMARKED_NAME_REQUIRES_EXPLICIT_SAME_FORM_RELATION'
        out.append(r)
    counts={}; groups={}
    for r in out:
        counts[r['FINAL_GROUP']]=counts.get(r['FINAL_GROUP'],0)+1
        k=r['FAILURE_OR_RESOLUTION_TYPE']; groups.setdefault(k,[]).append(r)
    groupCounts={k:len(v) for k,v in groups.items()}
    assert sum(counts.values())==313 and sum(groupCounts.values())==313
    receipt={
      'runClass':'CORPUS_B_CONTINUOUS_DEEP_SPANISH_313_STRICT_NAME_SHAPE_AUDIT',
      'inputRows':313,'outputRows':313,'counts':counts,'groupCounts':groupCounts,
      'resolvedRows':counts.get('RESOLVED',0),'failedRows':counts.get('FAILED',0),
      'qaDemotionsFromResolved':len(changed),'qaDemotions':changed,
      'baseContinuousResult':'CORPUS_B_CONTINUOUS_DEEP_SPANISH_313_20260824_001',
      'baseEidosSha256':doc['receipt']['eidosSha256'],'singleEidosLoadInBaseRun':doc['receipt']['singleEidosLoad'],
      'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,
      'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,
      'semantics':['NO_SILENT_INFERENCE','SOURCE_FAILURE!=NOT_FOUND','NOT_FOUND!=ABSENCE']
    }
    od=Path(outdir);od.mkdir(parents=True,exist_ok=True)
    (od/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (od/'FINAL_RESULTS_313.json').write_text(json.dumps({'receipt':receipt,'rows':out},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (od/'FINAL_GROUPED_RESULTS_313.json').write_text(json.dumps({'receipt':receipt,'groups':groups},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    compact={k:[{'B_SOURCE_RECORD_ID':r['B_SOURCE_RECORD_ID'],'name':r['NOMBRE_RIOJA_VERBATIM'],'MITECO_IDTAXON':r.get('MITECO_IDTAXON')} for r in v] for k,v in groups.items()}
    (od/'FINAL_COMPACT_GROUPS_313.json').write_text(json.dumps({'receipt':receipt,'groups':compact},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__': main(*sys.argv[1:3])
