from __future__ import annotations

import io
import requests
from pypdf import PdfReader

BASE = "https://rac.es/fedora/get/Revistas%3AREV_20100220_{id}/PDF"
ids = [f"034{i:02d}" for i in range(20, 31)]

for rid in ids:
    url = BASE.format(id=rid)
    try:
        r = requests.get(url, timeout=60, headers={"User-Agent":"JBLR-Biblioteca/0.3 public repository identification"})
        print("OBJECT", rid, "HTTP", r.status_code, "CTYPE", r.headers.get("content-type"), "BYTES", len(r.content))
        if r.status_code != 200 or not r.content.startswith(b"%PDF-"):
            continue
        reader = PdfReader(io.BytesIO(r.content))
        first = (reader.pages[0].extract_text() or "").replace("\n", " ")[:900]
        print("PDF", rid, "PAGES", len(reader.pages), "FIRST", first)
    except Exception as exc:
        print("ERROR", rid, repr(exc))
