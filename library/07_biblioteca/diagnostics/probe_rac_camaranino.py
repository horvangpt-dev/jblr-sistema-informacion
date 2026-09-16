from __future__ import annotations

import io
import requests
from pypdf import PdfReader

URL = "https://rac.es/fedora/get/Revistas%3AREV_20100220_03444/PDF"

r = requests.get(URL, timeout=180, headers={"User-Agent": "JBLR-Biblioteca/0.3 institutional research acquisition"})
r.raise_for_status()
print("HTTP", r.status_code, r.headers.get("content-type"), len(r.content), r.url)
if not r.content.startswith(b"%PDF-"):
    raise SystemExit("RAC response is not a PDF")

reader = PdfReader(io.BytesIO(r.content))
print("PAGES", len(reader.pages))

needles = [
    "estudios sobre flora de la rioja baja",
    "estudios sobre flora de la rioja",
    "conferencias sobre sucesiones de funciones analíticas",
]

for i, page in enumerate(reader.pages):
    try:
        text = (page.extract_text() or "").replace("\n", " ")
    except Exception as exc:
        print("PAGE_TEXT_ERROR", i + 1, repr(exc))
        continue
    low = text.casefold()
    hits = [n for n in needles if n in low]
    if hits:
        print("CANDIDATE_PDF_PAGE", i + 1, "HITS", hits)
        print("TEXT", text[:800])
