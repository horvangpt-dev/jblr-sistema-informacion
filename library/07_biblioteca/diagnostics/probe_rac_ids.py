from __future__ import annotations

import io
import requests
from pypdf import PdfReader

BASE = "https://rac.es/fedora/get/Revistas%3AREV_20100220_{id}/PDF"
ids = [f"034{i:02d}" for i in range(31, 46)]

for rid in ids:
    url = BASE.format(id=rid)
    try:
        r = requests.get(url, timeout=60, headers={"User-Agent":"JBLR-Biblioteca/0.3 public repository identification"})
        print("OBJECT", rid, "HTTP", r.status_code, "CTYPE", r.headers.get("content-type"), "BYTES", len(r.content))
        if r.status_code != 200 or not r.content.startswith(b"%PDF-"):
            continue
        reader = PdfReader(io.BytesIO(r.content))
        texts = []
        for pidx in range(min(2, len(reader.pages))):
            texts.append((reader.pages[pidx].extract_text() or "").replace("\n", " "))
        head = " ".join(texts)[:1400]
        print("PDF", rid, "PAGES", len(reader.pages), "HEAD", head)
        low = head.casefold()
        if "flora de la rioja baja" in low or "cámara niño" in low or "camara niño" in low:
            print("*** CAMARA_CANDIDATE", rid, "***")
    except Exception as exc:
        print("ERROR", rid, repr(exc))
