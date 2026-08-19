#!/usr/bin/env python3
import csv
import hashlib
import json
import os
import subprocess
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

BASE = Path("evidence/06_stimes/iucn_all_2742_fresh/latest/IUCN_ALL_2742_RESULTS.csv")
OVERLAY_V1 = Path("app/data/taxonomy/JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v1.json")
PILOT = Path("evidence/06_stimes/eidos_taxonomic_layer_controlled_pilot_v3/latest/EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_V3.json")
NATIONAL_RECHECK = Path("evidence/06_stimes/national_pattern_recheck_20260820/NATIONAL_PATTERN_RECHECK_ACCEPTED_MUTATIONS_v1.json")
OUT = Path(os.environ.get("TAXON_OVERLAY_V2_OUT", "artifacts/active_taxon_universe_overlay_v2"))

EXPECTED_BASE_BLOB_SHA = "de79a9d7e6ed29c566c12861dc5ec889a1de0674"
EXPECTED_OVERLAY_V1_BLOB_SHA = "87829711307debbbe975cee1f6929fde280c1e93"
EXPECTED_BASE_COUNT = 2742
EXPECTED_V1_EFFECTIVE_COUNT = 2739
EXPECTED_V2_EFFECTIVE_COUNT = 2734

BATCH_EXCLUSIONS = [
    {
        "universe_index": 1703,
        "family": "APIACEAE",
        "expected_original_taxon": "Oenanthe hispanica",
        "reason": "ACCEPTED cross-kingdom contamination: official Spanish national pattern classifies this literal as Animalia/Aves/Muscicapidae; remove only from active botanical processing with trace.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-OENANTHE-001",
    },
    {
        "universe_index": 1705,
        "family": "APIACEAE",
        "expected_original_taxon": "Oenanthe leucura",
        "reason": "ACCEPTED cross-kingdom contamination: official Spanish national pattern classifies this literal as Animalia/Aves/Muscicapidae; remove only from active botanical processing with trace.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-OENANTHE-001",
    },
    {
        "universe_index": 1706,
        "family": "APIACEAE",
        "expected_original_taxon": "Oenanthe oenanthe",
        "reason": "ACCEPTED cross-kingdom contamination: official Spanish national pattern classifies this literal as Animalia/Aves/Muscicapidae; remove only from active botanical processing with trace.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-OENANTHE-001",
    },
    {
        "universe_index": 1732,
        "family": "ASTERACEAE",
        "expected_original_taxon": "Onopordon acanthium",
        "reason": "ACCEPTED spelling/transcription-error duplicate of existing active Onopordum acanthium; remove duplicate from active botanical processing with trace.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-ONOPORDUM-001",
        "duplicate_target_index": 1735,
        "duplicate_target_taxon": "Onopordum acanthium",
    },
    {
        "universe_index": 1734,
        "family": "ASTERACEAE",
        "expected_original_taxon": "Onopordon nervosum",
        "reason": "ACCEPTED spelling/transcription-error duplicate of existing active Onopordum nervosum; remove duplicate from active botanical processing with trace.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-ONOPORDUM-001",
        "duplicate_target_index": 1738,
        "duplicate_target_taxon": "Onopordum nervosum",
    },
]

BATCH_REPLACEMENTS = [
    {
        "universe_index": 1733,
        "family": "ASTERACEAE",
        "expected_original_taxon": "Onopordon corymbosum",
        "active_taxon": "Onopordum corymbosum subsp. corymbosum",
        "reason": "ACCEPTED correction preserving the local/Spanish autonymic subspecies treatment; correctly spelled species Onopordum corymbosum already exists separately at index 1737.",
        "accepted_event": "JBLR-EVT-06-20260819-TAXON-ONOPORDUM-001",
    }
]


def now():
    return datetime.now(timezone.utc).isoformat()


def git_blob_sha(path):
    return subprocess.check_output(["git", "hash-object", str(path)], text=True).strip()


def canonical_queue_sha(rows):
    minimal = [
        {
            "universe_index": int(r["universe_index"]),
            "family": (r.get("family") or "").strip(),
            "taxon": (r.get("taxon") or "").strip(),
        }
        for r in rows
    ]
    payload = json.dumps(minimal, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_base():
    with BASE.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) != EXPECTED_BASE_COUNT:
        raise RuntimeError(f"BASE_COUNT_MISMATCH expected={EXPECTED_BASE_COUNT} got={len(rows)}")
    by_index = {}
    for r in rows:
        idx = int(r["universe_index"])
        if idx in by_index:
            raise RuntimeError(f"DUPLICATE_UNIVERSE_INDEX {idx}")
        by_index[idx] = dict(r)
    return by_index


def apply_overlay(by_index, overlay):
    working = deepcopy(by_index)
    excluded = set()
    for item in overlay.get("replacements", []):
        idx = int(item["universe_index"])
        if idx not in working:
            raise RuntimeError(f"REPLACEMENT_INDEX_NOT_FOUND {idx}")
        actual = working[idx].get("taxon", "")
        expected = item["expected_original_taxon"]
        if actual != expected:
            raise RuntimeError(f"REPLACEMENT_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
        working[idx]["historical_taxon"] = actual
        working[idx]["taxon"] = item["active_taxon"]
        working[idx]["effective_identity_state"] = "REPLACED_BY_GUARDED_OVERLAY"
    for item in overlay.get("exclusions", []):
        idx = int(item["universe_index"])
        if idx not in working:
            raise RuntimeError(f"EXCLUSION_INDEX_NOT_FOUND {idx}")
        actual = working[idx].get("taxon", "")
        expected = item["expected_original_taxon"]
        if actual != expected:
            raise RuntimeError(f"EXCLUSION_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
        excluded.add(idx)
    effective = [working[i] for i in sorted(working) if i not in excluded]
    return working, effective, excluded


def verify_batch_targets_against_base(by_index):
    report = []
    for action, items in (("EXCLUDE", BATCH_EXCLUSIONS), ("REPLACE", BATCH_REPLACEMENTS)):
        for item in items:
            idx = int(item["universe_index"])
            row = by_index.get(idx)
            if row is None:
                raise RuntimeError(f"BATCH_INDEX_NOT_FOUND {idx}")
            actual = row.get("taxon", "")
            expected = item["expected_original_taxon"]
            if actual != expected:
                raise RuntimeError(f"BATCH_LITERAL_GUARD_MISMATCH index={idx} expected={expected!r} actual={actual!r}")
            if item.get("family") and row.get("family", "") != item["family"]:
                raise RuntimeError(f"BATCH_FAMILY_GUARD_MISMATCH index={idx} expected={item['family']!r} actual={row.get('family','')!r}")
            report.append({
                "action": action,
                "universe_index": idx,
                "family": row.get("family", ""),
                "before_taxon": actual,
                "after_taxon": item.get("active_taxon") if action == "REPLACE" else None,
                "accepted_event": item["accepted_event"],
            })
    return report


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    base_blob = git_blob_sha(BASE)
    overlay_v1_blob = git_blob_sha(OVERLAY_V1)
    if base_blob != EXPECTED_BASE_BLOB_SHA:
        raise RuntimeError(f"BASE_BLOB_SHA_MISMATCH expected={EXPECTED_BASE_BLOB_SHA} got={base_blob}")
    if overlay_v1_blob != EXPECTED_OVERLAY_V1_BLOB_SHA:
        raise RuntimeError(f"OVERLAY_V1_BLOB_SHA_MISMATCH expected={EXPECTED_OVERLAY_V1_BLOB_SHA} got={overlay_v1_blob}")

    pilot = json.loads(PILOT.read_text(encoding="utf-8"))
    if pilot.get("pilot_id") != "EIDOS_TAXONOMIC_LAYER_CONTROLLED_PILOT_v3" or pilot.get("overall") != "PASS" or int(pilot.get("review_required_count", -1)) != 0:
        raise RuntimeError("EIDOS_PILOT_V3_PASS_GATE_NOT_SATISFIED")

    if not NATIONAL_RECHECK.exists():
        raise RuntimeError("NATIONAL_PATTERN_RECHECK_EVIDENCE_MISSING")

    by_index = load_base()
    overlay_v1 = json.loads(OVERLAY_V1.read_text(encoding="utf-8"))
    _, v1_effective, _ = apply_overlay(by_index, overlay_v1)
    if len(v1_effective) != EXPECTED_V1_EFFECTIVE_COUNT:
        raise RuntimeError(f"V1_EFFECTIVE_COUNT_MISMATCH expected={EXPECTED_V1_EFFECTIVE_COUNT} got={len(v1_effective)}")
    input_queue_sha_v2_algorithm = canonical_queue_sha(v1_effective)

    before_after = verify_batch_targets_against_base(by_index)

    v2 = deepcopy(overlay_v1)
    v2["override_id"] = "JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v2"
    v2["supersedes_override_id"] = overlay_v1.get("override_id")
    v2["generated_at"] = now()
    v2["canonical_execution_directive"] = "JBLR-EVT-0000-20260820-TAXONOMIC-EXEC-001"
    v2["canonical_field_directive"] = "JBLR-EVT-0000-20260820-TAXONOMIC-FIELDS-001"
    v2["pilot_gate"] = {
        "pilot_id": pilot.get("pilot_id"),
        "overall": pilot.get("overall"),
        "pass_count": pilot.get("pass_count"),
        "review_required_count": pilot.get("review_required_count"),
        "evidence_path": str(PILOT),
    }
    v2["hash_safe_input_guard"] = {
        "base_file": str(BASE),
        "base_git_blob_sha": base_blob,
        "overlay_v1_file": str(OVERLAY_V1),
        "overlay_v1_git_blob_sha": overlay_v1_blob,
        "v1_declared_result_minimal_queue_sha256_legacy": overlay_v1.get("result_universe", {}).get("minimal_queue_sha256"),
        "v1_effective_row_count_verified": len(v1_effective),
        "v1_effective_queue_sha256_v2_algorithm": input_queue_sha_v2_algorithm,
        "queue_hash_algorithm": "SHA256_CANONICAL_JSON_SORT_KEYS_COMPACT_UTF8_OF_ORDERED_[universe_index,family,taxon]_v2",
    }

    existing_rep_indices = {int(x["universe_index"]) for x in v2.get("replacements", [])}
    existing_exc_indices = {int(x["universe_index"]) for x in v2.get("exclusions", [])}
    for item in BATCH_REPLACEMENTS:
        idx = int(item["universe_index"])
        if idx in existing_rep_indices or idx in existing_exc_indices:
            raise RuntimeError(f"BATCH_INDEX_ALREADY_PRESENT_IN_V1 {idx}")
        v2.setdefault("replacements", []).append(deepcopy(item))
    for item in BATCH_EXCLUSIONS:
        idx = int(item["universe_index"])
        if idx in existing_rep_indices or idx in existing_exc_indices:
            raise RuntimeError(f"BATCH_INDEX_ALREADY_PRESENT_IN_V1 {idx}")
        v2.setdefault("exclusions", []).append(deepcopy(item))

    _, v2_effective, v2_excluded = apply_overlay(by_index, v2)
    if len(v2_effective) != EXPECTED_V2_EFFECTIVE_COUNT:
        raise RuntimeError(f"V2_EFFECTIVE_COUNT_MISMATCH expected={EXPECTED_V2_EFFECTIVE_COUNT} got={len(v2_effective)}")
    output_queue_sha = canonical_queue_sha(v2_effective)
    v2["result_universe"] = {
        "row_count": len(v2_effective),
        "minimal_queue_sha256": output_queue_sha,
        "hash_algorithm": "SHA256_CANONICAL_JSON_SORT_KEYS_COMPACT_UTF8_OF_ORDERED_[universe_index,family,taxon]_v2",
    }
    v2["accepted_mutation_batch_2026_08_20"] = {
        "state": "HASH_SAFE_ACCEPTED_ONLY_BATCH_MATERIALIZED",
        "replacement_indices": [int(x["universe_index"]) for x in BATCH_REPLACEMENTS],
        "exclusion_indices": [int(x["universe_index"]) for x in BATCH_EXCLUSIONS],
        "accepted_events": sorted({x["accepted_event"] for x in BATCH_REPLACEMENTS + BATCH_EXCLUSIONS}),
        "odotites_mutation_applied": False,
        "odontites_note": "No unequivocal ACCEPTED per-taxon mutation authorization reconstructed; excluded from batch.",
        "herniaria_mutation_applied": False,
        "herniaria_note": "Indices 1166/1168/1173 remain HOLD under VAR_SUBSP_RANK_SYNONYMY_GUARD_v1.",
        "before_after_evidence": before_after,
    }
    v2["invalidated_downstream_evidence"] = deepcopy(overlay_v1.get("invalidated_downstream_evidence", {}))
    repl_reexec = list(v2["invalidated_downstream_evidence"].get("requires_fresh_reexecution_indices", []))
    if 1733 not in repl_reexec:
        repl_reexec.append(1733)
    removed = list(v2["invalidated_downstream_evidence"].get("removed_from_species_level_processing_indices", []))
    for idx in [1703, 1705, 1706, 1732, 1734]:
        if idx not in removed:
            removed.append(idx)
    v2["invalidated_downstream_evidence"]["requires_fresh_reexecution_indices"] = sorted(repl_reexec)
    v2["invalidated_downstream_evidence"]["removed_from_species_level_processing_indices"] = sorted(removed)
    v2["invalidated_downstream_evidence"]["post_v8_rule"] = "Fresh downstream execution required after this identity/membership batch; no old score inheritance."
    prov = list(v2.get("provenance", []))
    for p in [
        "app/data/taxonomy/oenanthe-rioja-reconciliation-v1.json",
        "app/data/taxonomy/onopordum-rioja-reconciliation-v1.json",
        str(NATIONAL_RECHECK),
        str(PILOT),
        "JBLR-EVT-0000-20260820-TAXONOMIC-EXEC-001",
        "JBLR-EVT-0000-20260820-TAXONOMIC-FIELDS-001",
    ]:
        if p not in prov:
            prov.append(p)
    v2["provenance"] = prov

    overlay_out = OUT / "JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v2.json"
    overlay_out.write_text(json.dumps(v2, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    qa = {
        "execution": "JBLR_ACTIVE_TAXON_UNIVERSE_HASH_SAFE_BATCH_v2",
        "at": now(),
        "pass": True,
        "base_blob_sha_verified": base_blob,
        "overlay_v1_blob_sha_verified": overlay_v1_blob,
        "input_effective_count": len(v1_effective),
        "input_effective_queue_sha256_v2_algorithm": input_queue_sha_v2_algorithm,
        "output_effective_count": len(v2_effective),
        "output_effective_queue_sha256": output_queue_sha,
        "new_replacement_indices": [1733],
        "new_exclusion_indices": [1703, 1705, 1706, 1732, 1734],
        "all_excluded_indices_cumulative": sorted(v2_excluded),
        "before_after": before_after,
        "pilot_gate": v2["pilot_gate"],
        "odontites_mutated": False,
        "herniaria_mutated": False,
    }
    (OUT / "JBLR_ACTIVE_TAXON_UNIVERSE_OVERRIDES_v2_QA.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False))


if __name__ == "__main__":
    main()
