#!/usr/bin/env python3
import concurrent.futures, hashlib, html, json, re, sys, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote_plus, unquote, urljoin, urlparse, parse_qs
from urllib.request import Request, urlopen

UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36 JBLR-09-taxonomic-research/1.0'
FI='https://www.floraiberica.es/PHP/'

class Textify(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]
    def handle_data(self,d):
        if d and d.strip(): self.parts.append(d.strip())

def clean_text(raw):
    p=Textify(); p.feed(raw); return re.sub(r'\s+',' ',' '.join(p.parts))

def get(url, timeout=12):
    req=Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8'})
    with urlopen(req,timeout=timeout) as r:
        b=r.read()
        ct=r.headers.get_content_charset() or 'iso-8859-1'
        try: return b.decode(ct,'replace'), r.geturl(), len(b)
        except LookupError: return b.decode('utf-8','replace'), r.geturl(), len(b)

def norm(s):
    s=html.unescape(s or '').replace('×','x')
    s=re.sub(r'\s+',' ',s).strip(' .;,')
    return s.lower()

def canonical(s):
    s=html.unescape(s or '').replace('×','x')
    s=re.sub(r'\s+',' ',s).strip()
    # hybrid formulae are kept verbatim enough to avoid parent-ID inheritance
    if re.search(r'\s[x×]\s+[A-Z]', s): return re.sub(r'\s+',' ',s.split(',')[0]).strip()
    m=re.match(r'^([A-Z][A-Za-zÀ-ÿ-]+\s+(?:x\s+)?[a-z][A-Za-zÀ-ÿ0-9.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-z][A-Za-zÀ-ÿ0-9.-]+)?)',s)
    return m.group(1).replace('ssp.','subsp.').strip() if m else s.split(',')[0].strip()

def rank_of(c):
    c=norm(c)
    if ' subsp. ' in c or ' ssp. ' in c or ' nothosubsp. ' in c: return 'subspecies'
    if ' var. ' in c: return 'variety'
    if ' f. ' in c: return 'form'
    if ' x ' in c and len(c.split())>=4: return 'hybrid_formula'
    return 'species'

def extract_genus_links(raw, genus):
    out=[]
    for m in re.finditer(r'<a[^>]+href=["\']([^"\']*cientificos2\.php\?[^"\']+)["\'][^>]*>(.*?)</a>',raw,re.I|re.S):
        href=html.unescape(m.group(1)); txt=clean_text(m.group(2))
        if txt.startswith(genus[0]+'. '): txt=genus+txt[2:]
        out.append((canonical(txt),urljoin(FI,href)))
    return out

def extract_fi_accepted(raw):
    txt=clean_text(raw)
    m=re.search(r'Sin[oó]nimos de\s+(.+?)\s+Clave de sin[oó]nimos',txt,re.I)
    if not m: return None
    return canonical(m.group(1))

def fi_page_supports(raw, original):
    return norm(original) in norm(clean_text(raw))

def search_links(query):
    urls=[]; errors=[]
    engines=[
      ('DDG','https://html.duckduckgo.com/html/?q='+quote_plus(query)),
      ('BING','https://www.bing.com/search?q='+quote_plus(query))
    ]
    for eid,url in engines:
        try:
            raw,_,_=get(url,10)
            # direct URLs and encoded redirect URLs
            for h in re.findall(r'href=["\']([^"\']+)["\']',raw,re.I):
                h=html.unescape(h)
                if 'uddg=' in h:
                    try: h=unquote(parse_qs(urlparse(h).query).get('uddg',[''])[0])
                    except Exception: pass
                if h.startswith('/url?'):
                    try: h=parse_qs(urlparse(h).query).get('q',[''])[0]
                    except Exception: pass
                if h.startswith('//'): h='https:'+h
                if 'floraiberica.es/' in h:
                    h=h.split('&')[0]
                    if h not in urls: urls.append(h)
            if urls: break
        except Exception as e: errors.append({'engine':eid,'detail':str(e)[:180]})
    return urls[:8],errors

def build_eidos_index(ttl_path):
    idx={}; sha=hashlib.sha256(); size=0; block=[]
    def process(lines):
        if not lines: return
        text='\n'.join(lines)
        mname=re.search(r'Darwin:scientificName\s+"([^"]+)"',text)
        mid=re.search(r'Darwin:taxonID\s+"([^"]+)"',text)
        if not (mname and mid): return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',text)
        mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',text)
        nm=mname.group(1); c=canonical(nm); key=norm(c)
        idx.setdefault(key,[]).append({'scientificName':nm,'canonical':c,'taxonID':mid.group(1),'taxonomicStatus':ms.group(1) if ms else None,'taxonRank':mr.group(1) if mr else None})
    with open(ttl_path,'rb') as fb:
        for chunk in iter(lambda:fb.read(1024*1024),b''): sha.update(chunk); size+=len(chunk)
    with open(ttl_path,'r',encoding='utf-8',errors='replace') as f:
        for line in f:
            if not line.strip(): process(block); block=[]
            else: block.append(line.rstrip('\n'))
        process(block)
    return idx,sha.hexdigest(),size

def choose_eidos(idx, names):
    evidence=[]
    for source_name in names:
        c=canonical(source_name); recs=idx.get(norm(c),[])
        same_rank=[r for r in recs if rank_of(r['canonical'])==rank_of(c)]
        valid=[r for r in same_rank if norm(r.get('taxonomicStatus')) in ('aceptado/válido','aceptado/valido')]
        evidence.append({'queriedName':source_name,'canonical':c,'records':same_rank})
        if len(valid)==1: return valid[0],evidence
        if len(valid)>1: return None,evidence
    return None,evidence

def research_row(row, genus_cache):
    bid=str(row['B_SOURCE_RECORD_ID']); original=row['NOMBRE_RIOJA_VERBATIM']; genus=original.split()[0] if original.split() else ''
    ledger={'B_SOURCE_RECORD_ID':bid,'original':original,'spanishSources':[],'supportedNames':[]}
    if not genus or genus.lower() in ('sp.','spp.'):
        ledger['spanishSources'].append({'source':'FLORA_IBERICA','state':'NOT_APPLICABLE_UNPARSABLE_GENUS'})
        return ledger
    # 1 direct accepted-name lookup on FI genus page
    g=genus_cache.get(genus)
    if g and g.get('ok'):
        for ac,url in g['links']:
            if norm(ac)==norm(canonical(original)):
                ledger['supportedNames'].append({'name':ac,'relation':'ACCEPTED_NAME_EXACT','source':'FLORA_IBERICA','url':url})
                ledger['spanishSources'].append({'source':'FLORA_IBERICA','state':'EXPLICIT_RELATION_FOUND','url':url,'method':'GENUS_ACCEPTED_INDEX'})
                return ledger
    # 2 exact-name site discovery to FI synonym page
    q='site:floraiberica.es/PHP/cientificos2.php "'+original+'"'
    links,errs=search_links(q)
    for u in links:
        try:
            raw,final,_=get(u,12)
            if 'cientificos2.php' not in final and 'cientificos2.php' not in u: continue
            if not fi_page_supports(raw,original): continue
            ac=extract_fi_accepted(raw)
            if ac:
                ledger['supportedNames'].append({'name':ac,'relation':'EXPLICIT_ACCEPTED_NAME_FOR_ORIGINAL','source':'FLORA_IBERICA','url':final})
                ledger['spanishSources'].append({'source':'FLORA_IBERICA','state':'EXPLICIT_RELATION_FOUND','url':final,'method':'EXACT_SITE_DISCOVERY'})
                return ledger
        except Exception as e:
            errs.append({'url':u,'detail':str(e)[:180]})
    # 3 evidence-only fallback search across other Spanish sources; no relation inferred from locator
    ledger['spanishSources'].append({'source':'FLORA_IBERICA','state':'NO_EXPLICIT_RELATION_FOUND_OR_ACCESS_FAILURE','discoveryErrors':errs})
    other_sites=[('FLORA_MONTIBERICA','floramontiberica.org'),('HVMO_UIB','herbarivirtual.uib.es'),('FLORA_CATALANA','floracatalana.cat')]
    for sid,site in other_sites:
        urls,e=search_links('site:'+site+' "'+original+'" sinonim')
        ledger['spanishSources'].append({'source':sid,'state':'DISCOVERY_POINTERS_ONLY' if urls else 'NO_POINTER_OR_SOURCE_FAILURE','urls':urls[:3],'errors':e})
    return ledger

def main(queue_path,ttl_path,out_dir):
    q=json.loads(Path(queue_path).read_text(encoding='utf-8'))
    rows=[r for r in q['rows'] if not r.get('MITECO_IDTAXON')]
    assert len(rows)==337, len(rows)
    out=Path(out_dir); out.mkdir(parents=True,exist_ok=True)
    # genus pages cached once
    genera=sorted({r['NOMBRE_RIOJA_VERBATIM'].split()[0] for r in rows if r['NOMBRE_RIOJA_VERBATIM'].split()})
    genus_cache={}
    def load_genus(g):
        u=FI+'cientificos_.php?gen='+quote_plus(g)
        try:
            raw,final,n=get(u,12); return g,{'ok':True,'url':final,'bytes':n,'links':extract_genus_links(raw,g)}
        except Exception as e: return g,{'ok':False,'url':u,'detail':str(e)[:200],'links':[]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for g,res in ex.map(load_genus,genera): genus_cache[g]=res
    # per-row Spanish research, bounded concurrency
    ledgers=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for led in ex.map(lambda r: research_row(r,genus_cache),rows): ledgers.append(led)
    Path(out/'SPANISH_SYNONYMY_LEDGER.json').write_text(json.dumps({'rows':ledgers},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    idx,ttl_sha,ttl_bytes=build_eidos_index(ttl_path)
    results=[]; counts={}
    for led in ledgers:
        names=[led['original']]+[x['name'] for x in led['supportedNames']]
        chosen,evidence=choose_eidos(idx,names)
        if chosen:
            state='RESOLVED_SPANISH_SYNONYM' if norm(chosen['canonical'])!=norm(canonical(led['original'])) else 'RESOLVED_EXACT_ORIGINAL_NAME'
            rid=chosen['taxonID']
        else:
            # distinguish source access/evidence limitation from not-found
            has_rel=bool(led['supportedNames'])
            state='HUMAN_REVIEW_REQUIRED' if has_rel else 'SOURCE_FAILURE'
            rid=None
        counts[state]=counts.get(state,0)+1
        results.append({'B_SOURCE_RECORD_ID':led['B_SOURCE_RECORD_ID'],'NOMBRE_RIOJA_VERBATIM':led['original'],'TERMINAL_STATE':state,'MITECO_IDTAXON':rid,'SUPPORTED_SPANISH_NAMES':led['supportedNames'],'EIDOS_EVIDENCE':evidence,'SOURCE_PLAN_COMPLETE':False,'NO_FUZZY_EQUIVALENCE':True,'PARENT_ID_INHERITANCE':False})
    receipt={'runClass':'CORPUS_B_SPANISH_DEEP_337','input':337,'output':len(results),'counts':counts,'resolvedNew':sum(v for k,v in counts.items() if k.startswith('RESOLVED_')),'eidosSource':'https://datos.iepnb.es/datasets/eidos.ttl','eidosSha256':ttl_sha,'eidosBytes':ttl_bytes,'floraIbericaGenusPages':len(genera),'floraIbericaGenusFetchOK':sum(1 for v in genus_cache.values() if v['ok']),'sourcePlanCompleteRows':0,'crossWithA':False,'neonWrites':0,'corpusBFreeze':False,'semantics':['SOURCE_FAILURE!=NOT_FOUND','NOT_FOUND!=ABSENCE','NO_FUZZY_EQUIVALENCE','NO_PARENT_ID_INHERITANCE']}
    Path(out/'CORPUS_B_337_SPANISH_DEEP_RESULTS.json').write_text(json.dumps({'receipt':receipt,'rows':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    Path(out/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))

if __name__=='__main__': main(sys.argv[1],sys.argv[2],sys.argv[3])
