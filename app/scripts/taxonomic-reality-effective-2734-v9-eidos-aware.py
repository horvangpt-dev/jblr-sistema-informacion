#!/usr/bin/env python3
import csv
import hashlib
import importlib.util
import json
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

V8_PATH = Path(__file__).with_name("taxonomic-reality-effective-2739-v8-hybrid-aware.py")
spec = importlib.util.spec_from_file_location("taxonomic_reality_v8", V8_PATH)
v8 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v8)

OUT = Path(os.environ.get("TAXON_REALITY_OUT", "artifacts/taxonomic_reality_effective_2734_v9"))
OVERLAY_V2 = Path("app/data/taxonomy/JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v2.json")
PILOT_V3 = Path("evidence/06_stimes/eidos_taxonomic_layer_controlled_pilot_v3/latest/EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V3.json")
EXPECTED_OVERLAY_V2_BLOB_SHA = "ddceaa11f9243caf1a52108b5e17ce16b015ce70"
EXPECTED_EFFECTIVE = 2734
EIDOS_ENDPOINT = "https://datos.iepnb.es/sparql"
EIDOS_LIMIT = 200000
EIDOS_TIMEOUT = 180

SEMANTIC_RESOLUTIONS = {
    2210: {
        "state": "SEMANTIC_HYBRID_FORMULA_PARSED",
        "linked_name": "",
        "evidence": "SALIX_RIOJA_RECONCILIATION_v1 / JBLR-EVT-06-20260820-TAXON-SALIX-001",
    },
    2218: {
        "state": "HISTORICAL_ORTHOGRAPHIC_USAGE_LINKED",
        "linked_name": "Salix salviifolia",
        "evidence": "SALIX_RIOJA_RECONCILIATION_v1 / JBLR-EVT-06-20260820-TAXON-SALIX-001",
    },
    2222: {
        "state": "EXPLICIT_SYNONYMY_LINKED",
        "linked_name": "Salix x fragilis",
        "evidence": "SALIX_RIOJA_RECONCILIATION_v1 / JBLR-EVT-06-20260820-TAXON-SALIX-001",
    },
    2251: {
        "state": "EXPLICIT_PARENT_FORMULA_EQUIVALENCE_LINKED",
        "linked_name": "Saxifraga x alejandrei",
        "evidence": "SAXIFRAGA_RIOJA_RECONCILIATION_v1 / JBLR-EVT-06-20260820-TAXON-SAXIFRAGA-001",
    },
}

VALIDATED_ALIAS_BY_INDEX = {
    2218: {"name": "Salix salviifolia", "evidence": "SALIX_RIOJA_RECONCILIATION_v1"},
    2217: {"name": "Salix x lambertiana", "evidence": "SALIX_RIOJA_RECONCILIATION_v1"},
    2221: {"name": "Salix x fragilis", "evidence": "SALIX_RIOJA_RECONCILIATION_v1"},
    2222: {"name": "Salix x fragilis", "evidence": "SALIX_RIOJA_RECONCILIATION_v1"},
    2251: {"name": "Saxifraga x alejandrei", "evidence": "SAXIFRAGA_RIOJA_RECONCILIATION_v1"},
    2261: {"name": "Saxifraga cuneata", "evidence": "SAXIFRAGA_RIOJA_RECONCILIATION_v1"},
}

PREFIXES = """
PREFIX plinian:<https://datos.iepnb.es/def/sector-publico/medio-ambiente/pliniancore#>
PREFIX darwin:<http://rs.tdwg.org/dwc/terms/>
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def git_blob_sha(path):
    import subprocess
    return subprocess.check_output(["git", "hash-object", str(path)], text=True).strip()


def norm(s):
    s = (s or "").replace("×", " x ")
    s = re.sub(r"[^0-9A-Za-zÀ-ÖØ-öø-ÿ.]+", " ", s.casefold())
    return re.sub(r"\s+", " ", s).strip()


def parse_taxon(name):
    n = norm(name)
    toks = n.split()
    if len(toks) < 2:
        return None
    genus = toks[0]
    hybrid = False
    if len(toks) >= 3 and toks[1] == "x":
        hybrid = True
        species = toks[2]
    else:
        species = toks[1]
    # Parent-formula strings such as Genus species x G./S. species are not direct single-name keys.
    if "x" in toks[2:] and not hybrid:
        return None
    rank = ""
    infra = ""
    rank_pos = None
    for marker in ("subsp.", "subsp", "var.", "var", "subvar.", "subvar", "f.", "f"):
        if marker in toks:
            rank_pos = toks.index(marker)
            rank = marker.rstrip(".")
            if rank_pos + 1 < len(toks):
                infra = toks[rank_pos + 1]
            break
    if name.strip().endswith(" gr.") or name.strip().endswith(" gr"):
        return {"genus": genus, "species": species, "rank": "group", "infra": "", "hybrid": hybrid}
    return {"genus": genus, "species": species, "rank": rank, "infra": infra, "hybrid": hybrid}


def key_for(name):
    p = parse_taxon(name)
    if p is None or p["rank"] == "group":
        return None
    return (p["genus"], p["species"], p["rank"], p["infra"], bool(p["hybrid"]))


def eidos_query_all():
    q = PREFIXES + f"""
SELECT DISTINCT ?TaxonRecordID ?ScientificName WHERE {{
  ?TaxonRecord plinian:hasHierarchy ?Taxon .
  ?TaxonRecord plinian:TaxonRecordID ?TaxonRecordID .
  ?Taxon darwin:scientificName ?ScientificName .
}} ORDER BY ?TaxonRecordID LIMIT {EIDOS_LIMIT}
"""
    last_exc = None
    for attempt in range(1, 4):
        try:
            r = requests.get(
                EIDOS_ENDPOINT,
                params={"query": q, "format": "application/sparql-results+json", "timeout": "120000"},
                headers={"Accept": "application/sparql-results+json", "User-Agent": "JBLR-Actor06-Taxonomic-Reality-V9/1.0"},
                timeout=EIDOS_TIMEOUT,
            )
            r.raise_for_status()
            data = r.json()
            rows = []
            for b in data.get("results", {}).get("bindings", []):
                rows.append({
                    "taxon_record_id": b.get("TaxonRecordID", {}).get("value", ""),
                    "scientific_name": b.get("ScientificName", {}).get("value", ""),
                })
            if len(rows) >= EIDOS_LIMIT:
                raise RuntimeError(f"EIDOS_INDEX_TRUNCATION_GUARD count={len(rows)} limit={EIDOS_LIMIT}")
            return rows
        except Exception as exc:
            last_exc = exc
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"EIDOS_INDEX_FETCH_FAILED {type(last_exc).__name__}: {last_exc}")


def build_eidos_index(rows):
    index = defaultdict(list)
    for rec in rows:
        k = key_for(rec["scientific_name"])
        if k is not None:
            index[k].append(rec)
    return index


def resolve_eidos(name, index):
    k = key_for(name)
    if k is None:
        return {"state": "NOT_DIRECT_SINGLE_TAXON_KEY", "id": "", "name": "", "candidates": []}
    candidates = index.get(k, [])
    if not candidates:
        return {"state": "ID_TAXON_UNRESOLVED_EIDOS", "id": "", "name": "", "candidates": []}
    ids = sorted({c["taxon_record_id"] for c in candidates if c["taxon_record_id"]})
    if len(ids) != 1:
        return {"state": "CONFLICT_MULTI_ID", "id": "", "name": "", "candidates": candidates}
    chosen = sorted(candidates, key=lambda c: (len(c["scientific_name"]), c["scientific_name"].casefold()))[0]
    return {"state": "RESOLVED_EIDOS_CURRENT", "id": ids[0], "name": chosen["scientific_name"], "candidates": candidates}


def write_csv(path, rows, fields=None):
    if fields is None:
        fields = list(rows[0].keys()) if rows else []
    with path.open("w", encoding="utf-8", newline="") as f:
        if not fields:
            return
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    overlay_blob = git_blob_sha(OVERLAY_V2)
    if overlay_blob != EXPECTED_OVERLAY_V2_BLOB_SHA:
        raise RuntimeError(f"OVERLAY_V2_BLOB_SHA_MISMATCH expected={EXPECTED_OVERLAY_V2_BLOB_SHA} got={overlay_blob}")
    overlay = json.loads(OVERLAY_V2.read_text(encoding="utf-8"))
    if int(overlay.get("result_universe", {}).get("row_count", -1)) != EXPECTED_EFFECTIVE:
        raise RuntimeError("OVERLAY_V2_EFFECTIVE_COUNT_GUARD_FAILED")

    pilot = json.loads(PILOT_V3.read_text(encoding="utf-8"))
    if pilot.get("pilot_id") != "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v3" or pilot.get("overall") != "PASS" or int(pilot.get("review_required_count", -1)) != 0:
        raise RuntimeError("EIDOS_CONTROLLED_PILOT_V3_PASS_GATE_FAILED")

    # Execute the V8 hybrid-aware three-source audit on the newly materialized 2734 universe.
    v8.OUT = OUT
    v8.v7.OVERLAY_PATH = OVERLAY_V2
    v8.v7.EXPECTED_EFFECTIVE = EXPECTED_EFFECTIVE
    v8.execute()

    legacy_results_path = OUT / "TAXONOMIC_REALITY_EFFECTIVE_2739_RESULTS_V8.csv"
    if not legacy_results_path.exists():
        # The V8 wrapper retains its historical filename pattern; accept a count-neutral path variant if present.
        candidates = list(OUT.glob("*RESULTS_V8.csv"))
        if len(candidates) != 1:
            raise RuntimeError("V8_INTERMEDIATE_RESULTS_NOT_FOUND_UNIQUELY")
        legacy_results_path = candidates[0]

    with legacy_results_path.open(encoding="utf-8", newline="") as f:
        legacy_rows = list(csv.DictReader(f))
    if len(legacy_rows) != EXPECTED_EFFECTIVE:
        raise RuntimeError(f"V9_INTERMEDIATE_COUNT_MISMATCH expected={EXPECTED_EFFECTIVE} got={len(legacy_rows)}")

    eidos_checked_at = now()
    eidos_rows = eidos_query_all()
    eidos_payload = json.dumps(sorted(eidos_rows, key=lambda r: (r["taxon_record_id"], r["scientific_name"])), ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    eidos_snapshot_sha256 = hashlib.sha256(eidos_payload).hexdigest()
    eidos_index = build_eidos_index(eidos_rows)

    final = []
    for row in legacy_rows:
        idx = int(row["universe_index"])
        source_taxon = row["taxon"].strip()
        legacy_resolution = row["resolution"]
        direct = resolve_eidos(source_taxon, eidos_index)
        resolution_method = "DIRECT_SOURCE_NAME"
        resolved = direct
        alias = VALIDATED_ALIAS_BY_INDEX.get(idx)
        if direct["state"] in {"ID_TAXON_UNRESOLVED_EIDOS", "NOT_DIRECT_SINGLE_TAXON_KEY"} and alias:
            alias_result = resolve_eidos(alias["name"], eidos_index)
            if alias_result["state"] == "RESOLVED_EIDOS_CURRENT":
                resolved = alias_result
                resolution_method = "VALIDATED_ALIAS_NETWORK"
            elif alias_result["state"] == "CONFLICT_MULTI_ID":
                resolved = alias_result
                resolution_method = "VALIDATED_ALIAS_NETWORK_CONFLICT"

        semantic = SEMANTIC_RESOLUTIONS.get(idx)
        group_level = legacy_resolution.startswith("KEEP_GROUP_LEVEL")
        if group_level:
            resolution = "KEEP_GROUP_LEVEL_RECORD_OUTSIDE_SPECIES_EXACT_RESOLUTION"
        elif resolved["state"] == "CONFLICT_MULTI_ID":
            resolution = "EIDOS_CONFLICT_MULTI_ID_REVIEW_REQUIRED"
        elif semantic:
            resolution = "SEMANTICALLY_RECONCILED_SOURCE_LITERAL_PRESERVED"
        elif resolved["state"] == "RESOLVED_EIDOS_CURRENT":
            resolution = "EIDOS_EXACT_CURRENT_OPERATIVE"
        elif legacy_resolution.startswith("EXACT_SUPPORTED"):
            resolution = "SUPPORTED_PARALLEL_OFFICIAL_SOURCE_EIDOS_DIRECT_UNRESOLVED"
        elif legacy_resolution == "NO_RESPONSE_ALL_THREE_REVIEW_REQUIRED":
            resolution = "REVIEW_REQUIRED_ALL_ACTIVE_RESOLVERS_NO_EXACT"
        else:
            resolution = "SOURCE_INCOMPLETE"

        out = dict(row)
        out["source_verbatim_taxon"] = source_taxon
        out["legacy_three_source_resolution"] = legacy_resolution
        out["resolution"] = resolution
        out["operative_scientific_name"] = resolved["name"] if resolved["state"] == "RESOLVED_EIDOS_CURRENT" else source_taxon
        out["eidos_state"] = resolved["state"]
        out["eidos_id_taxon_exact"] = resolved["id"]
        out["eidos_scientific_name"] = resolved["name"]
        out["eidos_resolution_method"] = resolution_method
        out["eidos_alias_used"] = alias["name"] if alias and resolution_method.startswith("VALIDATED_ALIAS") else ""
        out["eidos_alias_evidence"] = alias["evidence"] if alias and resolution_method.startswith("VALIDATED_ALIAS") else ""
        out["eidos_candidate_count"] = len(resolved["candidates"])
        out["eidos_candidate_ids"] = "|".join(sorted({c["taxon_record_id"] for c in resolved["candidates"] if c["taxon_record_id"]}))
        out["eidos_last_checked"] = eidos_checked_at
        out["eidos_endpoint"] = EIDOS_ENDPOINT
        out["semantic_reconciliation_state"] = semantic["state"] if semantic else ""
        out["semantic_linked_name"] = semantic["linked_name"] if semantic else ""
        out["semantic_reconciliation_evidence"] = semantic["evidence"] if semantic else ""
        final.append(out)

    review = [r for r in final if r["resolution"] in {"EIDOS_CONFLICT_MULTI_ID_REVIEW_REQUIRED", "REVIEW_REQUIRED_ALL_ACTIVE_RESOLVERS_NO_EXACT"}]
    incomplete = [r for r in final if r["resolution"] == "SOURCE_INCOMPLETE"]
    group_level = [r for r in final if r["resolution"].startswith("KEEP_GROUP_LEVEL")]
    semantic = [r for r in final if r["resolution"] == "SEMANTICALLY_RECONCILED_SOURCE_LITERAL_PRESERVED"]
    eidos_exact = [r for r in final if r["resolution"] == "EIDOS_EXACT_CURRENT_OPERATIVE"]
    parallel_supported = [r for r in final if r["resolution"] == "SUPPORTED_PARALLEL_OFFICIAL_SOURCE_EIDOS_DIRECT_UNRESOLVED"]

    genus_map = defaultdict(lambda: {"families": set(), "taxa": []})
    for r in review:
        taxon = r["source_verbatim_taxon"].strip()
        genus = taxon.split()[0] if taxon else ""
        genus_map[genus]["families"].add(r.get("family", ""))
        genus_map[genus]["taxa"].append(taxon)
    genus_summary = []
    for genus, data in genus_map.items():
        genus_summary.append({
            "genus": genus,
            "family": ";".join(sorted(x for x in data["families"] if x)),
            "review_taxon_count": len(data["taxa"]),
            "review_taxa": " | ".join(sorted(data["taxa"], key=str.casefold)),
        })
    genus_summary.sort(key=lambda r: (-r["review_taxon_count"], r["family"], r["genus"]))

    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2734_RESULTS_V9.csv", final)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2734_REVIEW_REQUIRED_V9.csv", review)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2734_SOURCE_INCOMPLETE_V9.csv", incomplete)
    write_csv(OUT / "TAXONOMIC_REALITY_EFFECTIVE_2734_ANOMALOUS_GENERA_V9.csv", genus_summary, fields=["genus", "family", "review_taxon_count", "review_taxa"])

    qa = {
        "execution": "TAXONOMIC_REALITY_EFFECTIVE_2734_V9_EIDOS_AWARE",
        "at": now(),
        "canonical_field_directive": "JBLR-EVT-0000-20260820-TAXONOMIC-FIELDS-001",
        "canonical_execution_directive": "JBLR-EVT-0000-20260820-TAXONOMIC-EXEC-001",
        "supersedes_for_current_execution": "TAXONOMIC_REALITY_EFFECTIVE_2739_V8",
        "v8_preserved_immutable": True,
        "base_universe_count": 2742,
        "effective_universe_count": len(final),
        "overlay_v2_blob_sha": overlay_blob,
        "overlay_v2_result_queue_sha256": overlay.get("result_universe", {}).get("minimal_queue_sha256", ""),
        "eidos_controlled_pilot": {"pilot_id": pilot.get("pilot_id"), "overall": pilot.get("overall"), "pass_count": pilot.get("pass_count"), "review_required_count": pilot.get("review_required_count")},
        "eidos_endpoint": EIDOS_ENDPOINT,
        "eidos_last_checked": eidos_checked_at,
        "eidos_index_record_count": len(eidos_rows),
        "eidos_index_key_count": len(eidos_index),
        "eidos_snapshot_sha256": eidos_snapshot_sha256,
        "eidos_exact_current_operative_count": len(eidos_exact),
        "parallel_supported_eidos_direct_unresolved_count": len(parallel_supported),
        "semantic_reconciled_count": len(semantic),
        "review_required_count": len(review),
        "source_incomplete_count": len(incomplete),
        "group_level_record_count": len(group_level),
        "anomalous_genus_count": len(genus_summary),
        "next_genus": (genus_summary[0]["family"] + " · " + genus_summary[0]["genus"]) if genus_summary else "NONE",
        "next_genus_review_count": genus_summary[0]["review_taxon_count"] if genus_summary else 0,
        "complete": len(final) == EXPECTED_EFFECTIVE and not incomplete,
        "automatic_deletion": False,
        "automatic_normalization": False,
        "not_found_is_not_absence": True,
        "no_information_loss": True,
        "odontites_mutated": False,
        "herniaria_1166_1168_1173_hold_preserved": True,
    }
    (OUT / "TAXONOMIC_REALITY_EFFECTIVE_2734_QA_V9.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False), flush=True)
    if not qa["complete"]:
        raise SystemExit(6)


if __name__ == "__main__":
    main()
