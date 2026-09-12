from __future__ import annotations

import requests

OBJ = "Revistas%3AREV_20100220_03437"
BASE = f"https://rac.es/fedora/get/{OBJ}"
for ds in ["DC", "MODS", "RELS-EXT", "METS", "OCR", "PDF"]:
    url = f"{BASE}/{ds}"
    try:
        r = requests.get(url, timeout=30, headers={"User-Agent":"JBLR-Biblioteca/0.3 public metadata probe"})
        print("DATASTREAM", ds, "HTTP", r.status_code, "CTYPE", r.headers.get("content-type"), "BYTES", len(r.content))
        if r.status_code == 200 and ds != "PDF":
            print(r.text[:1600].replace("\n", " "))
    except Exception as exc:
        print("ERROR", ds, repr(exc))
