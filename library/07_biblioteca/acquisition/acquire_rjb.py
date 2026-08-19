from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE = "https://bibdigital.rjb.csic.es"
OUT = Path("acquired")
FI_OUT = OUT / "Flora_Iberica"
RIOJA_OUT = OUT / "Rioja_Historica"
FI_OUT.mkdir(parents=True, exist_ok=True)
RIOJA_OUT.mkdir(parents=True, exist_ok=True)

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36 JBLR-Biblioteca/0.2"
})

records = []
errors = []
seen_pdf_urls = set()

KNOWN_DIRECT = [
    {
        "record_id": 9905,
        "title": "Flora iberica. Vol. VIII. Haloragaceae-Euphorbiaceae",
        "record_url": f"{BASE}/idurl/1/9905",
        "permalink": f"{BASE}/idurl/1/9905",
        "pdf_url": "https://bibdigital.rjb.csic.es/medias/f9/86/3a/e2/f9863ae2-f845-454c-98c8-71cba67f2382/files/Fl_Iber8.pdf",
        "destination": FI_OUT,
        "prefix": "Flora_Iberica"
    }
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return name or "document.pdf"


def download_pdf(meta: dict, pdf_url: str, destination: Path, prefix: str):
    if pdf_url in seen_pdf_urls:
        return
    print(f"DOWNLOAD TRY {pdf_url}", flush=True)
    with session.get(pdf_url, timeout=180, stream=True, allow_redirects=True) as r:
        print(f"DOWNLOAD HTTP {r.status_code} {r.url} {r.headers.get('content-type')} {r.headers.get('content-length')}", flush=True)
        r.raise_for_status()
        ctype = r.headers.get("content-type", "").lower()
        final_url = r.url
        filename = Path(final_url.split("?")[0]).name
        if not filename.lower().endswith(".pdf"):
            filename = f"{prefix}_{meta['record_id']}.pdf"
        filename = clean_name(filename)
        target = destination / filename
        with target.open("wb") as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    size = target.stat().st_size
    with target.open("rb") as f:
        magic = f.read(5)
    if size < 1024 or magic != b"%PDF-":
        raise RuntimeError(f"Downloaded content is not a valid PDF: {target} ({ctype}, {size} bytes, magic={magic!r})")
    seen_pdf_urls.add(pdf_url)
    records.append({
        "record_id": meta["record_id"],
        "title": meta["title"],
        "record_url": meta["record_url"],
        "permalink": meta["permalink"],
        "pdf_url": pdf_url,
        "file": str(target.relative_to(OUT)),
        "bytes": size,
        "sha256": sha256_file(target),
    })
    print(f"ACQUIRED {meta['record_id']} {meta['title']} -> {target} ({size} bytes)", flush=True)


def diagnose(url: str):
    try:
        r = session.get(url, timeout=30, allow_redirects=True)
        print(f"DIAG {url} -> {r.status_code} {r.url} ctype={r.headers.get('content-type')} bytes={len(r.content)}", flush=True)
        return r
    except Exception as exc:
        print(f"DIAG ERROR {url}: {exc!r}", file=sys.stderr, flush=True)
        return None


def get_record(record_id: int):
    permalink = f"{BASE}/idurl/1/{record_id}"
    try:
        r = session.get(permalink, timeout=30, allow_redirects=True)
    except Exception as exc:
        errors.append({"record_id": record_id, "error": f"RECORD_REQUEST:{exc!r}"})
        return None
    ctype = r.headers.get("content-type", "")
    if r.status_code != 200 or "text/html" not in ctype:
        if record_id in (9898, 9902, 9903, 9904, 9905, 10189, 10190):
            print(f"RECORD FAIL {record_id}: status={r.status_code} ctype={ctype} final={r.url} bytes={len(r.content)}", flush=True)
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    if not title:
        if record_id in (9898, 9902, 9903, 9904, 9905, 10189, 10190):
            print(f"RECORD NO H1 {record_id}: final={r.url} head={r.text[:200]!r}", flush=True)
        return None
    pdf_links = []
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True).lower()
        href = a["href"]
        if "pdf" in text or href.lower().split("?")[0].endswith(".pdf"):
            pdf_links.append(urljoin(r.url, href))
    if not pdf_links:
        for match in re.findall(r'''https?://[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?|/[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?''', r.text, flags=re.I):
            pdf_links.append(urljoin(r.url, match))
    pdf_links = list(dict.fromkeys(pdf_links))
    print(f"RECORD {record_id}: {title} pdfs={len(pdf_links)}", flush=True)
    return {"record_id": record_id, "title": title, "record_url": r.url, "permalink": permalink, "pdf_links": pdf_links}


def scan_range(start: int, end: int, classifier):
    for record_id in range(start, end + 1):
        try:
            meta = get_record(record_id)
            if not meta:
                continue
            classification = classifier(meta["title"])
            if not classification:
                continue
            dest, prefix = classification
            if not meta["pdf_links"]:
                errors.append({"record_id": record_id, "title": meta["title"], "error": "NO_PDF_LINK_FOUND"})
                continue
            for pdf_url in meta["pdf_links"]:
                download_pdf(meta, pdf_url, dest, prefix)
        except Exception as exc:
            errors.append({"record_id": record_id, "error": repr(exc)})
            print(f"ERROR {record_id}: {exc}", file=sys.stderr, flush=True)


def classify_flora_iberica(title: str):
    t = title.casefold()
    if t.startswith("flora iberica") and ("vol." in t or "volumen" in t):
        return FI_OUT, "Flora_Iberica"
    return None


def classify_rioja(title: str):
    t = title.casefold()
    if "flora de la rioja" in t:
        return RIOJA_OUT, "Flora_de_la_Rioja"
    return None


# Diagnostic: current and legacy RJB access from the GitHub-hosted runner.
diagnose(f"{BASE}/idurl/1/9905")
legacy = diagnose("http://bibdigital.rjb.csic.es/spa/Volumenes.php?Libro=473")
if legacy is not None and legacy.status_code == 200:
    soup = BeautifulSoup(legacy.text, "html.parser")
    links = [(a.get_text(" ", strip=True), urljoin(legacy.url, a.get("href", ""))) for a in soup.find_all("a", href=True)]
    print("LEGACY LINKS SAMPLE", json.dumps(links[:30], ensure_ascii=False), flush=True)

# Guaranteed test using a direct official PDF URL already resolved independently.
for item in KNOWN_DIRECT:
    try:
        download_pdf(item, item["pdf_url"], item["destination"], item["prefix"])
    except Exception as exc:
        errors.append({"record_id": item["record_id"], "error": f"KNOWN_DIRECT:{exc!r}"})
        print(f"KNOWN DIRECT ERROR: {exc!r}", file=sys.stderr, flush=True)

# Try current RJB record pages as a scalable discovery path.
scan_range(9896, 9940, classify_flora_iberica)
scan_range(10180, 10200, classify_rioja)

summary = {
    "source": "Biblioteca Digital del Real Jardín Botánico, CSIC",
    "acquisition_policy": "Only PDFs linked directly by official public record pages; no authentication/paywall/protection bypass.",
    "record_count": len(records),
    "records": records,
    "errors": errors,
}
(OUT / "acquisition_manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

if not records:
    raise SystemExit("No PDFs were acquired; refusing to publish an empty artifact")

print(json.dumps({"record_count": len(records), "errors": len(errors)}, indent=2), flush=True)
