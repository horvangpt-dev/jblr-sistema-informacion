#!/usr/bin/env python3
import csv
import hashlib
import importlib.util
import io
import json
import os
import re
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests

V4_PATH = Path(__file__).with_name("taxonomic-reality-protocol-1259-v4.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_v4", V4_PATH)
v4 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v4)

OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_1259_v6"))
WFO_URL = "https://zenodo.org/records/20782718/files/_DwC_backbone_R.zip?download=1"
UA = "JBLR-Taxonomic-Reality-Protocol/6.0 (+scientific quality-control)"


def now():
    return datetime.now(timezone.utc).isoformat()


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("×", "x").strip()).casefold()


def hnorm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").casefold())


def truthy(value):
    return str(value or "").strip().lower() not in {"", "0", "false", "none", "null", "nan"}


def rank_marker(rank):
    r = hnorm(rank)
    if r in {"subspecies", "subsp", "ssp"}:
        return "subsp."
    if r in {"variety", "var", "varietas"}:
        return "var."
    if r in {"form", "forma", "f"}:
        return "f."
    return (rank or "").strip()


class WfoStatic:
    def __init__(self, targets):
        self.targets = {norm(t) for t in targets if norm(t)}
        self.index = {}
        self.meta = {}

    def _download(self):
        s = requests.Session()
        s.headers.update({"User-Agent": UA, "Accept": "application/zip,*/*"})
        last = None
        for attempt in range(6):
            try:
                r = s.get(WFO_URL, timeout=300, allow_redirects=True)
                if r.status_code == 429 or 500 <= r.status_code < 600:
                    last = RuntimeError(f"HTTP_{r.status_code}")
                    if attempt < 5:
                        time.sleep(min(30, 2 ** attempt))
                        continue
                r.raise_for_status()
                if len(r.content) < 50_000_000:
                    raise RuntimeError(f"WFO_ARCHIVE_TOO_SMALL bytes={len(r.content)}")
                return r.content, r.url
            except Exception as e:
                last = e
                if attempt < 5:
                    time.sleep(min(30, 2 ** attempt))
        raise RuntimeError(f"WFO_DOWNLOAD_FAILED {last}")

    def _field(self, header_map, *names):
        for name in names:
            key = hnorm(name)
            if key in header_map:
                return header_map[key]
        return None

    def start(self):
        payload, final_url = self._download()
        archive_sha = hashlib.sha256(payload).hexdigest()
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            members = zf.namelist()
            csv_members = [n for n in members if n.casefold().endswith("classification.csv")]
            if not csv_members:
                csv_members = [n for n in members if n.casefold().endswith(".csv")]
            if not csv_members:
                raise RuntimeError(f"WFO_CLASSIFICATION_CSV_NOT_FOUND members={members[:20]}")
            member = sorted(csv_members, key=lambda n: (len(n), n))[0]
            with zf.open(member) as raw:
                sample = raw.read(65536)
            sample_text = sample.decode("utf-8-sig", "replace")
            try:
                dialect = csv.Sniffer().sniff(sample_text, delimiters=",\t;|")
                delimiter = dialect.delimiter
                quotechar = dialect.quotechar or '"'
            except Exception:
                delimiter = ","
                quotechar = '"'

            with zf.open(member) as raw:
                text = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
                reader = csv.DictReader(text, delimiter=delimiter, quotechar=quotechar)
                headers = reader.fieldnames or []
                header_map = {hnorm(h): h for h in headers if h}
                canonical_f = self._field(header_map, "canonicalName", "canonical_name", "nameWithoutAuthorship")
                scientific_f = self._field(header_map, "scientificName", "scientific_name", "fullNameStringPlain", "full_name_string_plain")
                authorship_f = self._field(header_map, "scientificNameAuthorship", "scientific_name_authorship", "authorship")
                genus_f = self._field(header_map, "genericName", "generic_name", "genus")
                species_f = self._field(header_map, "specificEpithet", "specific_epithet", "species")
                infra_f = self._field(header_map, "infraspecificEpithet", "infraSpecificEpithet", "infraspecific_epithet")
                rank_f = self._field(header_map, "taxonRank", "taxon_rank", "rank")
                status_f = self._field(header_map, "taxonomicStatus", "taxonomic_status", "role", "status")
                accepted_f = self._field(header_map, "acceptedNameUsage", "accepted_name_usage", "acceptedName", "accepted_name")
                accepted_id_f = self._field(header_map, "acceptedNameUsageID", "accepted_name_usage_id", "accepted_id")
                id_f = self._field(header_map, "taxonID", "taxon_id", "wfoID", "wfo_id", "id", "scientificNameID")

                if not any([canonical_f, scientific_f, (genus_f and species_f)]):
                    raise RuntimeError(f"WFO_NAME_FIELDS_NOT_FOUND headers={headers[:80]}")

                rows = 0
                matched_rows = 0
                for row in reader:
                    rows += 1
                    canonical = ""
                    if canonical_f:
                        canonical = (row.get(canonical_f) or "").strip()
                    if not canonical and genus_f and species_f:
                        genus = (row.get(genus_f) or "").strip()
                        species = (row.get(species_f) or "").strip()
                        infra = (row.get(infra_f) or "").strip() if infra_f else ""
                        rank = (row.get(rank_f) or "").strip() if rank_f else ""
                        if genus and species:
                            canonical = f"{genus} {species}"
                            if infra:
                                rm = rank_marker(rank)
                                canonical += f" {rm} {infra}" if rm else f" {infra}"
                    scientific = (row.get(scientific_f) or "").strip() if scientific_f else ""
                    authorship = (row.get(authorship_f) or "").strip() if authorship_f else ""
                    if not canonical and scientific:
                        canonical = scientific
                        if authorship and canonical.endswith(authorship):
                            canonical = canonical[:-len(authorship)].strip()
                    key = norm(canonical)
                    if key not in self.targets:
                        continue
                    rec = {
                        "state": "EXACT_CANONICAL_FOUND",
                        "matched_canonical": canonical,
                        "scientific_name": scientific or canonical,
                        "authorship": authorship,
                        "taxonomic_status": (row.get(status_f) or "").strip() if status_f else "",
                        "accepted_name": (row.get(accepted_f) or "").strip() if accepted_f else "",
                        "accepted_id": (row.get(accepted_id_f) or "").strip() if accepted_id_f else "",
                        "taxon_id": (row.get(id_f) or "").strip() if id_f else "",
                        "source_sha256": archive_sha,
                        "error": "",
                    }
                    if key not in self.index:
                        self.index[key] = rec
                    matched_rows += 1

            self.meta = {
                "source": "World Flora Online",
                "provenance": "World Flora Online Plant List 2026-06 official _DwC_backbone_R.zip via Zenodo",
                "requested_url": WFO_URL,
                "final_url": final_url,
                "archive_sha256": archive_sha,
                "archive_bytes": len(payload),
                "member": member,
                "rows_scanned": rows,
                "matched_rows": matched_rows,
                "targets": len(self.targets),
                "headers": headers,
                "delimiter": delimiter,
                "field_resolution": {
                    "canonical": canonical_f,
                    "scientific": scientific_f,
                    "authorship": authorship_f,
                    "genus": genus_f,
                    "species": species_f,
                    "infra": infra_f,
                    "rank": rank_f,
                    "status": status_f,
                    "accepted": accepted_f,
                    "accepted_id": accepted_id_f,
                    "id": id_f,
                },
            }

    def search(self, target):
        rec = self.index.get(norm(target))
        if rec:
            return dict(rec)
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


def static_found(result):
    return result.get("state") == "EXACT_CANONICAL_FOUND"


def static_negative(result):
    return result.get("state") == "EXACT_CANONICAL_NOT_FOUND"


def write_csv(path, rows):
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fields = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def execute():
    OUT.mkdir(parents=True, exist_ok=True)
    queue = v4.mod.load_queue()
    expected_n = v4.mod.EXPECTED_N
    if len(queue) != expected_n:
        raise SystemExit(f"QUEUE_COUNT_MISMATCH expected={expected_n} got={len(queue)}")

    controls_positive = ["Quercus ilex", "Papaver rhoeas", "Arabidopsis thaliana"]
    nonsense = "Xqznotaxa fictissima"
    targets = [r["taxon"].strip() for r in queue] + controls_positive + [nonsense]

    powo = v4.RobustDwcIndex("powo_wcvp", v4.mod.SOURCES["powo_wcvp"])
    anthos = v4.RobustDwcIndex("anthos", v4.mod.SOURCES["anthos"])
    wfo = WfoStatic(targets)
    powo.start()
    anthos.start()
    wfo.start()

    controls = {}
    for key, src in (("powo_wcvp", powo), ("wfo", wfo), ("anthos", anthos)):
        attempts = []
        positive_ok = False
        for name in controls_positive:
            result = src.search(name)
            attempts.append({"name": name, "result": result})
            if static_found(result):
                positive_ok = True
                break
        neg = src.search(nonsense)
        controls[key] = {
            "pass": positive_ok and static_negative(neg),
            "positive_attempts": attempts,
            "nonsense": neg,
            "meta": src.meta,
        }

    preflight_ok = all(v["pass"] for v in controls.values())
    preflight = {
        "execution": "TAXONOMIC_REALITY_1259_PREFLIGHT_v6",
        "at": now(),
        "pass": preflight_ok,
        "checks": controls,
    }
    (OUT / "TAXONOMIC_REALITY_PREFLIGHT_V6.json").write_text(json.dumps(preflight, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"preflight_pass": preflight_ok, "summary": {k: v["pass"] for k, v in controls.items()}}, ensure_ascii=False), flush=True)
    if not preflight_ok:
        raise SystemExit(3)

    results = []
    for i, row in enumerate(queue, 1):
        taxon = row["taxon"].strip()
        pr = powo.search(taxon)
        wr = wfo.search(taxon)
        ar = anthos.search(taxon)
        threat_reference = any(truthy(row.get(k)) for k in ("assessment_id", "red_list_category_code", "red_list_category"))
        states = [pr["state"], wr["state"], ar["state"]]
        if threat_reference:
            resolution = "KEEP_THREAT_REFERENCE"
        elif any(s == "EXACT_CANONICAL_FOUND" for s in states):
            resolution = "KEEP_TAXONIC_RESPONSE"
        elif all(s == "EXACT_CANONICAL_NOT_FOUND" for s in states):
            resolution = "NO_RESPONSE_ALL_THREE"
        else:
            resolution = "SOURCE_INCOMPLETE"
        base = {
            "universe_index": row.get("universe_index", ""),
            "family": row.get("family", ""),
            "taxon": taxon,
            "iucn_problem_state": row.get("match_state", ""),
            "fresh_iucn_threat_reference_present": threat_reference,
            "resolution": resolution,
            "checked_at": now(),
        }
        for prefix, result in (("powo", pr), ("wfo", wr), ("anthos", ar)):
            for k, val in result.items():
                base[f"{prefix}_{k}"] = val
        results.append(base)
        if i % 100 == 0 or i == len(queue):
            print(
                f"processed={i}/{len(queue)} keep={sum(r['resolution'].startswith('KEEP_') for r in results)} "
                f"no_response={sum(r['resolution']=='NO_RESPONSE_ALL_THREE' for r in results)}",
                flush=True,
            )

    no_response = [r for r in results if r["resolution"] == "NO_RESPONSE_ALL_THREE"]
    incomplete = [r for r in results if r["resolution"] == "SOURCE_INCOMPLETE"]
    keep = [r for r in results if r["resolution"].startswith("KEEP_")]
    write_csv(OUT / "TAXONOMIC_REALITY_1259_RESULTS_V6.csv", results)
    write_csv(OUT / "TAXONOMIC_REALITY_NO_RESPONSE_ALL_THREE_V6.csv", no_response)
    write_csv(OUT / "TAXONOMIC_REALITY_SOURCE_INCOMPLETE_V6.csv", incomplete)
    qa = {
        "execution": "TAXONOMIC_REALITY_1259_V6",
        "at": now(),
        "queue_count": len(queue),
        "results_count": len(results),
        "keep_count": len(keep),
        "no_response_all_three_count": len(no_response),
        "source_incomplete_count": len(incomplete),
        "complete": len(results) == len(queue) and not incomplete,
        "automatic_deletion": False,
        "source_meta": {"powo_wcvp": powo.meta, "wfo": wfo.meta, "anthos": anthos.meta},
    }
    (OUT / "TAXONOMIC_REALITY_1259_QA_V6.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    execute()
