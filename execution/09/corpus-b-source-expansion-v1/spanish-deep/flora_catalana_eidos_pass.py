#!/usr/bin/env python3
import concurrent.futures, hashlib, html, json, re, sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

BASE='https://floracatalana.cat/flora/vasculars/taxonsfinalssinonimsnocodi'
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36 JBLR-09-taxonomic-research/1.0'

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.in_tr=False; self.in_td=False; self.buf=[]; self.cell=[]; self.rows=[]
    def handle_starttag(self,tag,attrs):
        if tag=='tr': self.in_tr=True; self.buf=[]
        elif tag=='td' and self.in_tr: self.in_td=True; self.cell=[]
    def handle_data(self,d):
        if self.in_td: self.cell.append(d)
    def handle_endtag(self,tag):
        if tag=='td' and self.in_td:
            self.buf.append(re.sub(r'\s+',' ',' '.join(self.cell)).strip()); self.in_td=False
        elif tag=='tr' and self.in_tr:
            if self.buf: self.rows.append(self.buf)
            self.in_tr=False

def norm(s): return re.sub(r'\s+',' ',html.unescape(s or '').replace('×','x')).strip(' .;,').lower()
def canonical(s):
    s=re.sub(r'\s+',' ',html.unescape(s or '').replace('×','x')).strip()
    if re.search(r'\s[x×]\s+[A-Z]',s): return s.split(',')[0].strip()
    m=re.match(r'^([A-Z][A-Za-zÀ-ÿ-]+\s+(?:x\s+)?[a-z][A-Za-zÀ-ÿ0-9.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-z][A-Za-zÀ-ÿ0-9.-]+)?)',s)
    return m.group(1).replace('ssp.','subsp.').strip() if m else s.split(',')[0].strip()
def rank_of(c):
    c=norm(c)
    if ' subsp. ' in c or ' ssp. ' in c or ' nothosubsp. ' in c:return 'subspecies'
    if ' var. ' in c:return 'variety'
    if ' f. ' in c:return 'form'
    if ' x ' in c and len(c.split())>=4:return 'hybrid_formula'
    if c.endswith(' sp') or c.endswith(' sp.') or c.endswith(' spp') or c.endswith(' spp.'):return 'aggregate'
    return 'species'
def get(url,timeout=15):
    with urlopen(Request(url,headers={'User-Agent':UA,'Accept':'text/html,*/*'}),timeout=timeout) as r:
        raw=r.read(); enc=r.headers.get_content_charset() or 'utf-8'; return raw.decode(enc,'replace'),r.geturl()

def parse_fc_rows(raw):
    p=TableParser();p.feed(raw);out=[]
    for cells in p.rows:
        # expected visible columns: image, accepted scientific name, synonym, genus, family
        if len(cells)<3:continue
        candidates=[]
        # identify botanical-looking adjacent cells rather than rely only on position
        for i,c in enumerate(cells):
            cc=canonical(c)
            if re.match(r'^[A-Z][A-Za-zÀ-ÿ-]+\s+',cc): candidates.append((i,c,cc))
        if not candidates:continue
        # On this view first botanical cell is accepted name, next botanical cell (if any) synonym.
        accepted=candidates[0][2]; synonym=candidates[1][2] if len(candidates)>1 else ''
        out.append({'accepted':accepted,'synonym':synonym,'cells':cells})
    return out

def query_fc(original):
    u=(BASE+'?field_nom_cientific_value='+quote_plus(original)+
       '&field_nom_de_la_familia1_value=&field_nom_del_genere1_value=')
    try:
        raw,final=get(u); rows=parse_fc_rows(raw); exact=[]
        oc=canonical(original); on=norm(oc)
        for r in rows:
            if norm(r['accepted'])==on or (r['synonym'] and norm(r['synonym'])==on): exact.append(r)
        return {'state':'OK','url':final,'exactRows':exact,'returnedRows':len(rows)}
    except Exception as e:
        return {'state':'SOURCE_FAILURE','url':u,'detail':str(e)[:240],'exactRows':[],'returnedRows':0}

def build_eidos(ttl_path):
    idx={};sha=hashlib.sha256();size=0;block=[]
    def proc(lines):
        if not lines:return
        t='\n'.join(lines);mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t);mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not(mn and mi):return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t);mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t)
        c=canonical(mn.group(1));idx.setdefault(norm(c),[]).append({'scientificName':mn.group(1),'canonical':c,'taxonID':mi.group(1),'taxonomicStatus':ms.group(1) if ms else None,'taxonRank':mr.group(1) if mr else None})
    with open(ttl_path,'rb') as f:
        for ch in iter(lambda:f.read(1024*1024),b''):sha.update(ch);size+=len(ch)
    with open(ttl_path,encoding='utf-8',errors='replace') as f:
        for line in f:
            if not line.strip():proc(block);block=[]
            else:block.append(line.rstrip())
        proc(block)
    return idx,sha.hexdigest(),size

def eidos_lookup(idx,name,required_rank):
    c=canonical(name);recs=idx.get(norm(c),[])
    same=[r for r in recs if rank_of(r['canonical'])==required_rank]
    valid=[r for r in same if norm(r.get('taxonomicStatus')) in ('aceptado/válido','aceptado/valido')]
    return (valid[0] if len(valid)==1 else None),same

def main(queue,ttl,outdir):
    q=json.loads(Path(queue).read_text(encoding='utf-8')); targets=[r for r in q['rows'] if not r.get('MITECO_IDTAXON')]; assert len(targets)==337
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        source=list(ex.map(lambda r:query_fc(r['NOMBRE_RIOJA_VERBATIM']),targets))
    idx,esha,ebytes=build_eidos(ttl);results=[];counts={};explicit=0;crossrank=0
    for t,s in zip(targets,source):
        original=t['NOMBRE_RIOJA_VERBATIM']; oc=canonical(original); rr=rank_of(oc); supported=[]; cross=[]
        for row in s['exactRows']:
            for nm,rel in ((row['accepted'],'FLORA_CATALANA_ACCEPTED'),(row['synonym'],'FLORA_CATALANA_SYNONYM')):
                if not nm or norm(nm)==norm(oc):continue
                item={'name':nm,'relation':rel,'sourceUrl':s['url'],'sourceRow':row}
                if rank_of(nm)==rr: supported.append(item); explicit+=1
                else: cross.append(item); crossrank+=1
        # unique supported names
        uniq=[];seen=set()
        for x in supported:
            k=norm(x['name'])
            if k not in seen:seen.add(k);uniq.append(x)
        evidence=[];chosen=None;chosen_from=None
        # original first, then exact-rank source-backed names
        for nm in [oc]+[x['name'] for x in uniq]:
            ch,recs=eidos_lookup(idx,nm,rr); evidence.append({'queriedName':nm,'records':recs})
            if ch and chosen is None: chosen=ch;chosen_from=nm
        if chosen:
            state='RESOLVED_EXACT_ORIGINAL_NAME' if norm(chosen_from)==norm(oc) else 'RESOLVED_SPANISH_SYNONYM';rid=chosen['taxonID']
        elif s['state']=='SOURCE_FAILURE':state='SOURCE_FAILURE';rid=None
        elif s['exactRows']:state='HUMAN_REVIEW_REQUIRED';rid=None
        else:state='NOT_FOUND_IN_FLORA_CATALANA';rid=None
        counts[state]=counts.get(state,0)+1
        results.append({'B_SOURCE_RECORD_ID':str(t['B_SOURCE_RECORD_ID']),'NOMBRE_RIOJA_VERBATIM':original,'FLORA_CATALANA':s,'SUPPORTED_SAME_RANK_NAMES':uniq,'CROSS_RANK_RELATIONS_NOT_USED_FOR_ID':cross,'EIDOS_EVIDENCE':evidence,'TERMINAL_STATE':state,'MITECO_IDTAXON':rid,'SOURCE_PLAN_COMPLETE':False,'NO_FUZZY_EQUIVALENCE':True,'PARENT_ID_INHERITANCE':False})
    out=Path(outdir);out.mkdir(parents=True,exist_ok=True)
    receipt={'runClass':'FLORA_CATALANA_EXACT_SYNONYMY_TO_EIDOS_337','input':337,'output':len(results),'counts':counts,'resolvedNew':counts.get('RESOLVED_SPANISH_SYNONYM',0)+counts.get('RESOLVED_EXACT_ORIGINAL_NAME',0),'explicitSameRankRelations':explicit,'crossRankRelationsPreservedNotUsed':crossrank,'eidosSha256':esha,'eidosBytes':ebytes,'sourcePlanCompleteRows':0,'crossWithA':False,'neonWrites':0,'corpusBFreeze':False}
    (out/'FLORA_CATALANA_EIDOS_RESULTS.json').write_text(json.dumps({'receipt':receipt,'rows':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'RUN_RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main(*sys.argv[1:4])
