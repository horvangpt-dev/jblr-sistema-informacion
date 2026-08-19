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
    "User-Agent": "Mozilla/5.0 (compatible; JBLR-Biblioteca/0.1; archival acquisition from official public download links)"
})

records = []
errors = []
seen_pdf_urls = set()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_name(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_")
    return name or "document.pdf"


def get_record(record_id: int):
    permalink = f"{BASE}/idurl/1/{record_id}"
    r = session.get(permalink, timeout=30, allow_redirects=True)
    if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    h1 = soup.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    if not title:
        return None
    pdf_links = []
    for a in soup.find_all("a", href=True):
        text = a.get_text(" ", strip=True).lower()
        href = a["href"]
        if "pdf" in text or href.lower().split("?")[0].endswith(".pdf"):
            pdf_links.append(urljoin(r.url, href))
    # Some templates keep the file URL in non-anchor attributes or scripts.
    if not pdf_links:
        for match in re.findall(r'''https?://[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?|/[^"'<>\s]+\.pdf(?:\?[^"'<>\s]*)?''', r.text, flags=re.I):
            pdf_links.append(urljoin(r.url, match))
    pdf_links = list(dict.fromkeys(pdf_links))
    return {"record_id": record_id, "title": title, "record_url": r.url, "permalink": permalink, "pdf_links": pdf_links}


def download_pdf(meta: dict, pdf_url: str, destination: Path, prefix: str):
    if pdf_url in seen_pdf_urls:
        return
    seen_pdf_urls.add(pdf_url)
    with session.get(pdf_url, timeout=120, stream=True, allow_redirects=True) as r:
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
    if size < 1024 or not target.read_bytes()[:5].startswith(b"%PDF-"):
        raise RuntimeError(f"Downloaded content is not a valid PDF: {target} ({ctype}, {size} bytes)")
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
    print(f"ACQUIRED {meta['record_id']} {meta['title']} -> {target} ({size} bytes)")


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
                print(f"NO PDF LINK {record_id} {meta['title']}")
                continue
            # The official page normally exposes one full-PDF link; download every PDF link only if distinct.
            for pdf_url in meta["pdf_links"]:
                download_pdf(meta, pdf_url, dest, prefix)
        except Exception as exc:
            errors.append({"record_id": record_id, "error": repr(exc)})
            print(f"ERROR {record_id}: {exc}", file=sys.stderr)


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


# Flora iberica records are clustered around this range in the RJB catalogue.
scan_range(9896, 9940, classify_flora_iberica)
# Zubía collection/volume records are clustered around this range.
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

print(json.dumps({"record_count": len(records), "errors": len(errors)}, indent=2))
