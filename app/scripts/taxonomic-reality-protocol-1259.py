#!/usr/bin/env python3
import argparse, csv, hashlib, json, os, re, sys, time, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

IUCN_RESULTS = Path("evidence/06_stimes/iucn_all_2742_fresh/latest/IUCN_ALL_2742_RESULTS.csv")
OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_1259"))
PROBLEM_STATES = {"NO_API_TAXON", "NO_EXACT_MATCH", "UNPARSABLE_NAME"}
EXPECTED_N = 1259
HTTP_WAIT = float(os.environ.get("TAXON_HTTP_WAIT", "0.45"))
ANTHOS_WAIT_MS = int(os.environ.get("ANTHOS_WAIT_MS", "1100"))
UA = "JBLR-Taxonomic-Reality-Protocol/1.0 (+scientific quality-control)"
THREAT_TERMS = [
    "critically endangered","endangered","vulnerable","near threatened",
    "least concern","data deficient","extinct","iucn","red list",
    "en peligro crítico","en peligro","vulnerable","casi amenazada","lista roja"
]
session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept-Language": "en,es;q=0.8"})
_last_http = 0.0

def now():
    return datetime.now(timezone.utc).isoformat()

def norm(s):
    s = (s or "").replace("×", "x")
    s = re.sub(r"\s+", " ", s.strip())
    return s.casefold()

def nows(s):
    return re.sub(r"[^a-z0-9]+", " ", norm(s)).strip()

def sha256_text(s):
    return hashlib.sha256((s or "").encode("utf-8", "replace")).hexdigest()

def throttle():
    global _last_http
    d = time.monotonic() - _last_http
    if d < HTTP_WAIT:
        time.sleep(HTTP_WAIT - d)

def http_get(url, timeout=45):
    global _last_http
    err = None
    for attempt in range(5):
        try:
            throttle()
            r = session.get(url, timeout=timeout, allow_redirects=True)
            _last_http = time.monotonic()
            if r.status_code in (429,) or 500 <= r.status_code < 600:
                if attempt < 4:
                    time.sleep(min(20, 2 ** attempt))
                    continue
            return r
        except requests.RequestException as e:
            _last_http = time.monotonic()
            err = e
            if attempt < 4:
                time.sleep(min(20, 2 ** attempt))
                continue
    raise RuntimeError(f"HTTP_REQUEST_FAILED {url}: {err}")

def load_queue():
    if not IUCN_RESULTS.exists():
        raise SystemExit(f"MISSING_INPUT {IUCN_RESULTS}")
    with IUCN_RESULTS.open(encoding="utf-8", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r.get("match_state") in PROBLEM_STATES]
    if len(rows) != EXPECTED_N:
        raise SystemExit(f"QUEUE_COUNT_MISMATCH expected={EXPECTED_N} got={len(rows)}")
    return rows

def exact_name_in_text(target, text):
    t = nows(target)
    x = nows(text)
    if not t or not x:
        return False
    return x == t or x.startswith(t + " ")

def threat_reference(text):
    low = norm(text)
    hits = sorted({t for t in THREAT_TERMS if t in low})
    return ";".join(hits[:8])

def parse_source_search(source, target, url):
    try:
        r = http_get(url)
    except Exception as e:
        return {"state":"SOURCE_ERROR","http_status":"","search_url":url,"detail_url":"",
                "matched_label":"","taxonomic_status":"","accepted_name":"","threat_reference":"",
                "page_sha256":"","error":str(e)[:500]}
    if r.status_code != 200:
        return {"state":"SOURCE_ERROR","http_status":r.status_code,"search_url":r.url,"detail_url":"",
                "matched_label":"","taxonomic_status":"","accepted_name":"","threat_reference":"",
                "page_sha256":sha256_text(r.text),"error":f"HTTP_{r.status_code}"}
    soup = BeautifulSoup(r.text, "html.parser")
    candidates = []
    for a in soup.find_all("a", href=True):
        label = " ".join(a.stripped_strings)
        href = a.get("href","")
        if source == "POWO":
            valid = "/taxon/" in href
        else:
            valid = "/taxon/" in href or "/tpl/" in href
        if valid and exact_name_in_text(target, label):
            candidates.append((label, href, a))
    if not candidates:
        return {"state":"EXACT_QUERY_NOT_FOUND","http_status":200,"search_url":r.url,"detail_url":"",
                "matched_label":"","taxonomic_status":"","accepted_name":"","threat_reference":"",
                "page_sha256":sha256_text(r.text),"error":""}
    label, href, a = sorted(candidates, key=lambda z: len(z[0]))[0]
    detail = urllib.parse.urljoin(r.url, href)
    context = " ".join(a.parent.stripped_strings) if a.parent else label
    status = ""
    accepted = ""
    if re.search(r"\bsynonym\b", context, re.I):
        status = "SYNONYM"
    elif re.search(r"\baccepted\b", context, re.I):
        status = "ACCEPTED"
    try:
        dr = http_get(detail)
        dtext = dr.text if dr.status_code == 200 else ""
        dsoup = BeautifulSoup(dtext, "html.parser") if dtext else None
        dplain = " ".join(dsoup.stripped_strings) if dsoup else ""
        if source == "POWO":
            m = re.search(r"This name is a synonym of\s+(.+?)(?:\s+Taxonomy|\s+Publications|\s+Sources|$)", dplain, re.I)
            if m:
                status = "SYNONYM"
                accepted = re.sub(r"\s+", " ", m.group(1)).strip()[:250]
            elif re.search(r"follows these authorities in accepting this name", dplain, re.I):
                status = status or "ACCEPTED"
        else:
            m = re.search(r"Status:\s*Synonym of\s+(.+?)(?:Rank:|Family:|$)", dplain, re.I)
            if m:
                status = "SYNONYM"
                accepted = re.sub(r"\s+", " ", m.group(1)).strip()[:250]
            elif re.search(r"Status:\s*Accepted", dplain, re.I):
                status = status or "ACCEPTED"
        th = threat_reference(dplain)
        psha = sha256_text(dtext)
        if dr.status_code != 200:
            return {"state":"EXACT_QUERY_FOUND","http_status":200,"search_url":r.url,"detail_url":detail,
                    "matched_label":label[:300],"taxonomic_status":status,"accepted_name":accepted,
                    "threat_reference":"","page_sha256":sha256_text(r.text),
                    "error":f"DETAIL_HTTP_{dr.status_code}"}
        return {"state":"EXACT_QUERY_FOUND","http_status":200,"search_url":r.url,"detail_url":dr.url,
                "matched_label":label[:300],"taxonomic_status":status,"accepted_name":accepted,
                "threat_reference":th,"page_sha256":psha,"error":""}
    except Exception as e:
        return {"state":"EXACT_QUERY_FOUND","http_status":200,"search_url":r.url,"detail_url":detail,
                "matched_label":label[:300],"taxonomic_status":status,"accepted_name":accepted,
                "threat_reference":"","page_sha256":sha256_text(r.text),
                "error":f"DETAIL_ERROR {str(e)[:400]}"}

def powo(target):
    return parse_source_search("POWO", target,
        "https://powo.science.kew.org/results?" + urllib.parse.urlencode({"q": target}))

def wfo(target):
    return parse_source_search("WFO", target,
        "https://www.worldfloraonline.org/search?" + urllib.parse.urlencode({"query": target, "limit": "24"}))

class Anthos:
    def __init__(self):
        self.pw = None
        self.browser = None
        self.page = None
        self.input_selector = None
        self.debug = {}
    def start(self):
        from playwright.sync_api import sync_playwright
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(headless=True)
        self.page = self.browser.new_page(user_agent=UA, viewport={"width":1440,"height":1000})
        self.page.goto("https://www.anthos.es/", wait_until="domcontentloaded", timeout=60000)
        self.page.wait_for_timeout(5000)
        self.input_selector = ("INDEX", self._best_input_index())
        self.debug["inputs"] = self.page.locator("input").evaluate_all(
            """els => els.map((e,i)=>({i,type:e.type,id:e.id,name:e.name,placeholder:e.placeholder,
               title:e.title,aria:e.getAttribute('aria-label'),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)}))"""
        )
        if self.input_selector[1] is None:
            raise RuntimeError("ANTHOS_SEARCH_INPUT_NOT_FOUND")
    def _best_input_index(self):
        loc = self.page.locator("input")
        best_i, bestscore = None, -1
        for i in range(loc.count()):
            e = loc.nth(i)
            try:
                if not e.is_visible():
                    continue
                typ=(e.get_attribute("type") or "text").lower()
                if typ not in ("text","search",""):
                    continue
                attrs=" ".join(filter(None,[e.get_attribute("id"),e.get_attribute("name"),
                     e.get_attribute("placeholder"),e.get_attribute("title"),e.get_attribute("aria-label")])).casefold()
                score=sum(3 for k in ("taxon","especie","nombre","cient","buscar","search") if k in attrs)
                if score>bestscore:
                    bestscore,best_i=score,i
            except Exception:
                pass
        return best_i
    def search(self, target):
        try:
            if not self.page or self.page.is_closed():
                self.start()
            idx = self.input_selector[1]
            e = self.page.locator("input").nth(idx)
            if not e.is_visible():
                self.input_selector=("INDEX",self._best_input_index()); idx=self.input_selector[1]; e=self.page.locator("input").nth(idx)
            e.click()
            e.fill(target)
            e.press("Enter")
            self.page.wait_for_timeout(ANTHOS_WAIT_MS)
            body = self.page.locator("body").inner_text(timeout=15000)
            found = nows(target) in nows(body)
            low = norm(body)
            negative = any(x in low for x in [
                "sin resultados","no se han encontrado","ningún resultado","ningun resultado",
                "no results","0 resultados"
            ])
            state = "EXACT_QUERY_FOUND" if found and not negative else "EXACT_QUERY_NOT_FOUND"
            th = threat_reference(body) if state == "EXACT_QUERY_FOUND" else ""
            return {"state":state,"http_status":"BROWSER","search_url":self.page.url,"detail_url":"",
                    "matched_label":target if state=="EXACT_QUERY_FOUND" else "",
                    "taxonomic_status":"","accepted_name":"","threat_reference":th,
                    "page_sha256":sha256_text(body),"error":""}
        except Exception as ex:
            return {"state":"SOURCE_ERROR","http_status":"BROWSER","search_url":"https://www.anthos.es/",
                    "detail_url":"","matched_label":"","taxonomic_status":"","accepted_name":"",
                    "threat_reference":"","page_sha256":"","error":str(ex)[:500]}
    def close(self):
        try:
            if self.browser:
                self.browser.close()
        finally:
            if self.pw:
                self.pw.stop()

def preflight():
    OUT.mkdir(parents=True, exist_ok=True)
    checks={}
    for src,fn in [("powo",powo),("wfo",wfo)]:
        good=fn("Arabidopsis thaliana")
        bad=fn("Xqznotaxa fictissima")
        checks[src]={"known":good,"nonsense":bad,
                     "pass":good["state"]=="EXACT_QUERY_FOUND" and bad["state"]=="EXACT_QUERY_NOT_FOUND"}
    a=Anthos()
    try:
        a.start()
        positives=[]
        for n in ["Quercus ilex","Arabidopsis thaliana","Papaver rhoeas"]:
            positives.append((n,a.search(n)))
            if positives[-1][1]["state"]=="EXACT_QUERY_FOUND":
                break
        bad=a.search("Xqznotaxa fictissima")
        checks["anthos"]={"known_attempts":positives,"nonsense":bad,"debug":a.debug,
                          "pass":any(r["state"]=="EXACT_QUERY_FOUND" for _,r in positives)
                                 and bad["state"]=="EXACT_QUERY_NOT_FOUND"}
    finally:
        a.close()
    ok=all(v.get("pass") for v in checks.values())
    payload={"execution":"TAXONOMIC_REALITY_1259_PREFLIGHT_v1","at":now(),"pass":ok,"checks":checks}
    (OUT/"TAXONOMIC_REALITY_PREFLIGHT.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(payload,ensure_ascii=False,indent=2))
    if not ok:
        raise SystemExit(3)

def run():
    rows=load_queue()
    OUT.mkdir(parents=True, exist_ok=True)
    out=[]
    a=Anthos()
    try:
        a.start()
        for i,row in enumerate(rows,1):
            t=row["taxon"].strip()
            pr=powo(t)
            wr=wfo(t)
            ar=a.search(t)
            states=[pr["state"],wr["state"],ar["state"]]
            any_found=any(x=="EXACT_QUERY_FOUND" for x in states)
            any_error=any(x=="SOURCE_ERROR" for x in states)
            any_threat=any(bool(x["threat_reference"]) for x in (pr,wr,ar))
            if any_found or any_threat:
                resolution="KEEP_TAXONIC_RESPONSE"
            elif any_error:
                resolution="SOURCE_INCOMPLETE"
            elif all(x=="EXACT_QUERY_NOT_FOUND" for x in states):
                resolution="NO_RESPONSE_ALL_THREE"
            else:
                resolution="REVIEW_REQUIRED"
            base={"universe_index":row["universe_index"],"family":row["family"],"taxon":t,
                  "iucn_problem_state":row["match_state"],"resolution":resolution,
                  "any_exact_response":any_found,"any_threat_reference":any_threat,"checked_at":now()}
            for prefix,r in [("powo",pr),("wfo",wr),("anthos",ar)]:
                for k,v in r.items():
                    base[f"{prefix}_{k}"]=v
            out.append(base)
            if i%25==0:
                print(f"processed={i}/{len(rows)} keep={sum(x['resolution']=='KEEP_TAXONIC_RESPONSE' for x in out)} "
                      f"no_response={sum(x['resolution']=='NO_RESPONSE_ALL_THREE' for x in out)} "
                      f"incomplete={sum(x['resolution']=='SOURCE_INCOMPLETE' for x in out)}", flush=True)
    finally:
        a.close()
    fields=list(out[0].keys())
    with (OUT/"TAXONOMIC_REALITY_1259_RESULTS.csv").open("w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(out)
    candidates=[r for r in out if r["resolution"]=="NO_RESPONSE_ALL_THREE"]
    with (OUT/"TAXONOMIC_REALITY_NO_RESPONSE_ALL_THREE.csv").open("w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(candidates)
    incomplete=[r for r in out if r["resolution"]=="SOURCE_INCOMPLETE"]
    with (OUT/"TAXONOMIC_REALITY_SOURCE_INCOMPLETE.csv").open("w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(incomplete)
    counts={}
    for r in out:
        counts[r["resolution"]]=counts.get(r["resolution"],0)+1
    qa={"execution":"TAXONOMIC_REALITY_1259_EXACT_v1","started_from":"IUCN_ALL_2742_FRESH_v1",
        "finished_at":now(),"queue_count":len(rows),"results_count":len(out),
        "problem_states":sorted(PROBLEM_STATES),"counts":counts,
        "all_three_negative_count":len(candidates),"source_incomplete_count":len(incomplete),
        "complete":len(out)==EXPECTED_N and len(incomplete)==0,
        "semantic_guard":"NO_RESPONSE_ALL_THREE is only a candidate for spelling/false-taxon review; it is never automatic deletion. Any source error yields SOURCE_INCOMPLETE."}
    (OUT/"TAXONOMIC_REALITY_1259_QA.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(qa,ensure_ascii=False,indent=2))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--preflight",action="store_true")
    p.add_argument("--run",action="store_true")
    a=p.parse_args()
    if a.preflight:
        preflight()
    elif a.run:
        run()
    else:
        p.error("choose --preflight or --run")
