from __future__ import annotations

import hashlib
import json
from pathlib import Path

import requests
from pypdf import PdfReader

TARGETS = Path("library/07_biblioteca/acquisition/rioja_targets_batch02.json")
OUT = Path("acquired_rioja")
OUT.mkdir(parents=True, exist_ok=True)

cfg = json.loads(TARGETS.read_text(encoding="utf-8"))
records = []
failures = []

session = requests.Session()
session.headers.update({"User-Agent": "JBLR-Biblioteca/0.3 public institutional acquisition"})

for t in cfg["targets"]:
    try:
        r = session.get(t["source_url"], timeout=180)
        r.raise_for_status()
        if not r.content.startswith(b"%PDF-"):
            raise RuntimeError("response is not PDF")
        target = OUT / t["filename"]
        target.write_bytes(r.content)
        sha = hashlib.sha256(r.content).hexdigest()
        reader = PdfReader(target)
        first_text = (reader.pages[0].extract_text() or "")[:3000]
        if t.get("expected_title_fragment") and t["expected_title_fragment"].casefold() not in first_text.casefold():
            raise RuntimeError("expected title fragment not found on first page")
        rec = dict(t)
        rec.update({"bytes": len(r.content), "sha256": sha, "page_count": len(reader.pages), "file": target.name})
        records.append(rec)
        print("ACQUIRED", t["library_id"], len(r.content), len(reader.pages), sha)
    except Exception as exc:
        failures.append({"library_id": t.get("library_id"), "error": repr(exc)})
        print("FAIL", t.get("library_id"), repr(exc))

manifest = {"batch": cfg["batch"], "records": records, "failures": failures}
(OUT / "acquisition_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

if not records or failures:
    raise SystemExit(f"batch incomplete: records={len(records)} failures={len(failures)}")
