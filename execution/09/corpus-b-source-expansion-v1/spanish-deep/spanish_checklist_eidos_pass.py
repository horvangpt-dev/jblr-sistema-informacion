#!/usr/bin/env python3
import csv, hashlib, json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

def norm(s): return re.sub(r'\s+',' ',(s or '').replace('×','x')).strip(' .;,').lower()
def canonical(s):
    s=re.sub(r'\s+',' ',(s or '').replace('×','x')).strip()
    if re.search(r'\s[x×]\s+[A-Z]',s): return s.split(',')[0].strip()
    m=re.match(r'^([A-Z][A-Za-zÀ-ÿ-]+\s+(?:x\s+)?[a-z][A-Za-zÀ-ÿ0-9.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-z][A-Za-zÀ-ÿ0-9.-]+)?)',s)
    return m.group(1).replace('ssp.','subsp.').strip() if m else s.split(',')[0].strip()
def rank_of(c):
    c=norm(c)
    if ' subsp. ' in c or ' ssp. ' in c or ' nothosubsp. ' in c: return 'subspecies'
    if ' var. ' in c: return 'variety'
    if ' f. ' in c: return 'form'
    if ' x ' in c and len(c.split())>=4:return 'hybrid_formula'
    return 'species'

def read_dwca(zip_path):
    z=zipfile.ZipFile(zip_path)
    meta=ET.fromstring(z.read('meta.xml'))
    ns={'d':'http://rs.tdwg.org/dwc/text/'}
    core=meta.find('d:core',ns)
    if core is None: core=meta.find('core')
    loc=(core.find('d:files/d:location',ns) or core.find('files/location')).text
    enc=core.attrib.get('encoding','UTF-8')
    delim=core.attrib.get('fieldsTerminatedBy','\\t').encode().decode('unicode_escape')
    quote=core.attrib.get('fieldsEnclosedBy','')
    ignore=int(core.attrib.get('ignoreHeaderLines','0'))
    idel=core.find('d:id',ns) or core.find('id')
    fields={int(idel.attrib['index']):'id'}
    for f in list(core.findall('d:field',ns))+list(core.findall('field')):
        term=f.attrib.get('term','').rsplit('/',1)[-1]
        fields[int(f.attrib['index'])]=term
    raw=z.read(loc).decode(enc,'replace').splitlines()
    rows=[]
    reader=csv.reader(raw[ignore:],delimiter=delim,quotechar=quote if quote else '\x00')
    for vals in reader:
        d={fields[i]:vals[i] if i<len(vals) else '' for i in fields}
        rows.append(d)
    return rows,{'file':loc,'fields':fields,'records':len(rows),'zip_sha256':hashlib.sha256(Path(zip_path).read_bytes()).hexdigest()}

def build_eidos(ttl):
    idx={}; block=[]
    def proc(lines):
        if not lines:return
        t='\n'.join(lines)
        mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t); mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not (mn and mi):return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t); mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t)
        c=canonical(mn.group(1)); idx.setdefault(norm(c),[]).append({'scientificName':mn.group(1),'canonical':c,'taxonID':mi.group(1),'status':ms.group(1) if ms else None,'rank':mr.group(1) if mr else None})
    with open(ttl,encoding='utf-8',errors='replace') as f:
        for line in f:
            if not line.strip(): proc(block); block=[]
            else:block.append(line.rstrip())
        proc(block)
    return idx

def choose_eidos(idx,name):
    c=canonical(name); recs=[r for r in idx.get(norm(c),[]) if rank_of(r['canonical'])==rank_of(c)]
    valid=[r for r in recs if norm(r.get('status')) in ('aceptado/válido','aceptado/valido')]
    return (valid[0] if len(valid)==1 else None),recs

def main(queue,archive,ttl,outdir):
    q=json.loads(Path(queue).read_text(encoding='utf-8'))
    targets=[r for r in q['rows'] if not r.get('MITECO_IDTAXON')]; assert len(targets)==337
    es,meta=read_dwca(archive)
    bycanon={}; byid={}
    for r in es:
        sn=r.get('canonicalName') or canonical(r.get('scientificName',''))
        if sn: bycanon.setdefault(norm(sn),[]).append(r)
        tid=r.get('taxonID') or r.get('id')
        if tid: byid[tid]=r
    eidx=build_eidos(ttl)
    results=[]; counts={}; exact_es=0; rel_es=0
    for t in targets:
        original=t['NOMBRE_RIOJA_VERBATIM']; c=canonical(original)
        matches=[r for r in bycanon.get(norm(c),[]) if rank_of(r.get('canonicalName') or canonical(r.get('scientificName','')))==rank_of(c)]
        supported=[]
        for r in matches:
            exact_es+=1
            status=norm(r.get('taxonomicStatus'))
            acc_id=r.get('acceptedNameUsageID','')
            acc_name=r.get('acceptedNameUsage','') or r.get('acceptedScientificName','')
            if acc_id and acc_id in byid:
                ar=byid[acc_id]; acc_name=ar.get('canonicalName') or canonical(ar.get('scientificName',''))
            if acc_name and norm(canonical(acc_name))!=norm(c):
                supported.append({'name':canonical(acc_name),'relation':'SPANISH_CHECKLIST_ACCEPTED_NAME_USAGE','sourceTaxonID':r.get('taxonID') or r.get('id'),'acceptedNameUsageID':acc_id})
                rel_es+=1
            elif status in ('accepted','aceptado','aceptado/válido','aceptado/valido') or not acc_id:
                supported.append({'name':c,'relation':'SPANISH_CHECKLIST_EXACT_NAME','sourceTaxonID':r.get('taxonID') or r.get('id')})
        names=[]
        for n in [original]+[x['name'] for x in supported]:
            if norm(canonical(n)) not in [norm(canonical(x)) for x in names]: names.append(n)
        chosen=None; evidence=[]
        for n in names:
            ch,recs=choose_eidos(eidx,n); evidence.append({'name':n,'records':recs})
            if ch: chosen=ch; break
        if chosen:
            state='RESOLVED_SPANISH_SYNONYM' if norm(chosen['canonical'])!=norm(c) else 'RESOLVED_EXACT_ORIGINAL_NAME'; rid=chosen['taxonID']
        else:
            state='HUMAN_REVIEW_REQUIRED' if matches else 'NOT_FOUND_IN_SPANISH_CHECKLIST'; rid=None
        counts[state]=counts.get(state,0)+1
        results.append({'B_SOURCE_RECORD_ID':str(t['B_SOURCE_RECORD_ID']),'NOMBRE_RIOJA_VERBATIM':original,'SPANISH_CHECKLIST_MATCHES':matches,'SUPPORTED_NAMES':supported,'EIDOS_EVIDENCE':evidence,'TERMINAL_STATE':state,'MITECO_IDTAXON':rid,'NO_FUZZY_EQUIVALENCE':True,'PARENT_ID_INHERITANCE':False})
    out=Path(outdir);out.mkdir(parents=True,exist_ok=True)
    receipt={'input':337,'output':len(results),'spanishChecklistRecords':len(es),'spanishChecklistMeta':meta,'exactSpanishChecklistMatches':exact_es,'explicitAcceptedNameRelations':rel_es,'counts':counts,'resolvedNew':sum(v for k,v in counts.items() if k.startswith('RESOLVED_')),'sourcePlanCompleteRows':0,'crossWithA':False,'neonWrites':0,'corpusBFreeze':False}
    (out/'STRUCTURED_SPANISH_CHECKLIST_RESULTS.json').write_text(json.dumps({'receipt':receipt,'rows':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main(*sys.argv[1:5])
