from __future__ import annotations

import requests

SEARCH = "https://archive.org/advancedsearch.php"
params = {
    "q": '(title:("Estudios sobre Flora de La Rioja baja") OR title:("Estudios sobre Flora de la Rioja baja")) AND (creator:("Camara Nino") OR creator:("Cámara Niño") OR creator:("Fernando Camara"))',
    "fl[]": ["identifier", "title", "creator", "date", "description"],
    "rows": 100,
    "page": 1,
    "output": "json",
}
r = requests.get(SEARCH, params=params, timeout=60, headers={"User-Agent":"JBLR-Biblioteca/0.3 public metadata search"})
r.raise_for_status()
data = r.json()
print("FOUND", data.get("response", {}).get("numFound"))
for doc in data.get("response", {}).get("docs", []):
    print("DOC", doc)
    ident = doc.get("identifier")
    if not ident:
        continue
    m = requests.get(f"https://archive.org/metadata/{ident}", timeout=60, headers={"User-Agent":"JBLR-Biblioteca/0.3 public metadata search"})
    print("METADATA_HTTP", ident, m.status_code, len(m.content))
    if m.status_code != 200:
        continue
    md = m.json()
    for f in md.get("files", []):
        name = f.get("name", "")
        fmt = str(f.get("format", ""))
        if name.lower().endswith(".pdf") or "pdf" in fmt.lower():
            print("PDF_FILE", ident, name, f.get("size"), fmt)
