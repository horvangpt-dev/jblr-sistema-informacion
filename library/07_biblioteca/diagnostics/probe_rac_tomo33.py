from __future__ import annotations

import io
import requests
from pypdf import PdfReader

BASE = "https://rac.es/fedora/get/Revistas%3AREV_20100220_{id}/PDF"
needle_title = "estudios sobre flora de la rioja baja"
needle_author = "cámara niño"
needle_author_ascii = "camara niño"

session = requests.Session()
session.headers.update({"User-Agent":"JBLR-Biblioteca/0.3 public repository identification"})

matches = []
for n in range(3400, 3430):
    rid = f"{n:05d}"
    url = BASE.format(id=rid)
    try:
        r = session.get(url, timeout=45)
        if r.status_code != 200 or not r.content.startswith(b"%PDF-"):
            continue
        reader = PdfReader(io.BytesIO(r.content))
        head_parts = []
        for pidx in range(min(2, len(reader.pages))):
            try:
                head_parts.append((reader.pages[pidx].extract_text() or "").replace("\n", " "))
            except Exception:
                pass
        head = " ".join(head_parts)
        low = head.casefold()
        if needle_title in low or needle_author in low or needle_author_ascii in low:
            print("*** MATCH", rid, "PAGES", len(reader.pages), "BYTES", len(r.content), "URL", url)
            print("HEAD", head[:2600])
            matches.append(rid)
        elif "tomo xxxiii" in low or "cuaderno segundo" in low or "cuaderno tercero" in low:
            print("ISSUE_CANDIDATE", rid, "PAGES", len(reader.pages), "HEAD", head[:1200])
    except Exception as exc:
        print("ERROR", rid, repr(exc))

print("MATCHES", matches)
if not matches:
    raise SystemExit("No Cámara Niño match found in 03400-03429")
