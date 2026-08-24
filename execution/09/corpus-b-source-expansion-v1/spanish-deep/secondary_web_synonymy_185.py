#!/usr/bin/env python3
import hashlib, json, os, re, subprocess, sys, tempfile, time
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
    {"key":"FLORA_ANDALUCIA","domain":"florandalucia.es","markers":["Sinónimos","Sinonimos"]},
    {"key":"ASTURNATURA","domain":"asturnatura.com","markers":["Sinónimos","Sinonimos","Basiónimo","Basionimo"]},
    {"key":"HVMO_UIB","domain":"herbarivirtual.uib.es","markers":["Sinónimos","Sinonimos","Sinònims","Sinonims"]},
    {"key":"FLORA_CANARIAS","domain":"floradecanarias.es","markers":["Sinónimos","Sinonimos"]},
    {"key":"FLORA_CATALANA","domain":"floracatalana.cat","markers":["Sinònims","Sinonims","Sinónimos","Sinonimos"]},
    {"key":"FLORAGON_JACA","domain":"floragon.ipe.csic.es","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"FLORA_CANTABRICA","domain":"floracantabrica.com","markers":["Sinónimos","Sinonimos","Sinonimia"]},
    {"key":"FLORA_GALICIA","domain":"floradegalicia.es","markers":["Sinónimos","Sinonimos"]},
    {"key":"CICYTEX_EXTREMADURA","domain":"cicytex.juntaex.es","markers":["Sinónimos","Sinonimos"]},
    {"key":"UNAVARRA_FLORA","domain":"unavarra.es","markers":["Sinónimos","Sinonimos","sinónimos principales","sinonimos principales"]},
    {"key":"DIGITUM_MURCIA","domain":"digitum.um.es","markers":["Sinónimos","Sinonimos"]},
]

STOP_HEADINGS = [
    "Descripción","Descripcion","Origen","Categorías","Categorias","Ecología","Ecologia",
    "Nombres vernáculos","Nombres vernaculos","Etimología","Etimologia","Clasificación","Clasificacion",
    "Hábitat","Habitat","Distribución","Distribucion","Referencias","Bibliografía","Bibliografia",
    "Fenología","Fenologia","Observaciones","Taxonomía","Taxonomia","Imágenes","Imagenes"
]

UA = "JBLR-botanical-evidence/1.0 (+research; explicit synonymy only)"
SESSION = requests.Session(); SESSION.headers.update({"User-Agent":UA,"Accept-Language":"es,en;q=0.7"})

SCI_RE = re.compile(
    r"\b([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.-]+\s+(?:[x×]\s+)?[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+"
    r"(?:\s+(?:subsp\.|ssp\.|var\.|f\.|nothosubsp\.)\s+[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9.-]+)?)"
)

def norm(s):
    return re.sub(r"\s+"," ",(s or "").replace("×","x")).strip(" .;,:").lower()

def canonical(s):
    s=re.sub(r"\s+"," ",(s or "").replace("×","x")).strip()
    m=SCI_RE.search(s)
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

def short_excerpt(s, limit=700):
    s=re.sub(r"\s+"," ",s or "").strip()
    return s[:limit]

def bing_fallback(query, max_results=5):
    url="https://www.google.com/search?q="+quote_plus(query)
    r=SESSION.get(url,timeout=20)
    r.raise_for_status()
    soup=BeautifulSoup(r.text,"html.parser")
    out=[]
    for a in soup.select("a"):
        href=a.get("href","")
        txt=a.get_text(" ",strip=True)
        if href.startswith("/url?q="):
            href=href.split("/url?q=",1)[1].split("&",1)[0]
        if href.startswith("http") and txt:
            out.append({"href":href,"title":txt,"body":""})
        if len(out)>=max_results: break
    return out

def web_search(query, max_results=5):
    errs=[]
    if DDGS is not None:
        for attempt in range(2):
            try:
                vals=list(DDGS().text(query,max_results=max_results))
                return [{"href":x.get("href") or x.get("url"),"title":x.get("title",""),"body":x.get("body","")} for x in vals if x.get("href") or x.get("url")], None
            except Exception as e:
                errs.append(f"DDGS:{type(e).__name__}:{e}"); time.sleep(0.8*(attempt+1))
    try:
        return bing_fallback(query,max_results), None
    except Exception as e:
        errs.append(f"FALLBACK:{type(e).__name__}:{e}")
        return [], " | ".join(errs)

def pdf_to_text(data):
    with tempfile.NamedTemporaryFile(suffix=".pdf",delete=False) as f:
        f.write(data); p=f.name
    try:
        q=subprocess.run(["pdftotext","-layout",p,"-"],capture_output=True,text=True,timeout=45)
        if q.returncode==0: return q.stdout
        raise RuntimeError(q.stderr[:500])
    finally:
        try: os.unlink(p)
        except OSError: pass

def fetch_document(url):
    r=SESSION.get(url,timeout=30,allow_redirects=True)
    r.raise_for_status()
    ctype=(r.headers.get("content-type") or "").lower()
    if "pdf" in ctype or r.url.lower().endswith(".pdf"):
        return {"url":r.url,"kind":"pdf","text":pdf_to_text(r.content),"title":""}
    soup=BeautifulSoup(r.text,"html.parser")
    title=""
    for sel in ["h1","h2","h3","title"]:
        el=soup.select_one(sel)
        if el and el.get_text(" ",strip=True): title=el.get_text(" ",strip=True); break
    return {"url":r.url,"kind":"html","text":soup.get_text("\n",strip=True),"title":title}

def marker_windows(text, markers, original):
    low=text.lower(); wins=[]
    for marker in markers:
        ml=marker.lower(); start=0
        while True:
            i=low.find(ml,start)
            if i<0: break
            a=i; b=min(len(text),i+6000)
            cut=b
            tail=text[i+len(marker):b]
            for h in STOP_HEADINGS:
                m=re.search(r"(?:^|\n)\s*"+re.escape(h)+r"\s*(?:\n|$|:)",tail,re.I)
                if m: cut=min(cut,i+len(marker)+m.start())
            w=text[a:cut]
            if norm(canonical(original)) in norm(w) or re.search(re.escape(original),w,re.I): wins.append(w)
            start=i+len(marker)
    return wins

def scientific_names(text):
    vals=[]
    for m in SCI_RE.finditer(text or ""):
        c=canonical(m.group(1))
        if len(c.split())>=2 and c not in vals: vals.append(c)
    return vals

def source_hits_for_taxon(original, source, max_results=4):
    query=f'"{original}" site:{source["domain"]}'
    results,search_err=web_search(query,max_results=max_results)
    out={"source":source["key"],"domain":source["domain"],"query":query,"searchError":search_err,"searchResults":[],"explicitPages":[],"fetchFailures":[]}
    seen=set()
    for sr in results:
        url=sr.get("href") or ""
        if not url or source["domain"] not in (urlparse(url).netloc or ""): continue
        if url in seen: continue
        seen.add(url)
        out["searchResults"].append({"url":url,"title":sr.get("title"),"snippet":short_excerpt(sr.get("body",""),350)})
        try:
            doc=fetch_document(url)
        except Exception as e:
            out["fetchFailures"].append({"url":url,"error":f"{type(e).__name__}:{e}"}); continue
        wins=marker_windows(doc["text"],source["markers"],original)
        if not wins: continue
        page_primary=canonical(doc.get("title") or "")
        names=[]
        if page_primary and rank_of(page_primary) in ("species","subspecies","variety","form"): names.append(page_primary)
        for w in wins:
            for n in scientific_names(w):
                if n not in names: names.append(n)
        if names:
            out["explicitPages"].append({"url":doc["url"],"kind":doc["kind"],"pagePrimary":page_primary,"names":names,"evidenceExcerpt":short_excerpt(wins[0])})
    return out

def build_eidos(ttl_path):
    idx={}; block=[]
    def emit(lines):
        if not lines:return
        t="\n".join(lines)
        mn=re.search(r'Darwin:scientificName\s+"([^"]+)"',t)
        mi=re.search(r'Darwin:taxonID\s+"([^"]+)"',t)
        if not (mn and mi): return
        ms=re.search(r'Darwin:taxonomicStatus\s+"([^"]+)"',t)
        mr=re.search(r'Darwin:taxonRank\s+"([^"]+)"',t)
        ma=re.search(r'Darwin:nameAccordingTo\s+"([^"]+)"',t)
        c=canonical(mn.group(1))
        idx.setdefault(norm(c),[]).append({"scientificName":mn.group(1),"canonical":c,"taxonID":mi.group(1),"taxonomicStatus":ms.group(1) if ms else None,"taxonRank":mr.group(1) if mr else None,"nameAccordingTo":ma.group(1) if ma else None})
    with open(ttl_path,encoding="utf-8",errors="replace") as f:
        for line in f:
            if not line.strip(): emit(block); block=[]
            else: block.append(line.rstrip())
        emit(block)
    p=Path(ttl_path)
    return idx,{"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}

def eval_eidos(idx,name,rank):
    recs=idx.get(norm(canonical(name)),[])
    same=[x for x in recs if rank_norm(x.get("taxonRank"))==rank]
    valid=[x for x in same if norm(x.get("taxonomicStatus")) in ("aceptado/válido","aceptado/valido")]
    if len(valid)==1: state="UNIQUE_ACCEPTED_SAME_RANK"; tid=valid[0]["taxonID"]
    elif len(valid)>1: state="MULTIPLE_ACCEPTED_SAME_RANK"; tid=None
    elif same: state="SAME_RANK_PRESENT_NO_ACCEPTED"; tid=None
    elif recs: state="ONLY_OTHER_RANKS_PRESENT"; tid=None
    else: state="NAME_NOT_FOUND_IN_EIDOS"; tid=None
    return {"name":canonical(name),"state":state,"taxonID":tid,"records":recs,"sameRankRecords":same}

def main(groups_path,eidos_path,outdir):
    data=json.loads(Path(groups_path).read_text(encoding="utf-8"))
    rows=data["groups"][ROOT_GROUP]
    assert len(rows)==185, len(rows)
    eidx,emeta=build_eidos(eidos_path)
    source_stats={s["key"]:{"queries":0,"searchErrors":0,"searchHits":0,"explicitPages":0,"fetchFailures":0} for s in SOURCES}
    results=[]
    for pos,row in enumerate(rows,1):
        bid=str(row["B_SOURCE_RECORD_ID"]); original=row["name"]; rr=rank_of(original)
        source_runs=[]; comp={}
        for s in SOURCES:
            sr=source_hits_for_taxon(original,s)
            source_runs.append(sr); st=source_stats[s["key"]]; st["queries"]+=1
            if sr["searchError"]: st["searchErrors"]+=1
            if sr["searchResults"]: st["searchHits"]+=1
            st["explicitPages"]+=len(sr["explicitPages"]); st["fetchFailures"]+=len(sr["fetchFailures"])
            for page in sr["explicitPages"]:
                for name in page["names"]:
                    c=canonical(name); k=norm(c)
                    if not k: continue
                    ent=comp.setdefault(k,{"name":c,"sourceKeys":set(),"evidence":[]})
                    ent["sourceKeys"].add(s["key"])
                    ent["evidence"].append({"source":s["key"],"url":page["url"],"pagePrimary":page["pagePrimary"],"excerpt":page["evidenceExcerpt"]})
        comp_rows=[]
        for ent in comp.values():
            comp_rows.append({"name":ent["name"],"sourceCount":len(ent["sourceKeys"]),"sources":sorted(ent["sourceKeys"]),"evidence":ent["evidence"]})
        comp_rows.sort(key=lambda x:(-x["sourceCount"],x["name"].lower()))
        same_rank=[c for c in comp_rows if rank_of(c["name"])==rr]
        eidos=[eval_eidos(eidx,c["name"],rr)|{"sourceCount":c["sourceCount"],"sources":c["sources"]} for c in same_rank]
        ids=sorted({e["taxonID"] for e in eidos if e.get("taxonID")})
        any_search_error=any(x["searchError"] for x in source_runs)
        any_explicit=bool(comp_rows)
        if len(ids)==1:
            group="RESOLVED_UNIQUE_EIDOS_ID_FROM_SECONDARY_WEB_SYNONYMY"; tid=ids[0]
        elif len(ids)>1:
            group="CONFLICTING_SECONDARY_SYNONYMS_MULTIPLE_EIDOS_IDS"; tid=None
        elif any_explicit and not same_rank:
            group="SECONDARY_SYNONYMY_ONLY_OTHER_RANKS"; tid=None
        elif any_explicit:
            states={e["state"] for e in eidos}
            if "MULTIPLE_ACCEPTED_SAME_RANK" in states: group="EIDOS_MULTIPLE_ACCEPTED_IDS_SAME_RANK" 
            elif "SAME_RANK_PRESENT_NO_ACCEPTED" in states: group="SECONDARY_SYNONYMS_EIDOS_SAME_RANK_NO_ACCEPTED"
            elif "ONLY_OTHER_RANKS_PRESENT" in states: group="SECONDARY_SYNONYMS_EIDOS_ONLY_OTHER_RANKS"
            else: group="SECONDARY_SYNONYMS_NAMES_NOT_FOUND_IN_EIDOS"
            tid=None
        elif any_search_error:
            group="NO_EXPLICIT_SECONDARY_RESULT_WITH_SEARCH_FAILURES"; tid=None
        else:
            group="NO_EXPLICIT_SECONDARY_RESULT"; tid=None
        results.append({"B_SOURCE_RECORD_ID":bid,"NOMBRE_RIOJA_VERBATIM":original,"RANK":rr,"FINAL_GROUP":group,"MITECO_IDTAXON":tid,"SYNONYMY_COMPENDIUM":comp_rows,"EIDOS_UNIQUE_NAME_QUERIES":eidos,"SOURCE_RUNS":source_runs,"NO_FUZZY_EQUIVALENCE":True,"PARENT_ID_INHERITANCE":False,"NO_RANK_COLLAPSE":True})
        print(f"[{pos:03d}/185] {bid} {original} => {group} {tid or ''}",flush=True)
        time.sleep(0.15)
    groups={}
    for r in results: groups.setdefault(r["FINAL_GROUP"],[]).append(r)
    counts={k:len(v) for k,v in groups.items()}
    resolved=sum(1 for r in results if r["MITECO_IDTAXON"])
    out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    receipt={"runClass":"CORPUS_B_SECONDARY_WEB_SYNONYMY_185_TO_EIDOS","inputRows":185,"outputRows":185,"resolvedRows":resolved,"groupCounts":counts,"sources":[s["key"] for s in SOURCES],"sourceStats":source_stats,"eidosSource":"https://datos.iepnb.es/datasets/eidos.ttl","eidosBytes":emeta["bytes"],"eidosSha256":emeta["sha256"],"singleEidosLoad":True,"webSearchPerTaxonPerSource":True,"deduplicateSynonymsBeforeEidos":True,"sourceCountPreserved":True,"crossWithA":False,"neonWrites":0,"corpusBFreeze":False,"noFuzzy":True,"noParentIdInheritance":True,"noRankCollapse":True,"semantics":["SOURCE_FAILURE!=NOT_FOUND","NOT_FOUND!=ABSENCE","NO_SILENT_INFERENCE"]}
    (out/"RUN_RECEIPT.json").write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"SECONDARY_WEB_COMPENDIUM_185.json").write_text(json.dumps({"receipt":receipt,"rows":results},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"GROUPED_RESULTS_185.json").write_text(json.dumps({"receipt":receipt,"groups":groups},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"RESOLVED_185.json").write_text(json.dumps({"receipt":receipt,"rows":[r for r in results if r["MITECO_IDTAXON"]]},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(receipt,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main(*sys.argv[1:4])
