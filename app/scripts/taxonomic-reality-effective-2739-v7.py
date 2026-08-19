#!/usr/bin/env python3
import csv
import importlib.util
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

V6_PATH = Path(__file__).with_name("taxonomic-reality-protocol-1259-v6.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_v6", V6_PATH)
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)

IUCN_RESULTS = Path("evidence/06_stimes/iucn_all_2742_fresh/latest/IUCN_ALL_2742_RESULTS.csv")
OVERLAY_PATH = Path("app/data/taxonomy/JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v1.json")
OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_effective_2739_v7"))
EXPECTED_BASE = 2742
EXPECTED_EFFECTIVE = 2739


def now():
    return datetime.now(timezone.utc).isoformat()


def truthy(value):
    return str(value or "").strip().lower() not in {"", "0", "false", "none", "null", "nan"}


def load_effective_queue():
    with IUCN_RESULTS.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) != EXPECTED_BASE:
        raise RuntimeError(f"BASE_COUNT_MISMATCH expected={EXPECTED_BASE} got={len(rows)}")

    overlay = json.loads(OVERLAY_PATH.read_text(encoding="utf-8"))
    by_index = {}
    for row in rows:
        idx = int(row["universe_index"])
        if idx in by_index:
            raise RuntimeError(f"DUPLICATE_UNIVERSE_INDEX {idx}")
        by_index[idx] = dict(row)

    applied_replacements = []
    for item in overlay.get("replacements", []):
        idx = int(item["universe_index"])
        row = by_index.get(idx)
        if row is None:
            raise RuntimeError(f"REPLACEMENT_INDEX_NOT_FOUND {idx}")
        expected = item["expected_original_taxon"]
        actual = row.get("taxon", "")
        if actual != expected:
            raise RuntimeError(f"REPLACEMENT_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
        row["taxon"] = item["active_taxon"]
        row["effective_identity_state"] = "REPLACED_BY_GUARDED_OVERLAY"
        row["historical_taxon"] = expected
        applied_replacements.append(idx)

    excluded = set()
    for item in overlay.get("exclusions", []):
        idx = int(item["universe_index"])
        row = by_index.get(idx)
        if row is None:
            raise RuntimeError(f"EXCLUSION_INDEX_NOT_FOUND {idx}")
        expected = item["expected_original_taxon"]
        actual = row.get("taxon", "")
        if actual != expected:
            raise RuntimeError(f"EXCLUSION_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
        excluded.add(idx)

    retained_special = {}
    for item in overlay.get("retained_non_species_determinations", []):
        idx = int(item["universe_index"])
        row = by_index.get(idx)
        if row is None:
            raise RuntimeError(f"SPECIAL_INDEX_NOT_FOUND {idx}")
        expected = item["expected_original_taxon"]
        actual = row.get("taxon", "")
        if actual != expected:
            raise RuntimeError(f"SPECIAL_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
        retained_special[idx] = item.get("interpretation", "NON_SPECIES_DETERMINATION")

    effective = [by_index[i] for i in sorted(by_index) if i not in excluded]
    if len(effective) != EXPECTED_EFFECTIVE:
        raise RuntimeError(f"EFFECTIVE_COUNT_MISMATCH expected={EXPECTED_EFFECTIVE} got={len(effective)}")

    return effective, overlay, applied_replacements, sorted(excluded), retained_special


def write_csv(path, rows, fields=None):
    if fields is None:
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        fields = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def execute():
    OUT.mkdir(parents=True, exist_ok=True)
    queue, overlay, replacements, exclusions, retained_special = load_effective_queue()
    targets = [r["taxon"].strip() for r in queue if int(r["universe_index"]) not in retained_special]
    controls_positive = ["Quercus ilex", "Papaver rhoeas", "Arabidopsis thaliana"]
    nonsense = "Xqznotaxa fictissima"

    powo = v6.v4.RobustDwcIndex("powo_wcvp", v6.v4.mod.SOURCES["powo_wcvp"])
    anthos = v6.v4.RobustDwcIndex("anthos", v6.v4.mod.SOURCES["anthos"])
    wfo = v6.WfoStatic(targets + controls_positive + [nonsense])
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
            if v6.static_found(result):
                positive_ok = True
                break
        neg = src.search(nonsense)
        controls[key] = {
            "pass": positive_ok and v6.static_negative(neg),
            "positive_attempts": attempts,
            "nonsense": neg,
            "meta": src.meta,
        }

    preflight_ok = all(v["pass"] for v in controls.values())
    preflight = {
        "execution": "TAXONOMIC_REALITY_EFFECTIVE_2739_PREFLIGHT_v7",
        "at": now(),
        "pass": preflight_ok,
        "checks": controls,
        "effective_universe_count": len(queue),
        "overlay_result_sha256": overlay.get("result_universe", {}).get("minimal_queue_sha256", ""),
    }
    (OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_PREFLIGHT_V7.json").write_text(
        json.dumps(preflight, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"preflight_pass": preflight_ok, "summary": {k: v["pass"] for k, v in controls.items()}}, ensure_ascii=False), flush=True)
    if not preflight_ok:
        raise SystemExit(3)

    results = []
    for i, row in enumerate(queue, 1):
        idx = int(row["universe_index"])
        taxon = row["taxon"].strip()
        threat_reference = any(truthy(row.get(k)) for k in ("assessment_id", "red_list_category_code", "red_list_category"))

        if idx in retained_special:
            base = {
                "universe_index": idx,
                "family": row.get("family", ""),
                "taxon": taxon,
                "historical_taxon": row.get("historical_taxon", ""),
                "effective_identity_state": row.get("effective_identity_state", "UNCHANGED"),
                "fresh_iucn_threat_reference_present": threat_reference,
                "resolution": "KEEP_GROUP_LEVEL_RECORD_OUTSIDE_SPECIES_EXACT_RESOLUTION",
                "special_interpretation": retained_special[idx],
                "checked_at": now(),
                "powo_state": "NOT_APPLICABLE_GROUP_LEVEL",
                "wfo_state": "NOT_APPLICABLE_GROUP_LEVEL",
                "anthos_state": "NOT_APPLICABLE_GROUP_LEVEL",
            }
            results.append(base)
            continue

        pr = powo.search(taxon)
        wr = wfo.search(taxon)
        ar = anthos.search(taxon)
        states = [pr["state"], wr["state"], ar["state"]]
        if any(s == "EXACT_CANONICAL_FOUND" for s in states):
            resolution = "EXACT_SUPPORTED_AT_LEAST_ONE_OFFICIAL_SOURCE"
        elif all(s == "EXACT_CANONICAL_NOT_FOUND" for s in states):
            resolution = "NO_RESPONSE_ALL_THREE_REVIEW_REQUIRED"
        else:
            resolution = "SOURCE_INCOMPLETE"

        base = {
            "universe_index": idx,
            "family": row.get("family", ""),
            "taxon": taxon,
            "historical_taxon": row.get("historical_taxon", ""),
            "effective_identity_state": row.get("effective_identity_state", "UNCHANGED"),
            "fresh_iucn_threat_reference_present": threat_reference,
            "resolution": resolution,
            "special_interpretation": "",
            "checked_at": now(),
        }
        for prefix, result in (("powo", pr), ("wfo", wr), ("anthos", ar)):
            for k, val in result.items():
                base[f"{prefix}_{k}"] = val
        results.append(base)
        if i % 250 == 0 or i == len(queue):
            supported = sum(r["resolution"].startswith("EXACT_SUPPORTED") for r in results)
            review = sum(r["resolution"].startswith("NO_RESPONSE_ALL_THREE") for r in results)
            print(f"processed={i}/{len(queue)} supported={supported} review={review}", flush=True)

    review = [r for r in results if r["resolution"] == "NO_RESPONSE_ALL_THREE_REVIEW_REQUIRED"]
    incomplete = [r for r in results if r["resolution"] == "SOURCE_INCOMPLETE"]
    group_level = [r for r in results if r["resolution"].startswith("KEEP_GROUP_LEVEL")]
    supported = [r for r in results if r["resolution"].startswith("EXACT_SUPPORTED")]

    genus_map = defaultdict(lambda: {"families": set(), "taxa": []})
    for r in review:
        genus = re.split(r"\s+", r["taxon"].strip())[0] if r["taxon"].strip() else ""
        genus_map[genus]["families"].add(r.get("family", ""))
        genus_map[genus]["taxa"].append(r["taxon"])
    genus_summary = []
    for genus, data in genus_map.items():
        genus_summary.append({
            "genus": genus,
            "family": ";".join(sorted(x for x in data["families"] if x)),
            "review_taxon_count": len(data["taxa"]),
            "review_taxa": " | ".join(sorted(data["taxa"], key=str.casefold)),
        })
    genus_summary.sort(key=lambda r: (-r["review_taxon_count"], r["family"], r["genus"]))

    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_RESULTS_V7.csv", results)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_NO_RESPONSE_ALL_THREE_V7.csv", review)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_SOURCE_INCOMPLETE_V7.csv", incomplete)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_ANOMALOUS_GENERA_V7.csv", genus_summary,
              fields=["genus", "family", "review_taxon_count", "review_taxa"])

    qa = {
        "execution": "TAXONOMIC_REALITY_EFFECTIVE_2739_V7",
        "at": now(),
        "base_universe_count": EXPECTED_BASE,
        "effective_universe_count": len(queue),
        "applied_replacement_indices": replacements,
        "excluded_indices": exclusions,
        "retained_special_indices": sorted(retained_special),
        "supported_count": len(supported),
        "no_response_all_three_review_count": len(review),
        "source_incomplete_count": len(incomplete),
        "group_level_record_count": len(group_level),
        "anomalous_genus_count": len(genus_summary),
        "complete": len(results) == len(queue) and not incomplete,
        "automatic_deletion": False,
        "automatic_normalization": False,
        "source_meta": {"powo_wcvp": powo.meta, "wfo": wfo.meta, "anthos": anthos.meta},
        "overlay_result_sha256": overlay.get("result_universe", {}).get("minimal_queue_sha256", ""),
    }
    (OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_QA_V7.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"]:
        raise SystemExit(4)


if __name__ == "__main__":
    execute()
