#!/usr/bin/env python3
import csv
import importlib.util
import io
import json
import os
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET

BASE = os.path.join(os.path.dirname(__file__), "taxonomic-reality-protocol-1259-v3.py")
SPEC = importlib.util.spec_from_file_location("taxonomic_reality_v3", BASE)
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def _cf(s):
    return (s or "").casefold()


def _find_member(names, wanted, prefix=""):
    candidates = []
    if prefix:
        candidates.append(posixpath.normpath(posixpath.join(prefix, wanted)))
    candidates.append(wanted)
    for c in candidates:
        if c in names:
            return c
    wanted_base = posixpath.basename(wanted).casefold()
    matches = [n for n in names if posixpath.basename(n).casefold() == wanted_base]
    if not matches:
        return None
    matches.sort(key=lambda n: (len(n.split("/")), len(n), n))
    return matches[0]


class RobustDwcIndex(mod.DwcIndex):
    def start(self):
        payload, final_url = self._download()
        archive_sha = mod.sha256_bytes(payload)
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            names = set(zf.namelist())
            meta_candidates = [n for n in names if posixpath.basename(n).casefold() == "meta.xml"]
            if not meta_candidates:
                raise RuntimeError(f"{self.key}: meta.xml not found anywhere; members_sample={sorted(names)[:12]}")
            meta_candidates.sort(key=lambda n: (len(n.split("/")), len(n), n))
            meta_path = meta_candidates[0]
            meta_prefix = posixpath.dirname(meta_path)
            root = ET.fromstring(zf.read(meta_path))
            core = root.find("{*}core")
            if core is None:
                raise RuntimeError(f"{self.key}: core not found in {meta_path}")
            loc = core.find("{*}files/{*}location")
            if loc is None or not (loc.text or "").strip():
                raise RuntimeError(f"{self.key}: core location missing")
            declared_location = loc.text.strip()
            location = _find_member(names, declared_location, meta_prefix)
            if not location:
                raise RuntimeError(f"{self.key}: core file missing declared={declared_location} meta={meta_path}")

            encoding = core.attrib.get("encoding", "UTF-8")
            delimiter = mod.decode_sep(core.attrib.get("fieldsTerminatedBy"), "\t")
            quotechar = mod.decode_sep(core.attrib.get("fieldsEnclosedBy"), '"') or '"'
            ignore_headers = int(core.attrib.get("ignoreHeaderLines", "0") or 0)
            id_index = core.find("{*}id")
            id_idx = int(id_index.attrib["index"]) if id_index is not None and "index" in id_index.attrib else None

            fields_cf = {}
            original_terms = []
            for f in core.findall("{*}field"):
                try:
                    term = mod.term_tail(f.attrib.get("term", ""))
                    idx = int(f.attrib["index"])
                    fields_cf[_cf(term)] = idx
                    original_terms.append(term)
                except Exception:
                    pass

            aliases = {
                "scientificName": ["scientificname"],
                "scientificNameAuthorship": ["scientificnameauthorship"],
                "genericName": ["genericname"],
                "genus": ["genus"],
                "specificEpithet": ["specificepithet"],
                "infraspecificEpithet": ["infraspecificepithet"],
                "taxonRank": ["taxonrank"],
                "taxonomicStatus": ["taxonomicstatus"],
                "acceptedNameUsage": ["acceptednameusage"],
                "acceptedNameUsageID": ["acceptednameusageid"],
                "scientificNameID": ["scientificnameid"],
                "taxonID": ["taxonid"],
            }

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
                    for canonical_key, names_cf in aliases.items():
                        idx = None
                        for name_cf in names_cf:
                            if name_cf in fields_cf:
                                idx = fields_cf[name_cf]
                                break
                        vals[canonical_key] = row[idx].strip() if idx is not None and idx < len(row) else ""
                    if id_idx is not None and id_idx < len(row):
                        vals["coreID"] = row[id_idx].strip()
                    canonical = mod.canonical_from_values(vals)
                    key = mod.norm(canonical)
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
                "meta_location": meta_path,
                "core_location_declared": declared_location,
                "core_location_resolved": location,
                "core_rows": rows,
                "unique_canonical_names": indexed,
                "available_fields": sorted(set(original_terms), key=str.casefold),
                "parser_version": "ROBUST_DWCA_NESTED_META_CASEFOLD_v4",
            }


def build_sources_v4():
    built = {}
    errors = {}
    for key, spec in mod.SOURCES.items():
        idx = RobustDwcIndex(key, spec)
        try:
            idx.start()
            built[key] = idx
        except Exception as e:
            errors[key] = str(e)
    return built, errors


def preflight_v4():
    mod.OUT.mkdir(parents=True, exist_ok=True)
    built, errors = build_sources_v4()
    checks = {}
    for key in mod.SOURCES:
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
    passed = all(checks.get(k, {}).get("pass") for k in mod.SOURCES)
    payload = {"execution": "TAXONOMIC_REALITY_1259_PREFLIGHT_v4", "at": mod.now(), "pass": passed, "checks": checks}
    (mod.OUT / "TAXONOMIC_REALITY_PREFLIGHT_V4.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"pass": passed, "summary": {k: checks[k].get("pass") for k in checks}}, ensure_ascii=False), flush=True)
    if not passed:
        raise SystemExit(3)


def run_v4():
    rows = mod.load_queue()
    mod.OUT.mkdir(parents=True, exist_ok=True)
    built, errors = build_sources_v4()
    if errors:
        raise RuntimeError(f"SOURCE_BUILD_ERRORS {errors}")
    out = []
    for i, row in enumerate(rows, 1):
        taxon = row["taxon"].strip()
        results = {k: built[k].search(taxon) for k in mod.SOURCES}
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
            "checked_at": mod.now(),
        }
        for key, result in results.items():
            for field, value in result.items():
                base[f"{key}_{field}"] = value
        out.append(base)
        if i % 50 == 0:
            print(f"processed={i}/{len(rows)} keep={sum(x['resolution']=='KEEP_EXACT_TAXON_RESPONSE' for x in out)} no_exact={sum(x['resolution']=='NO_EXACT_RESPONSE_ALL_THREE' for x in out)}", flush=True)

    fields = list(out[0].keys())
    results_path = mod.OUT / "TAXONOMIC_REALITY_1259_RESULTS_V4.csv"
    with results_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(out)
    no_exact = [r for r in out if r["resolution"] == "NO_EXACT_RESPONSE_ALL_THREE"]
    no_path = mod.OUT / "TAXONOMIC_REALITY_NO_EXACT_ALL_THREE_V4.csv"
    with no_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader(); w.writerows(no_exact)
    qa = {
        "execution": "TAXONOMIC_REALITY_1259_V4",
        "processed": len(out),
        "expected": mod.EXPECTED_N,
        "complete": len(out) == mod.EXPECTED_N,
        "keep_exact": sum(r["resolution"] == "KEEP_EXACT_TAXON_RESPONSE" for r in out),
        "no_exact_all_three": len(no_exact),
        "source_incomplete": sum(r["resolution"] == "SOURCE_INCOMPLETE" for r in out),
        "automatic_deletion": False,
        "source_meta": {k: built[k].meta for k in built},
    }
    (mod.OUT / "TAXONOMIC_REALITY_1259_QA_V4.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"] or qa["source_incomplete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    if "--preflight" in sys.argv:
        preflight_v4()
    elif "--run" in sys.argv:
        run_v4()
    else:
        raise SystemExit("use --preflight or --run")
