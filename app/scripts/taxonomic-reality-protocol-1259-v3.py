#!/usr/bin/env python3
import csv
import hashlib
import io
import json
import os
import re
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

IUCN_RESULTS = Path("evidence/06_stimes/iucn_all_2742_fresh/latest/IUCN_ALL_2742_RESULTS.csv")
OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_1259_v3"))
PROBLEM_STATES = {"NO_API_TAXON", "NO_EXACT_MATCH", "UNPARSABLE_NAME"}
EXPECTED_N = 1259
UA = "JBLR-Taxonomic-Reality-Protocol/3.0 (+scientific quality-control)"

SOURCES = {
    "powo_wcvp": {
        "label": "POWO/WCVP",
        "url": "http://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        "provenance": "WCVP official Darwin Core Archive published by Royal Botanic Gardens, Kew; WCVP is the POWO names backbone",
    },
    "wfo": {
        "label": "World Flora Online",
        "url": "https://zenodo.org/records/20782718/files/_DwC_backbone_R.zip?download=1",
        "provenance": "World Flora Online Plant List 2026-06 official static Darwin Core backbone",
    },
    "anthos": {
        "label": "ANTHOS",
        "url": "https://ipt.gbif.es/archive.do?r=rjb-anthos",
        "provenance": "ANTHOS official RJB-CSIC Darwin Core Archive via GBIF-Spain IPT",
    },
}

session = requests.Session()
session.headers.update({"User-Agent": UA, "Accept": "application/zip,*/*"})


def now():
    return datetime.now(timezone.utc).isoformat()


def norm(s):
    s = (s or "").replace("×", "x")
    s = re.sub(r"\s+", " ", s.strip())
    return s.casefold()


def rank_marker(rank):
    r = norm(rank).replace(".", "")
    if r in {"subspecies", "subsp", "ssp"}:
        return "subsp."
    if r in {"variety", "var", "varietas"}:
        return "var."
    if r in {"form", "forma", "f"}:
        return "f."
    if r in {"subvariety", "subvar", "subvarietas"}:
        return "subvar."
    return (rank or "").strip()


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def term_tail(term):
    return (term or "").rsplit("/", 1)[-1].rsplit("#", 1)[-1]


def decode_sep(value, default="\t"):
    if value is None:
        return default
    return {"\\t": "\t", "\\n": "\n", "\\r\\n": "\r\n"}.get(value, value)


def load_queue():
    with IUCN_RESULTS.open(encoding="utf-8", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r.get("match_state") in PROBLEM_STATES]
    if len(rows) != EXPECTED_N:
        raise RuntimeError(f"QUEUE_COUNT_MISMATCH expected={EXPECTED_N} got={len(rows)}")
    return rows


def strip_authorship(scientific_name, authorship):
    sci = re.sub(r"\s+", " ", (scientific_name or "").strip())
    auth = re.sub(r"\s+", " ", (authorship or "").strip())
    if auth and sci.endswith(auth):
        sci = sci[: -len(auth)].strip()
    return sci


def canonical_from_values(values):
    genus = (values.get("genericName") or values.get("genus") or "").strip()
    species = (values.get("specificEpithet") or "").strip()
    infra = (values.get("infraspecificEpithet") or "").strip()
    rank = (values.get("taxonRank") or "").strip()
    if genus and species:
        c = f"{genus} {species}"
        if infra:
            rm = rank_marker(rank)
            c += f" {rm} {infra}" if rm else f" {infra}"
        return re.sub(r"\s+", " ", c).strip()
    sci = values.get("scientificName") or ""
    auth = values.get("scientificNameAuthorship") or ""
    return strip_authorship(sci, auth)


class DwcIndex:
    def __init__(self, key, spec):
        self.key = key
        self.spec = spec
        self.index = {}
        self.meta = {}

    def _download(self):
        last = None
        for attempt in range(4):
            try:
                r = session.get(self.spec["url"], timeout=240, allow_redirects=True)
                if r.status_code >= 400:
                    raise RuntimeError(f"HTTP_{r.status_code} final_url={r.url}")
                if len(r.content) < 10000:
                    raise RuntimeError(f"ARCHIVE_TOO_SMALL bytes={len(r.content)}")
                return r.content, r.url
            except Exception as e:
                last = e
                if attempt < 3:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"DOWNLOAD_FAILED {self.key}: {last}")

    def start(self):
        payload, final_url = self._download()
        archive_sha = sha256_bytes(payload)
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            names = set(zf.namelist())
            if "meta.xml" not in names:
                raise RuntimeError(f"{self.key}: meta.xml not found")
            root = ET.fromstring(zf.read("meta.xml"))
            core = root.find("{*}core")
            if core is None:
                raise RuntimeError(f"{self.key}: core not found")
            loc = core.find("{*}files/{*}location")
            if loc is None or not (loc.text or "").strip():
                raise RuntimeError(f"{self.key}: core location missing")
            location = loc.text.strip()
            if location not in names:
                raise RuntimeError(f"{self.key}: core file missing: {location}")

            encoding = core.attrib.get("encoding", "UTF-8")
            delimiter = decode_sep(core.attrib.get("fieldsTerminatedBy"), "\t")
            quotechar = decode_sep(core.attrib.get("fieldsEnclosedBy"), '"') or '"'
            ignore_headers = int(core.attrib.get("ignoreHeaderLines", "0") or 0)
            id_index = core.find("{*}id")
            id_idx = int(id_index.attrib["index"]) if id_index is not None and "index" in id_index.attrib else None
            fields = {}
            for f in core.findall("{*}field"):
                try:
                    fields[term_tail(f.attrib.get("term", ""))] = int(f.attrib["index"])
                except Exception:
                    pass

            wanted = [
                "scientificName", "scientificNameAuthorship", "genericName", "genus",
                "specificEpithet", "infraspecificEpithet", "taxonRank", "taxonomicStatus",
                "acceptedNameUsage", "acceptedNameUsageID", "scientificNameID", "taxonID",
            ]
            rows = 0
            indexed = 0
            with zf.open(location) as raw:
                text = io.TextIOWrapper(raw, encoding=encoding, errors="replace", newline="")
                reader = csv.reader(text, delimiter=delimiter, quotechar=quotechar)
                for _ in range(ignore_headers):
                    next(reader, None)
                for row in reader:
                    rows += 1
                    vals = {}
                    for name in wanted:
                        idx = fields.get(name)
                        vals[name] = row[idx].strip() if idx is not None and idx < len(row) else ""
                    if id_idx is not None and id_idx < len(row):
                        vals["coreID"] = row[id_idx].strip()
                    canonical = canonical_from_values(vals)
                    key = norm(canonical)
                    if not key:
                        continue
                    rec = {
                        "canonical_name": canonical,
                        "scientific_name": vals.get("scientificName", ""),
                        "authorship": vals.get("scientificNameAuthorship", ""),
                        "taxonomic_status": vals.get("taxonomicStatus", ""),
                        "accepted_name": vals.get("acceptedNameUsage", ""),
                        "accepted_id": vals.get("acceptedNameUsageID", ""),
                        "taxon_id": vals.get("taxonID", "") or vals.get("coreID", ""),
                    }
                    if key not in self.index:
                        self.index[key] = rec
                        indexed += 1
            if rows < 1000 or indexed < 1000:
                raise RuntimeError(f"{self.key}: implausible archive rows={rows} indexed={indexed}")
            self.meta = {
                "source": self.spec["label"],
                "provenance": self.spec["provenance"],
                "requested_url": self.spec["url"],
                "final_url": final_url,
                "archive_sha256": archive_sha,
                "archive_bytes": len(payload),
                "core_location": location,
                "core_rows": rows,
                "unique_canonical_names": indexed,
                "available_fields": sorted(fields.keys()),
            }

    def search(self, target):
        rec = self.index.get(norm(target))
        if rec is None:
            return {
                "state": "EXACT_CANONICAL_NOT_FOUND",
                "matched_canonical": "",
                "scientific_name": "",
                "authorship": "",
                "taxonomic_status": "",
                "accepted_name": "",
                "accepted_id": "",
                "taxon_id": "",
                "source_sha256": self.meta.get("archive_sha256", ""),
                "error": "",
            }
        return {
            "state": "EXACT_CANONICAL_FOUND",
            "matched_canonical": rec["canonical_name"],
            "scientific_name": rec["scientific_name"],
            "authorship": rec["authorship"],
            "taxonomic_status": rec["taxonomic_status"],
            "accepted_name": rec["accepted_name"],
            "accepted_id": rec["accepted_id"],
            "taxon_id": rec["taxon_id"],
            "source_sha256": self.meta.get("archive_sha256", ""),
            "error": "",
        }


def build_sources():
    built = {}
    errors = {}
    for key, spec in SOURCES.items():
        idx = DwcIndex(key, spec)
        try:
            idx.start()
            built[key] = idx
        except Exception as e:
            errors[key] = str(e)
    return built, errors


def preflight():
    OUT.mkdir(parents=True, exist_ok=True)
    built, errors = build_sources()
    checks = {}
    for key in SOURCES:
        if key in errors:
            checks[key] = {"pass": False, "error": errors[key]}
            continue
        src = built[key]
        positives = []
        for n in ["Quercus ilex", "Papaver rhoeas", "Arabidopsis thaliana"]:
            r = src.search(n)
            positives.append({"name": n, "result": r})
            if r["state"] == "EXACT_CANONICAL_FOUND":
                break
        negative = src.search("Xqznotaxa fictissima")
        ok = any(x["result"]["state"] == "EXACT_CANONICAL_FOUND" for x in positives) and negative["state"] == "EXACT_CANONICAL_NOT_FOUND"
        checks[key] = {"pass": ok, "positive_attempts": positives, "negative": negative, "meta": src.meta}
    passed = all(checks.get(k, {}).get("pass") for k in SOURCES)
    payload = {"execution": "TAXONOMIC_REALITY_1259_PREFLIGHT_v3", "at": now(), "pass": passed, "checks": checks}
    (OUT / "TAXONOMIC_REALITY_PREFLIGHT_V3.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"pass": passed, "summary": {k: checks[k].get("pass") for k in checks}}, ensure_ascii=False))
    if not passed:
        raise SystemExit(3)


def run():
    rows = load_queue()
    OUT.mkdir(parents=True, exist_ok=True)
    built, errors = build_sources()
    if errors:
        raise RuntimeError(f"SOURCE_BUILD_ERRORS {errors}")
    out = []
    for i, row in enumerate(rows, 1):
        taxon = row["taxon"].strip()
        results = {k: built[k].search(taxon) for k in SOURCES}
        states = [r["state"] for r in results.values()]
        if any(s == "EXACT_CANONICAL_FOUND" for s in states):
            resolution = "KEEP_EXACT_TAXON_RESPONSE"
        elif all(s == "EXACT_CANONICAL_NOT_FOUND" for s in states):
            resolution = "NO_EXACT_RESPONSE_ALL_THREE"
        else:
            resolution = "SOURCE_INCOMPLETE"
        base = {
            "universe_index": row["universe_index"],
            "family": row["family"],
            "taxon": taxon,
            "iucn_problem_state": row["match_state"],
            "resolution": resolution,
            "checked_at": now(),
        }
        for key, result in results.items():
            for field, value in result.items():
                base[f"{key}_{field}"] = value
        out.append(base)
        if i % 50 == 0:
            print(
                f"processed={i}/{len(rows)} keep={sum(x['resolution']=='KEEP_EXACT_TAXON_RESPONSE' for x in out)} "
                f"no_exact={sum(x['resolution']=='NO_EXACT_RESPONSE_ALL_THREE' for x in out)}",
                flush=True,
            )

    fields = list(out[0].keys())
    with (OUT / "TAXONOMIC_REALITY_1259_RESULTS_V3.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(out)
    no_exact = [r for r in out if r["resolution"] == "NO_EXACT_RESPONSE_ALL_THREE"]
    with (OUT / "TAXONOMIC_REALITY_NO_EXACT_ALL_THREE_V3.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(no_exact)
    qa = {
        "execution": "TAXONOMIC_REALITY_1259_THREE_STATIC_BACKBONES_v3",
        "at": now(),
        "queue_count": len(rows),
        "results_count": len(out),
        "keep_exact_taxon_response": sum(r["resolution"] == "KEEP_EXACT_TAXON_RESPONSE" for r in out),
        "no_exact_response_all_three": len(no_exact),
        "source_incomplete": sum(r["resolution"] == "SOURCE_INCOMPLETE" for r in out),
        "source_metadata": {k: built[k].meta for k in built},
        "automatic_deletion": False,
        "next_step": "Only NO_EXACT_RESPONSE_ALL_THREE proceeds to synonymy/spelling/variant/threat-reference review; no taxon is removed automatically.",
        "complete": len(out) == EXPECTED_N,
    }
    (OUT / "TAXONOMIC_REALITY_1259_QA_V3.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False, indent=2))
    if not qa["complete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        preflight()
    elif "--run" in sys.argv:
        run()
    else:
        raise SystemExit("use --preflight or --run")
