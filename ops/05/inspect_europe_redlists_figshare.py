#!/usr/bin/env python3
"""Inspect and download public Figshare files for the 2024 European vascular plant red-list database.

Discovery only: no scoring and no interpretation of missing taxa as absence of threat.
"""
import json
import pathlib
import urllib.request

ARTICLE_ID = 26982994
API = f"https://api.figshare.com/v2/articles/{ARTICLE_ID}"
UA = "JBLR-Analytical-Research-05/1.0 evidence-only"


def get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    out = pathlib.Path("out/05/amenaza/europe-redlists-discovery")
    out.mkdir(parents=True, exist_ok=True)
    meta = get_json(API)
    (out / "figshare_article_metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    files = meta.get("files") or []
    manifest = []
    for f in files:
        manifest.append({k: f.get(k) for k in ("id", "name", "size", "download_url", "supplied_md5", "computed_md5")})
    (out / "file_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"article_id": ARTICLE_ID, "title": meta.get("title"), "version": meta.get("version"), "files": manifest}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
