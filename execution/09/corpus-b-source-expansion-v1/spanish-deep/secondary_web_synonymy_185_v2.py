#!/usr/bin/env python3
import hashlib, json, os, re, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import requests
from bs4 import BeautifulSoup
try:
    from ddgs import DDGS
except Exception:
    DDGS = None

ROOT_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"
SOURCES = [
    {"key":"FLORA_ANDALUCIA","domain":"florandalucia.es","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"ASTURNATURA","domain":"asturnatura.com","markers":["Sinónimos","Sinonimos","Sinonimia","Basiónimo","Basionimo"]},
    {"key":"HVMO_UIB","domain":"herbarivirtual.uib.es","markers":["Sinónimos","Sinonimos","Sinònims","Sinonims","Sinonímia","Sinonimia"]},
    {"key":"FLORA_CANARIAS","domain":"floradecanarias.es","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"FLORA_CATALANA","domain":"floracatalana.cat","markers":["Sinònims","Sinonims","Sinónimos","Sinonimos","Sinonímia","Sinonimia"]},
    {"key":"FLORAGON_JACA","domain":"floragon.ipe.csic.es","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"FLORA_MONTIBERICA","domain":"floramontiberica.org","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"ARANZADI_MUNIBE","domain":"aranzadi.eus","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"UNAVARRA","domain":"unavarra.es","markers":["Sinónimos","Sinonimos","Sinonimia","sinónimos principales","sinonimos principales"]},
    {"key":"CICYTEX_EXTREMADURA","domain":"cicytex.juntaex.es","markers":["Sinónimos","Sinonimos","Sinonimia"]},
]
STOP_HEADINGS = [
    "Descripción","Descripcion","Origen","Categorías","Categorias","Ecología","Ecologia",
    "Nombres vernáculos","Nombres vernaculos","Etimología","Etimologia","Clasificación","Clasificacion",
    "Hábitat","Habitat","Distribución","Distribucion","Referencias","Bibliografía","Bibliografia",
    "Fenología","Fenologia","Observaciones","Taxonomía","Taxonomia","Imágenes","Imagenes","Galería","Galeria"
]
UA = "JBLR-botanical-evidence/1.1 (+research; discovery-only explicit synonymy)"
SCI_RE = re.compile(
    r"\b([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+\s+(?:[x×]\s+)?[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+"
    r"(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+)?)"
)

def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("×","x")).strip(" .;,:").lower()

def canonical(s):
    s = re.sub(r"\s+", " ", (s or "").replace("×","x")).strip()
    m = SCI_RE.search(s)
    if not m: return s.split(",")[0].strip()
    return m.group(1).replace("ssp.","subsp.").strip()

def rank_of(name):
    n=norm(canonical(name))
    if " subsp. " in n or " nothosubsp. " in n: return "subspecies"
    if " var. " in n: return "variety"
    if " f. " in n: return "form"
    if " x " in n and len(n.split()) >= 4: return "hybrid_formula"
    return "species"

def rank_norm(s):
    x=norm(s)
    return {"sp.":"species","species":"species","subsp.":"subspecies","ssp.":"subspecies","subspecies":"subspecies","var.":"variety","variety":"variety","forma":"form","form":"form"}.get(x,x)

def short(s,n=800): return re.sub(r"\s+"," ",s or "").strip()[:n]

def session():
    q=requests.Session(); q.headers.update({"User-Agent":UA,"Accept-Language":"es,en;q=0.7"}); return q

def google_fallback(query, max_results=6):
    q=session(); url="https://www.google.com/search?q="+quote_plus(query)
    r=q.get(url,timeout=25); r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser")
    out=[]
    for a in soup.select("a"):
        href=a.get("href",""); txt=a.get_text(" ",strip=True)
        if href.startswith("/url?q="): href=href.split("/url?q=",1)[1].split("&",1)[0]
        if href.startswith("http") and txt:
            out.append({"href":href,"title":txt,"body":""})
            if len(out)>=max_results: break
    return out

def web_search(query,max_results=6):
    errs=[]
    if DDGS is not None:
        for attempt in range(2):
            try:
                vals=list(DDGS().text(query,max_results=max_results))
                return [{"href":x.get("href") or x.get("url"),"title":x.get("title", ""),"body":x.get("body","")} for x in vals if x.get("href") or x.get("url")],None
            except Exception as e:
                errs.append(f"DDGS:{type(e).__name__}:{e}"); time.sleep(0.5*(attempt+1))
    try: return google_fallback(query,max_results),None
    except Exception as e:
        errs.append(f"GOOGLE:{type(e).__name__}:{e}"); return []," | ".join(errs)

def pdf_to_text(data):
    with tempfile.NamedTemporaryFile(suffix=".pdf",delete=False) as f: f.write(data); p=f.name
    try:
        z=subprocess.run(["pdftotext","-layout",p,"-"],capture_output=True,text=True,timeout=60)
        if z.returncode: raise RuntimeError(z.stderr[:500])
        return z.stdout
    finally:
        try: os.unlink(p)
        except OSError: pass

def fetch_document(url):
    q=session(); r=q.get(url,timeout=35,allow_redirects=True); r.raise_for_status()
    ct=(r.headers.get("content-type") or "").lower()
    if "pdf" in ct or r.url.lower().endswith(".pdf"):
        return {"url":r.url,"kind":"pdf","title":"","text":pdf_to_text(r.content)}
    soup=BeautifulSoup(r.text,"html.parser")
    title=""
    for sel in ["h1","h2","h3","title"]:
        el=soup.select_one(sel)
        if el and el.get_text(" ",strip=True): title=el.get_text(" ",strip=True); break
    return {"url":r.url,"kind":"html","title":title,"text":soup.get_text("\n",strip=True)}

def marker_windows(text,markers):
    # DISCOVERY MODE: any explicit synonymy block on a page returned by the source-targeted query is retained.
    # The seed taxon is NOT required to occur inside the synonymy block.
    low=text.lower(); wins=[]
    for marker in markers:
        start=0; ml=marker.lower()
        while True:
            i=low.find(ml,start)
            if i<0: break
            b=min(len(text),i+7000); cut=b; tail=text[i+len(marker):b]
            for h in STOP_HEADINGS:
                m=re.search(r"(?:^|\n)\s*"+re.escape(h)+r"\s*(?:\n|$|:)",tail,re.I)
                if m: cut=min(cut,i+len(marker)+m.start())
            w=text[i:cut]
            if SCI_RE.search(w): wins.append(w)
            start=i+len(marker)
    return wins

def scientific_names(text):
    vals=[]; seen=set()
    for m in SCI_RE.finditer(text or ""):
        c=canonical(m.group(1)); k=norm(c)
        if k and k not in seen and len(c.split())>=2: seen.add(k); vals.append(c)
    return vals

def source_hits(seed,src,max_results=6):
    # One source-local discovery query. Search ranking is not used as evidence.
    queries=[f'"{seed}" site:{src["domain"]}',f'{seed} sinonimia site:{src["domain"]}']
    raw=[]; search_errors=[]
    for q in queries:
        vals,err=web_search(q,max_results=max_results)
        if err: search_errors.append({"query":q,"error":err})
        for v in vals: raw.append((q,v))
    seen=set(); pages=[]; fetch_fail=[]; search_results=[]
    for q,sr in raw:
        url=sr.get("href") or ""; host=(urlparse(url).netloc or "").lower()
        if not url or src["domain"] not in host or url in seen: continue
        seen.add(url); search_results.append({"query":q,"url":url,"title":sr.get("title"),"snippet":short(sr.get("body",""),350)})
        try: doc=fetch_document(url)
        except Exception as e:
            fetch_fail.append({"url":url,"error":f"{type(e).__name__}:{e}"}); continue
        wins=marker_windows(doc["text"],src["markers"])
        if not wins: continue
        names=[]; seen_names=set()
        primary=canonical(doc.get("title") or "")
        if len(primary.split())>=2:
            seen_names.add(norm(primary)); names.append(primary)
        for w in wins:
            for n in scientific_names(w):
                if norm(n) not in seen_names: seen_names.add(norm(n)); names.append(n)
        if names:
            pages.append({"url":doc["url"],"kind":doc["kind"],"pagePrimary":primary,"names":names,"windows":[short(w) for w in wins[:3]],"discoverySeed":seed})
    return {"source":src["key"],"domain":src["domain"],"searchErrors":search_errors,"searchResults":search_results,"explicitSynonymyPages":pages,"fetchFailures":fetch_fail}

def build_eidos(path):
    idx={}; block=[]
    def emit(lines):
        if not lines:return
        t="\n".join(lines); mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t); mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not (mn and mi): return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t); mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t); ma=re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"',t)
        c=canonical(mn.group(1)); idx.setdefault(norm(c),[]).append({"scientificName":mn.group(1),"canonical":c,"taxonID":mi.group(1),"taxonomicStatus":ms.group(1) if ms else None,"taxonRank":mr.group(1) if mr else None,"nameAccordingTo":ma.group(1) if ma else None})
    with open(path,encoding="utf-8",errors="replace") as f:
        for line in f:
            if not line.strip(): emit(block); block=[]
            else: block.append(line.rstrip())
        emit(block)
    p=Path(path); return idx,{"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}

def eval_eidos(idx,name,required_rank):
    recs=idx.get(norm(canonical(name)),[]); same=[r for r in recs if rank_norm(r.get("taxonRank"))==required_rank]
    valid=[r for r in same if norm(r.get("taxonomicStatus")) in ("aceptado/válido","aceptado/valido")]
    if len(valid)==1: state="UNIQUE_ACCEPTED_SAME_RANK"; tid=valid[0]["taxonID"]
    elif len(valid)>1: state="MULTIPLE_ACCEPTED_SAME_RANK"; tid=None
    elif same: state="SAME_RANK_PRESENT_NO_ACCEPTED"; tid=None
    elif recs: state="ONLY_OTHER_RANKS_PRESENT"; tid=None
    else: state="NAME_NOT_FOUND_IN_EIDOS"; tid=None
    return {"name":canonical(name),"state":state,"taxonID":tid,"records":recs,"sameRankRecords":same}

def process_taxon(row,eidx):
    bid=str(row["B_SOURCE_RECORD_ID"]); seed=row["name"]; rr=rank_of(seed)
    source_runs=[]
    with ThreadPoolExecutor(max_workers=min(10,len(SOURCES))) as ex:
        fut={ex.submit(source_hits,seed,s):s for s in SOURCES}
        for f in as_completed(fut):
            s=fut[f]
            try: source_runs.append(f.result())
            except Exception as e: source_runs.append({"source":s["key"],"domain":s["domain"],"searchErrors":[{"error":f"WORKER:{type(e).__name__}:{e}"}],"searchResults":[],"explicitSynonymyPages":[],"fetchFailures":[]})
    source_runs.sort(key=lambda x:x["source"])
    comp={}
    for sr in source_runs:
        for page in sr["explicitSynonymyPages"]:
            for name in page["names"]:
                c=canonical(name); k=norm(c)
                if not k: continue
                ent=comp.setdefault(k,{"name":c,"sourceKeys":set(),"evidence":[]})
                ent["sourceKeys"].add(sr["source"]); ent["evidence"].append({"source":sr["source"],"url":page["url"],"pagePrimary":page["pagePrimary"],"discoverySeed":seed,"windows":page["windows"]})
    comp_rows=[]
    for ent in comp.values(): comp_rows.append({"name":ent["name"],"sourceCount":len(ent["sourceKeys"]),"sources":sorted(ent["sourceKeys"]),"evidence":ent["evidence"]})
    comp_rows.sort(key=lambda x:(-x["sourceCount"],x["name"].lower()))
    # Query every unique discovered name once. Rank is evaluated strictly for ID eligibility.
    eidos=[]
    for c in comp_rows:
        ev=eval_eidos(eidx,c["name"],rr); ev.update({"sourceCount":c["sourceCount"],"sources":c["sources"],"discoveredRank":rank_of(c["name"])}); eidos.append(ev)
    ids=sorted({e["taxonID"] for e in eidos if e.get("taxonID")})
    any_rel=bool(comp_rows); any_search_failure=any(sr["searchErrors"] for sr in source_runs)
    if len(ids)==1: group="RESOLVED_UNIQUE_EIDOS_ID_FROM_SECONDARY_DISCOVERY"; tid=ids[0]
    elif len(ids)>1: group="MULTIPLE_EIDOS_IDS_FROM_SECONDARY_DISCOVERY_REQUIRES_RELATION_CRIB"; tid=None
    elif any_rel:
        states={e["state"] for e in eidos}
        if "MULTIPLE_ACCEPTED_SAME_RANK" in states: group="EIDOS_MULTIPLE_ACCEPTED_SAME_RANK"
        elif "SAME_RANK_PRESENT_NO_ACCEPTED" in states: group="DISCOVERED_NAMES_EIDOS_SAME_RANK_NO_ACCEPTED"
        elif "ONLY_OTHER_RANKS_PRESENT" in states: group="DISCOVERED_NAMES_EIDOS_ONLY_OTHER_RANKS"
        else: group="DISCOVERED_SYNONYMY_NAMES_NOT_FOUND_IN_EIDOS"
        tid=None
    elif any_search_failure: group="NO_SECONDARY_SYNONYMY_DISCOVERED_WITH_SEARCH_FAILURES"; tid=None
    else: group="NO_SECONDARY_SYNONYMY_DISCOVERED"; tid=None
    return {"B_SOURCE_RECORD_ID":bid,"NOMBRE_RIOJA_VERBATIM":seed,"RANK":rr,"FINAL_GROUP":group,"MITECO_IDTAXON":tid,"SYNONYMY_COMPENDIUM":comp_rows,"EIDOS_UNIQUE_NAME_QUERIES":eidos,"SOURCE_RUNS":source_runs,"DISCOVERY_MODE":True,"SEED_NOT_REQUIRED_INSIDE_SYNONYMY_BLOCK":True,"SEARCH_RANKING_NOT_EVIDENCE":True,"NO_FUZZY_EQUIVALENCE":True,"PARENT_ID_INHERITANCE":False,"NO_RANK_COLLAPSE":True}

def main(groups_path,eidos_path,outdir):
    data=json.loads(Path(groups_path).read_text(encoding="utf-8")); rows=data["groups"][ROOT_GROUP]; assert len(rows)==185
    eidx,emeta=build_eidos(eidos_path); results=[]
    for i,row in enumerate(rows,1):
        r=process_taxon(row,eidx); results.append(r); print(f"[{i:03d}/185] {r['B_SOURCE_RECORD_ID']} {r['NOMBRE_RIOJA_VERBATIM']} => {r['FINAL_GROUP']} {r['MITECO_IDTAXON'] or ''}",flush=True)
    groups={}; source_stats={s["key"]:{"taxaQueried":185,"searchFailureTaxa":0,"searchHitTaxa":0,"explicitSynonymyTaxa":0,"explicitPages":0,"fetchFailures":0} for s in SOURCES}
    for r in results:
        groups.setdefault(r["FINAL_GROUP"],[]).append(r)
        for sr in r["SOURCE_RUNS"]:
            st=source_stats[sr["source"]]
            if sr["searchErrors"]: st["searchFailureTaxa"]+=1
            if sr["searchResults"]: st["searchHitTaxa"]+=1
            if sr["explicitSynonymyPages"]: st["explicitSynonymyTaxa"]+=1
            st["explicitPages"]+=len(sr["explicitSynonymyPages"]); st["fetchFailures"]+=len(sr["fetchFailures"])
    counts={k:len(v) for k,v in groups.items()}; resolved=sum(1 for r in results if r["MITECO_IDTAXON"])
    all_names=sum(len(r["SYNONYMY_COMPENDIUM"]) for r in results); out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    receipt={"runClass":"CORPUS_B_SECONDARY_WEB_SYNONYMY_DISCOVERY_185_V2_TO_EIDOS","inputRows":185,"outputRows":185,"resolvedRows":resolved,"groupCounts":counts,"sources":[s["key"] for s in SOURCES],"sourceStats":source_stats,"discoveredUniqueNamesAcrossTaxa":all_names,"eidosSource":"https://datos.iepnb.es/datasets/eidos.ttl","eidosBytes":emeta["bytes"],"eidosSha256":emeta["sha256"],"singleEidosLoad":True,"discoveryMode":True,"seedNotRequiredInsideSynonymyBlock":True,"searchRankingNotEvidence":True,"deduplicateNamesPerTaxonBeforeEidos":True,"sourceCountPreserved":True,"queryEveryUniqueDiscoveredNameOnce":True,"crossWithA":False,"neonWrites":0,"corpusBFreeze":False,"noFuzzy":True,"noParentIdInheritance":True,"noRankCollapse":True,"semantics":["SOURCE_FAILURE!=NOT_FOUND","NOT_FOUND!=ABSENCE","NO_SILENT_INFERENCE","DISCOVERY_CANDIDATE!=VALIDATED_SYNONYM"]}
    (out/"RUN_RECEIPT.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"SECONDARY_WEB_COMPENDIUM_185_V2.json").write_text(json.dumps({"receipt":receipt,"rows":results},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"GROUPED_RESULTS_185_V2.json").write_text(json.dumps({"receipt":receipt,"groups":groups},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"RESOLVED_185_V2.json").write_text(json.dumps({"receipt":receipt,"rows":[r for r in results if r["MITECO_IDTAXON"]]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,ensure_ascii=False,indent=2))

if __name__=="__main__": main(*sys.argv[1:4])
