#!/usr/bin/env python3
import csv, hashlib, json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

def norm(s):
    return re.sub(r'\s+',' ',(s or '').replace('×','x')).strip(' .;,').lower()

def canonical(s):
    s=re.sub(r'\s+',' ',(s or '').replace('×','x')).strip()
    if re.search(r'\s[x×]\s+[A-Z]',s):
        return s.split(',')[0].strip()
    m=re.match(r'^([A-Z][A-Za-zÀ-ÿ-]+\s+(?:x\s+)?[a-z][A-Za-zÀ-ÿ0-9.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-z][A-Za-zÀ-ÿ0-9.-]+)?)',s)
    return m.group(1).replace('ssp.','subsp.').strip() if m else s.split(',')[0].strip()

def rank_of(c):
    c=norm(c)
    if ' subsp. ' in c or ' ssp. ' in c or ' nothosubsp. ' in c: return 'subspecies'
    if ' var. ' in c: return 'variety'
    if ' f. ' in c: return 'form'
    if ' x ' in c and len(c.split())>=4: return 'hybrid_formula'
    if c.endswith(' sp') or c.endswith(' sp.') or c.endswith(' spp') or c.endswith(' spp.'): return 'aggregate'
    return 'species'

def rank_norm(s):
    x=norm(s)
    return {'sp.':'species','species':'species','subsp.':'subspecies','ssp.':'subspecies','subspecies':'subspecies','var.':'variety','variety':'variety','forma':'form','form':'form'}.get(x,x)

def first_element(node,namespaced_path,plain_path,ns):
    el=node.find(namespaced_path,ns)
    return el if el is not None else node.find(plain_path)

def read_dwca(zip_path):
    z=zipfile.ZipFile(zip_path)
    meta=ET.fromstring(z.read('meta.xml'))
    ns={'d':'http://rs.tdwg.org/dwc/text/'}
    core=meta.find('d:core',ns)
    if core is None: core=meta.find('core')
    if core is None: raise RuntimeError('DwC-A meta.xml has no core')
    locel=first_element(core,'d:files/d:location','files/location',ns)
    if locel is None or not locel.text: raise RuntimeError('DwC-A core location missing')
    loc=locel.text.strip(); enc=core.attrib.get('encoding','UTF-8')
    delim=core.attrib.get('fieldsTerminatedBy','\\t').encode().decode('unicode_escape')
    quote=core.attrib.get('fieldsEnclosedBy',''); ignore=int(core.attrib.get('ignoreHeaderLines','0'))
    idel=first_element(core,'d:id','id',ns)
    fields={int(idel.attrib['index']):'id'}
    for f in list(core.findall('d:field',ns))+list(core.findall('field')):
        fields[int(f.attrib['index'])]=f.attrib.get('term','').rsplit('/',1)[-1]
    raw=z.read(loc).decode(enc,'replace').splitlines()
    rows=[]
    for vals in csv.reader(raw[ignore:],delimiter=delim,quotechar=quote if quote else '\x00'):
        rows.append({fields[i]:vals[i] if i<len(vals) else '' for i in fields})
    return rows,{
        'file':loc,'records':len(rows),'fields':fields,
        'zipSha256':hashlib.sha256(Path(zip_path).read_bytes()).hexdigest(),
        'zipBytes':Path(zip_path).stat().st_size
    }

def build_eidos(ttl_path):
    idx={}; block=[]
    def emit(lines):
        if not lines: return
        t='\n'.join(lines)
        mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t)
        mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not (mn and mi): return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t)
        mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t)
        ma=re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"',t)
        c=canonical(mn.group(1))
        idx.setdefault(norm(c),[]).append({
            'scientificName':mn.group(1),'canonical':c,'taxonID':mi.group(1),
            'taxonomicStatus':ms.group(1) if ms else None,
            'taxonRank':mr.group(1) if mr else None,
            'nameAccordingTo':ma.group(1) if ma else None
        })
    with open(ttl_path,encoding='utf-8',errors='replace') as f:
        for line in f:
            if not line.strip(): emit(block); block=[]
            else: block.append(line.rstrip())
        emit(block)
    p=Path(ttl_path)
    return idx,{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}

def eidos_eval(idx,name,required_rank):
    c=canonical(name); allrecs=idx.get(norm(c),[])
    same=[r for r in allrecs if rank_norm(r.get('taxonRank'))==required_rank]
    valid=[r for r in same if norm(r.get('taxonomicStatus')) in ('aceptado/válido','aceptado/valido')]
    if len(valid)==1: state='UNIQUE_ACCEPTED_SAME_RANK'; taxon=valid[0]['taxonID']
    elif len(valid)>1: state='MULTIPLE_ACCEPTED_SAME_RANK'; taxon=None
    elif same: state='SAME_RANK_PRESENT_NO_ACCEPTED'; taxon=None
    elif allrecs: state='ONLY_OTHER_RANKS_PRESENT'; taxon=None
    else: state='NAME_NOT_FOUND_IN_EIDOS'; taxon=None
    return {'queriedName':name,'canonical':c,'requiredRank':required_rank,'state':state,'taxonID':taxon,'records':allrecs,'sameRankRecords':same}

def main(carry317_path,batch03_path,batch02_path,fc_path,dwca_path,eidos_path,outdir):
    carry=json.loads(Path(carry317_path).read_text(encoding='utf-8'))
    b3=json.loads(Path(batch03_path).read_text(encoding='utf-8'))
    b2=json.loads(Path(batch02_path).read_text(encoding='utf-8'))
    fc=json.loads(Path(fc_path).read_text(encoding='utf-8'))

    carry_rows=carry['carryForwardRows']
    assert len(carry_rows)==317, len(carry_rows)
    b3_resolved={str(r['B_SOURCE_RECORD_ID']) for r in b3['rows'] if r.get('MITECO_IDTAXON')}
    assert len(b3_resolved)==4, b3_resolved
    rows=[r for r in carry_rows if str(r['B_SOURCE_RECORD_ID']) not in b3_resolved]
    assert len(rows)==313, len(rows)
    row_ids={str(r['B_SOURCE_RECORD_ID']) for r in rows}

    fc_map={str(r['B_SOURCE_RECORD_ID']):r for r in fc['rows']}
    b2_map={str(r['B_SOURCE_RECORD_ID']):r for r in b2['rows'] if str(r['B_SOURCE_RECORD_ID']) in row_ids}

    es,esmeta=read_dwca(dwca_path)
    es_bycanon={}
    for r in es:
        c=canonical(r.get('scientificName',''))
        if c: es_bycanon.setdefault(norm(c),[]).append(r)

    eidx,emeta=build_eidos(eidos_path)
    results=[]; counts={}; subcounts={}; resolved=[]

    for src in rows:
        bid=str(src['B_SOURCE_RECORD_ID']); original=src['NOMBRE_RIOJA_VERBATIM']; oc=canonical(original); rr=rank_of(oc)
        sourceEvidence=[]; candidates=[]; crossrank=[]; sourceFailures=[]; sourceHits=0

        f=fc_map.get(bid)
        if f:
            fs=(f.get('FLORA_CATALANA') or {})
            fstate=fs.get('state')
            if fstate=='SOURCE_FAILURE':
                sourceFailures.append({'source':'FLORA_CATALANA','detail':fs.get('detail'),'url':fs.get('url')})
            exact=fs.get('exactRows') or []
            if exact:
                sourceHits+=1
                sourceEvidence.append({'source':'FLORA_CATALANA','state':'EXPLICIT_RESULT','url':fs.get('url'),'exactRows':exact})
                candidates.append({'name':oc,'source':'FLORA_CATALANA','relation':'EXACT_NAME_IN_SOURCE'})
                for x in f.get('SUPPORTED_SAME_RANK_NAMES') or []:
                    candidates.append({'name':canonical(x['name']),'source':'FLORA_CATALANA','relation':x.get('relation'),'sourceUrl':x.get('sourceUrl')})
                for x in f.get('CROSS_RANK_RELATIONS_NOT_USED_FOR_ID') or []:
                    crossrank.append({'source':'FLORA_CATALANA','name':canonical(x.get('name')),'relation':x.get('relation'),'sourceUrl':x.get('sourceUrl')})
            elif fstate=='OK':
                sourceEvidence.append({'source':'FLORA_CATALANA','state':'NO_EXACT_RESULT','url':fs.get('url')})

        # Current official Spanish checklist: exact-name evidence at identical rank.
        esmatches=[]
        for er in es_bycanon.get(norm(oc),[]):
            erank=rank_norm(er.get('taxonRank')) or rank_of(canonical(er.get('scientificName','')))
            if erank==rr: esmatches.append(er)
        if esmatches:
            sourceHits+=1
            sourceEvidence.append({'source':'GBIF_SPAIN_FLORA_VASCULAR_CHECKLIST_v1.16','state':'EXACT_RESULT','records':esmatches})
            candidates.append({'name':oc,'source':'GBIF_SPAIN_FLORA_VASCULAR_CHECKLIST_v1.16','relation':'EXACT_NAME_IN_CURRENT_SPANISH_CHECKLIST'})
        else:
            sourceEvidence.append({'source':'GBIF_SPAIN_FLORA_VASCULAR_CHECKLIST_v1.16','state':'NO_EXACT_RESULT'})

        # Carry forward only non-resolved documentary evidence from accepted Batch02.
        m=b2_map.get(bid)
        if m:
            st=m.get('RESULT_STATE')
            if st=='RELATION_DOCUMENTED_NOT_ID_ELIGIBLE':
                crossrank.append({'source':m.get('source'),'name':canonical(m.get('candidate')),'relation':m.get('relation'),'evidence':m.get('evidence')})
                sourceHits+=1
                sourceEvidence.append({'source':m.get('source'),'state':'DOCUMENTED_CROSS_RANK_RELATION_ONLY','evidence':m.get('evidence')})
            elif st in ('EIDOS_NAME_PRESENT_SAME_RANK_NO_UNIQUE_ACCEPTED_RECORD','AMBIGUOUS_MULTIPLE_ACCEPTED_EIDOS_IDS_SAME_RANK'):
                candidates.append({'name':canonical(m.get('candidate')),'source':m.get('source'),'relation':m.get('relation'),'evidence':m.get('evidence')})
                sourceHits+=1
                sourceEvidence.append({'source':m.get('source'),'state':'DOCUMENTED_SAME_RANK_RELATION','evidence':m.get('evidence')})

        # Deduplicate candidate names while retaining provenance list.
        cand_by_name={}
        for c in candidates:
            k=norm(canonical(c['name']))
            if not k: continue
            cand_by_name.setdefault(k,{'name':canonical(c['name']),'provenance':[]})['provenance'].append(c)
        candidate_list=list(cand_by_name.values())

        evals=[eidos_eval(eidx,c['name'],rr) | {'provenance':c['provenance']} for c in candidate_list]
        ids={e['taxonID'] for e in evals if e.get('taxonID')}

        if len(ids)==1:
            state='RESOLVED'; sub='UNIQUE_ACCEPTED_EIDOS_ID_FROM_SPANISH_EVIDENCE'; rid=next(iter(ids))
        elif len(ids)>1:
            state='FAILED'; sub='CONFLICTING_SUPPORTED_NAMES_MULTIPLE_EIDOS_IDS'; rid=None
        else:
            rid=None
            est={e['state'] for e in evals}
            if crossrank and not candidate_list:
                state='FAILED'; sub='CROSS_RANK_RELATION_ONLY_NOT_ID_ELIGIBLE'
            elif 'MULTIPLE_ACCEPTED_SAME_RANK' in est:
                state='FAILED'; sub='EIDOS_MULTIPLE_ACCEPTED_IDS_SAME_RANK'
            elif 'SAME_RANK_PRESENT_NO_ACCEPTED' in est:
                state='FAILED'; sub='SPANISH_RELATION_FOUND_EIDOS_SAME_RANK_NO_ACCEPTED'
            elif 'ONLY_OTHER_RANKS_PRESENT' in est:
                state='FAILED'; sub='SPANISH_RELATION_FOUND_EIDOS_ONLY_OTHER_RANKS'
            elif candidate_list and est=={'NAME_NOT_FOUND_IN_EIDOS'}:
                state='FAILED'; sub='SPANISH_RESULT_FOUND_BUT_NAMES_NOT_FOUND_IN_EIDOS'
            elif sourceHits>0 and not candidate_list and crossrank:
                state='FAILED'; sub='CROSS_RANK_RELATION_ONLY_NOT_ID_ELIGIBLE'
            elif sourceHits>0:
                state='FAILED'; sub='SPANISH_RESULT_FOUND_NO_ID_RESOLUTION'
            elif sourceFailures:
                state='FAILED'; sub='SPANISH_SOURCE_FAILURE_WITHOUT_OTHER_RESULT'
            else:
                state='FAILED'; sub='NO_RESULT_IN_SPANISH_SOURCES_CONSULTED'

        counts[state]=counts.get(state,0)+1
        subcounts[sub]=subcounts.get(sub,0)+1
        rowout={
            'B_SOURCE_RECORD_ID':bid,'NOMBRE_RIOJA_VERBATIM':original,'RANK':rr,
            'FINAL_GROUP':state,'FAILURE_OR_RESOLUTION_TYPE':sub,'MITECO_IDTAXON':rid,
            'SPANISH_SOURCE_EVIDENCE':sourceEvidence,'SUPPORTED_SAME_RANK_CANDIDATES':candidate_list,
            'CROSS_RANK_RELATIONS_NOT_USED':crossrank,'SOURCE_FAILURES':sourceFailures,
            'EIDOS_EVALUATION':evals,'NO_FUZZY_EQUIVALENCE':True,
            'PARENT_ID_INHERITANCE':False,'NO_RANK_COLLAPSE':True
        }
        results.append(rowout)
        if state=='RESOLVED': resolved.append(rowout)

    assert len(results)==313
    assert sum(counts.values())==313
    grouped={k:[r for r in results if r['FAILURE_OR_RESOLUTION_TYPE']==k] for k in sorted(subcounts)}
    out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    receipt={
        'runClass':'CORPUS_B_CONTINUOUS_DEEP_SPANISH_313_CONSOLIDATED',
        'inputRows':313,'outputRows':313,'counts':counts,'groupCounts':subcounts,
        'resolvedRows':len(resolved),'failedRows':counts.get('FAILED',0),
        'spanishChecklistRecords':len(es),'spanishChecklistMeta':esmeta,
        'eidosSource':'https://datos.iepnb.es/datasets/eidos.ttl','eidosSha256':emeta['sha256'],'eidosBytes':emeta['bytes'],
        'singleEidosLoad':True,'sourceEvidenceInputs':[
            'FLORA_CATALANA_EIDOS_337_20260824_001 source evidence',
            'GBIF Spain flora vascular checklist v1.16 fresh DwC-A',
            'Batch02 unresolved documentary relations'
        ],
        'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,
        'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,
        'semantics':['SOURCE_FAILURE!=NOT_FOUND','NOT_FOUND!=ABSENCE','unknown!=absence']
    }
    (out/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'CONSOLIDATED_RESULTS_313.json').write_text(json.dumps({'receipt':receipt,'rows':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'GROUPED_RESULTS_313.json').write_text(json.dumps({'receipt':receipt,'groups':grouped},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'RESOLVED_313.json').write_text(json.dumps({'count':len(resolved),'rows':resolved},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))

if __name__=='__main__':
    main(*sys.argv[1:8])
