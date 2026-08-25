#!/usr/bin/env python3
import argparse, importlib.util, io, json, re, sys, time
from pathlib import Path
from urllib.parse import quote_plus, urlparse, parse_qs, unquote

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

UA = 'JBLR-06-SpanishSynonymToEIDOS/1.0 (+evidence-first; batch-safe)'
DDG = 'https://html.duckduckgo.com/html/'
DOMAINS = {
    'FLORA_IBERICA': 'floraiberica.es',
    'FLORA_MONTIBERICA': 'floramontiberica.org',
    'FLORA_ANDALUCIA': 'floradeandalucia.es',
    'HVMO': 'herbarivirtual.uib.es',
}
BATCHES = {1:(0,100), 2:(100,200), 3:(200,309)}

session = requests.Session()
session.headers.update({'User-Agent': UA, 'Accept-Language': 'es,en;q=0.8'})


def jdump(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def jsonl(path, rows):
    with Path(path).open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',',':'))+'\n')


def norm(s):
    return re.sub(r'\s+', ' ', (s or '').replace('×',' x ').strip()).casefold()


def load_engine(path):
    spec=importlib.util.spec_from_file_location('jblr_engine', path)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def fetch(url, timeout=30):
    last=None
    for n in range(3):
        try:
            r=session.get(url, timeout=timeout, allow_redirects=True)
            if r.status_code==429:
                time.sleep(2+n*2); continue
            r.raise_for_status(); return r
        except Exception as e:
            last=e; time.sleep(1+n)
    raise last


def ddg_url(href):
    if not href: return None
    if href.startswith('//'): href='https:'+href
    try:
        p=urlparse(href)
        if 'duckduckgo.com' in p.netloc:
            u=parse_qs(p.query).get('uddg',[None])[0]
            if u: return unquote(u)
    except Exception: pass
    return href if href.startswith('http') else None


def search_exact(name):
    q='"'+name+'" ('+' OR '.join('site:'+d for d in DOMAINS.values())+')'
    r=fetch(DDG+'?q='+quote_plus(q), timeout=30)
    soup=BeautifulSoup(r.text,'html.parser')
    out=[]
    for a in soup.select('a.result__a')[:12]:
        u=ddg_url(a.get('href'))
        if not u: continue
        host=urlparse(u).netloc.casefold().replace('www.','')
        src=next((k for k,d in DOMAINS.items() if host.endswith(d)),None)
        if src: out.append({'source':src,'url':u,'title':a.get_text(' ',strip=True)})
    # exact-dedup
    seen=set(); ret=[]
    for x in out:
        k=(x['source'],x['url'])
        if k not in seen: seen.add(k); ret.append(x)
    return ret


def page_text(url):
    r=fetch(url,timeout=45)
    ctype=(r.headers.get('content-type') or '').lower()
    if 'pdf' in ctype or url.lower().split('?')[0].endswith('.pdf'):
        reader=PdfReader(io.BytesIO(r.content))
        txt='\n'.join((p.extract_text() or '') for p in reader.pages[:40])
        return txt, None, r.url, 'PDF'
    soup=BeautifulSoup(r.content,'html.parser')
    for x in soup(['script','style','noscript']): x.decompose()
    txt=soup.get_text('\n',strip=True)
    h1=soup.find('h1')
    heading=h1.get_text(' ',strip=True) if h1 else None
    return txt, heading, r.url, 'HTML'


def strip_authorship(engine, text):
    t=re.sub(r'\s+',' ',(text or '').strip())
    # remove common labels/punctuation before canonical parser
    t=re.sub(r'^(?:Sin[oó]nimos de|Tax[oó]n|Nombre aceptado|Accepted name(?: of)?)\s*[:\-]?\s*','',t,flags=re.I)
    return engine.canonical(t)


def accepted_from_source(engine, source, text, heading, url, source_name):
    aliases=[]; evidence=[]
    nt=norm(text); ns=norm(source_name)
    if ns not in nt:
        return aliases, evidence
    if source=='FLORA_IBERICA':
        m=re.search(r'Sin[oó]nimos de\s+([^\n\r]+)', text, flags=re.I)
        if m:
            a=strip_authorship(engine,m.group(1))
            if a: aliases.append(a); evidence.append('HEADING_SYNONYMS_OF')
    elif source=='FLORA_ANDALUCIA':
        if heading:
            a=strip_authorship(engine,heading)
            if a: aliases.append(a); evidence.append('TAXON_PAGE_H1')
        else:
            m=re.search(r'(?:^|\n)([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+\s+[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+(?:\s+(?:subsp\.|var\.|f\.)\s+[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+)?)', text)
            if m:
                aliases.append(strip_authorship(engine,m.group(1))); evidence.append('FIRST_SCIENTIFIC_HEADING_FALLBACK')
    elif source=='HVMO':
        if heading:
            a=strip_authorship(engine,heading)
            if a: aliases.append(a); evidence.append('HVMO_H1')
        # redirected canonical page may encode a name; page heading remains primary
    elif source=='FLORA_MONTIBERICA':
        # Supporting only: do not infer an alias from a paper unless an explicit equivalence marker is present.
        # Extract conservative explicit A = B / A -> B / "sinónimo de" patterns involving the source name.
        sn=re.escape(source_name)
        pats=[
            rf'{sn}\s*(?:=|≡|→|->|sin[oó]nimo de)\s*([A-Z][A-Za-z.-]+\s+[a-z][A-Za-z.-]+(?:\s+(?:subsp\.|var\.|f\.)\s+[a-z][A-Za-z.-]+)?)',
            rf'([A-Z][A-Za-z.-]+\s+[a-z][A-Za-z.-]+(?:\s+(?:subsp\.|var\.|f\.)\s+[a-z][A-Za-z.-]+)?)\s*(?:=|≡|→|->)\s*{sn}',
        ]
        for p in pats:
            for m in re.finditer(p,text,flags=re.I):
                a=strip_authorship(engine,m.group(1))
                if a: aliases.append(a); evidence.append('EXPLICIT_EQUIVALENCE_PATTERN')
    # dedup and drop self
    ret=[]
    for a in aliases:
        if a and norm(a)!=ns and norm(a) not in {norm(x) for x in ret}: ret.append(a)
    return ret, evidence


def hybrid_formula(name):
    return bool(re.search(r'\s(?:x|×)\s', ' '+re.sub(r'\s+',' ',name or '').strip()+' ', flags=re.I))


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',required=True); ap.add_argument('--eidos',required=True)
    ap.add_argument('--engine',required=True); ap.add_argument('--previous',required=True)
    ap.add_argument('--batch',type=int,choices=[1,2,3],required=True); ap.add_argument('--out',required=True)
    args=ap.parse_args(); out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    engine=load_engine(args.engine)
    src=json.load(open(args.source,encoding='utf-8'))
    rows=src['groups']['NO_RESULT_IN_SPANISH_SOURCES_CONSULTED']
    assert len(rows)==309 and len({str(x['B_SOURCE_RECORD_ID']) for x in rows})==309
    lo,hi=BATCHES[args.batch]; batch=rows[lo:hi]; expected=hi-lo
    assert len(batch)==expected
    prev=json.load(open(args.previous,encoding='utf-8'))['rows']
    pmap={str(x['B_SOURCE_RECORD_ID']):x for x in prev}
    assert all(str(x['B_SOURCE_RECORD_ID']) in pmap for x in batch)

    eidx=engine.build_eidos(Path(args.eidos))
    assert len(eidx)>=1000
    results=[]; source_ledger=[]; eq_ledger=[]
    rows_with_new=0; new_alias_count=0; source_failures=0

    for pos,row in enumerate(batch,lo+1):
        rid=str(row['B_SOURCE_RECORD_ID']); verb=row['name']; src_rank=engine.detect_rank(verb); src_hybrid=hybrid_formula(verb)
        prevrow=pmap[rid]
        aliases=[]
        for a in [engine.canonical(verb)]+list(prevrow.get('synonymsAndParallelTreatments') or []):
            if a and norm(a) not in {norm(x) for x in aliases}: aliases.append(a)
        spanish=[]; search_state='NOT_RUN'; hits=[]
        try:
            hits=search_exact(verb); search_state='SEARCH_OK'
        except Exception as e:
            search_state='SEARCH_FAILURE:'+type(e).__name__; source_failures+=1
        per_source={k:{'state':'SEARCH_INDEX_NO_RESULT','hits':0,'newAliases':[]} for k in DOMAINS}
        for h in hits:
            s=h['source']; per_source[s]['hits']+=1
            try:
                text,heading,final_url,kind=page_text(h['url'])
                found,evidence=accepted_from_source(engine,s,text,heading,final_url,verb)
                per_source[s]['state']='PAGE_CHECKED'
                per_source[s].setdefault('evidenceUrls',[]).append(final_url)
                per_source[s].setdefault('evidenceModes',[]).extend(evidence)
                for a in found:
                    if norm(a) not in {norm(x) for x in aliases+spanish}:
                        spanish.append(a); per_source[s]['newAliases'].append(a)
            except Exception as e:
                per_source[s]['state']='SOURCE_FAILURE:'+type(e).__name__; source_failures+=1
        if spanish:
            rows_with_new+=1; new_alias_count+=len(spanish); aliases.extend(spanish)

        q=[]; eligible_ids=[]; guarded=[]
        for alias in aliases:
            arank=engine.detect_rank(alias); ahybrid=hybrid_formula(alias)
            ev=engine.accepted_eidos_exact(eidx, alias, arank)
            rec={'queryName':alias,'aliasRank':arank,'aliasHybrid':ahybrid,'eidosState':ev.get('state'),'taxonID':str(ev.get('taxonID')) if ev.get('taxonID') is not None else None}
            eligible=(arank==src_rank and ahybrid==src_hybrid and not src_hybrid)
            rec['eligibleForClosure']=eligible
            if not eligible: guarded.append({'alias':alias,'reason':'RANK_OR_HYBRID_GUARD'})
            if eligible and rec['taxonID']: eligible_ids.append(rec['taxonID'])
            q.append(rec)
        ids=sorted(set(eligible_ids))
        if src_hybrid:
            state='CONFLICT_HYBRID_FORMULA_REQUIRES_EXPLICIT_IDENTITY_EVIDENCE'; taxon_id=None
        elif len(ids)==1:
            state='RESOLVED_UNIQUE_EXACT_EIDOS_ID_VIA_DOCUMENTED_NETWORK'; taxon_id=ids[0]
        elif len(ids)>1:
            state='CONFLICT_MULTIPLE_EXACT_EIDOS_IDS_VIA_DOCUMENTED_NETWORK'; taxon_id=None
        else:
            state='UNRESOLVED_AFTER_SPANISH_NETWORK_AND_EIDOS'; taxon_id=None
        results.append({'batch':args.batch,'position309':pos,'B_SOURCE_RECORD_ID':rid,'nameVerbatim':verb,'sourceRank':src_rank,'isHybrid':src_hybrid,'documentedAliases':aliases,'newSpanishAliases':spanish,'ID_TAXON_EXACT':taxon_id,'state':state,'guardedAliases':guarded})
        source_ledger.append({'B_SOURCE_RECORD_ID':rid,'nameVerbatim':verb,'searchState':search_state,'sources':per_source})
        eq_ledger.append({'B_SOURCE_RECORD_ID':rid,'queries':q})
        time.sleep(0.25)

    resolved=sum(1 for x in results if x['ID_TAXON_EXACT'])
    conflicts=sum(1 for x in results if x['state'].startswith('CONFLICT_'))
    unresolved=len(results)-resolved-conflicts
    qa={
        'pass': len(results)==expected and len({x['B_SOURCE_RECORD_ID'] for x in results})==expected,
        'batch':args.batch,'slice':[lo+1,hi],'expectedRows':expected,'processedRows':len(results),
        'uniqueIds':len({x['B_SOURCE_RECORD_ID'] for x in results}),
        'resolved':resolved,'conflicts':conflicts,'unresolved':unresolved,
        'rowsWithNewSpanishAliases':rows_with_new,'newSpanishAliasCount':new_alias_count,'sourceFailureEvents':source_failures,
        'guards':{'noFuzzy':True,'noParentIdInheritance':True,'noRankCollapse':True,'hybridGuard':True,'sourceFailureNotNotFound':True,'closed1953Untouched':True},
        'semantics':['SOURCE_NAME_VERBATIM_PRESERVED','DOCUMENTED_ALIAS_BEFORE_EIDOS','EXACT_EIDOS_ONLY','REGIONAL_NOT_FOUND!=ABSENCE','SOURCE_FAILURE!=NOT_FOUND']
    }
    assert qa['pass']
    jsonl(out/'BATCH_RESULTS.jsonl',results); jsonl(out/'SOURCE_PROVENANCE.jsonl',source_ledger); jsonl(out/'EIDOS_QUERY_LEDGER.jsonl',eq_ledger); jdump(out/'SUMMARY.json',qa)
    print(json.dumps(qa,ensure_ascii=False))

if __name__=='__main__': main()
