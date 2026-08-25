from __future__ import annotations

import csv
import hashlib
import json
import zipfile
from collections import Counter
from pathlib import Path
from typing import Mapping, Sequence

MODE = "STIME00_RC3_RECONCILIATION_CONTROLLED_QA"
RELEASE_ID = "JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3"

COHORT_A_ORIGIN = "INHERITED_RC2"
COHORT_B_OFFICIAL_ORIGIN = "NEW_OFFICIAL"
COHORT_B_TEMP_ORIGIN = "NEW_TEMP"

ALLOWED_EXTENSION_TERMINAL_STATES = frozenset({
    "OFFICIAL_ID_EXACT_ACCEPTED",
    "TEMPORARY_JBLR_ID_VALID_AFTER_COMPLETED_OFFICIAL_SEARCH_WITH_NO_CONFIRMED_EXACT_ID",
    "CONFLICT_REVIEW_REQUIRED",
    "UNRESOLVED_AFTER_EXHAUSTIVE_SEARCH",
})
NONTERMINAL_EXTENSION_STATES = frozenset({"SOURCE_FAILURE_PENDING"})

EXPECTED_INHERITED_EVIDENCE_STATES = {
    "DEFERRED_TO_STIME_SAME_RANK_RECONFIRMED": 1303,
    "DEFERRED_TO_STIME_CURRENT_MITECO_NOT_VERIFIED": 55,
    "DEFERRED_TO_STIME_ACTOR06_ACCEPTED_EXACT_IDENTITY": 30,
    "BLOCK_CURRENT_RANK_MISMATCH_PRESERVE_EVIDENCE": 16,
    "DEFERRED_TO_STIME_DIRECT_OFFICIAL_CONFIRMED": 1,
}


class ContractError(RuntimeError):
    pass


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_historical_stime_csv(path: str | Path) -> list[dict]:
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    required = {"rioja_order", "taxon_work_key", "TAX_RIOJA", "RESOLUCION_ID_NACIONAL"}
    missing = required.difference(rows[0].keys() if rows else ())
    if missing:
        raise ContractError(f"HISTORICAL_STIME_SCHEMA_MISSING:{sorted(missing)}")
    return rows


def _load_jsonl_parts(zf: zipfile.ZipFile, prefix: str) -> list[dict]:
    rows: list[dict] = []
    for name in sorted(zf.namelist()):
        if name.startswith(prefix) and name.endswith(".jsonl"):
            for line in zf.read(name).decode("utf-8").splitlines():
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def load_rc3_zip(path: str | Path) -> dict:
    with zipfile.ZipFile(path) as zf:
        manifest = json.loads(zf.read("MANIFEST.json"))
        qa = json.loads(zf.read("QA_FINAL.json"))
        summary = json.loads(zf.read("SUCCESSOR_SUMMARY.json"))
        hubs = _load_jsonl_parts(zf, "TAXON_HUBS_3033_part")
        inherited_evidence = _load_jsonl_parts(zf, "INHERITED_ID_EVIDENCE_1405_part")
    return {
        "manifest": manifest,
        "qa": qa,
        "summary": summary,
        "hubs": hubs,
        "inherited_evidence": inherited_evidence,
    }


def validate_review_queue(queue: Sequence[Mapping]) -> dict:
    if len(queue) != 14:
        raise ContractError(f"HISTORICAL_REVIEW_QUEUE_COUNT:{len(queue)}!=14")
    names = [str(x.get("name", "")).strip() for x in queue]
    if any(not n for n in names):
        raise ContractError("HISTORICAL_REVIEW_QUEUE_EMPTY_NAME")
    if len(set(names)) != 14:
        raise ContractError("HISTORICAL_REVIEW_QUEUE_DUPLICATE_NAME")
    return {"count": 14, "names": names}


def reconcile_historical_to_rc3(historical_rows: Sequence[Mapping], hubs: Sequence[Mapping]) -> dict:
    if len(historical_rows) != 2210:
        raise ContractError(f"HISTORICAL_ROWS:{len(historical_rows)}!=2210")
    historical_keys = [str(r["taxon_work_key"]) for r in historical_rows]
    if len(set(historical_keys)) != 2210:
        raise ContractError("HISTORICAL_TWK_NOT_UNIQUE")
    inherited = [h for h in hubs if h.get("hub_origin") == COHORT_A_ORIGIN]
    if len(inherited) != 2210:
        raise ContractError(f"RC3_INHERITED_ROWS:{len(inherited)}!=2210")
    inherited_by_key = {str(h["taxon_work_key"]): h for h in inherited}
    if len(inherited_by_key) != 2210:
        raise ContractError("RC3_INHERITED_TWK_NOT_UNIQUE")
    hist_set = set(historical_keys)
    rc3_set = set(inherited_by_key)
    missing_in_rc3 = sorted(hist_set - rc3_set)
    missing_in_history = sorted(rc3_set - hist_set)
    order_mismatches = []
    identity_key_mismatches = []
    for row in historical_rows:
        twk = str(row["taxon_work_key"])
        hub = inherited_by_key.get(twk)
        if hub is None:
            continue
        hist_order = int(row["rioja_order"])
        rc3_order = int(hub["rioja_order"])
        if hist_order != rc3_order:
            order_mismatches.append({"taxon_work_key": twk, "historical": hist_order, "rc3": rc3_order})
        if str(hub.get("taxon_identity_hub_key")) != twk:
            identity_key_mismatches.append(twk)
    return {
        "historical_rows": len(historical_rows),
        "historical_unique_twk": len(hist_set),
        "rc3_inherited_rows": len(inherited),
        "rc3_inherited_unique_twk": len(rc3_set),
        "intersection": len(hist_set & rc3_set),
        "missing_historical_twk_in_rc3": len(missing_in_rc3),
        "rc3_inherited_twk_without_history": len(missing_in_history),
        "rioja_order_mismatch_count": len(order_mismatches),
        "identity_hub_key_mismatch_count": len(identity_key_mismatches),
        "pass": len(hist_set & rc3_set) == 2210 and not missing_in_rc3 and not missing_in_history and not order_mismatches and not identity_key_mismatches,
    }


def classify_rc3_cohorts(hubs: Sequence[Mapping]) -> dict:
    origins = Counter(str(h.get("hub_origin")) for h in hubs)
    if len(hubs) != 3033:
        raise ContractError(f"RC3_HUB_COUNT:{len(hubs)}!=3033")
    expected = {COHORT_A_ORIGIN: 2210, COHORT_B_OFFICIAL_ORIGIN: 562, COHORT_B_TEMP_ORIGIN: 261}
    if dict(origins) != expected:
        raise ContractError(f"RC3_COHORT_COUNTS:{dict(origins)}!={expected}")
    official = [h for h in hubs if h.get("hub_origin") == COHORT_B_OFFICIAL_ORIGIN]
    temp = [h for h in hubs if h.get("hub_origin") == COHORT_B_TEMP_ORIGIN]
    official_missing_gov = [h["taxon_work_key"] for h in official if not str(h.get("ID_TAXON_GOBIERNO", "")).strip()]
    official_wrong_state = [h["taxon_work_key"] for h in official if h.get("ID_TAXON_JBLR_STATE") != "GOVERNMENT_EIDOS_EXACT_CURRENT_AT_CREATION"]
    temp_has_gov = [h["taxon_work_key"] for h in temp if str(h.get("ID_TAXON_GOBIERNO", "")).strip()]
    temp_wrong_state = [h["taxon_work_key"] for h in temp if h.get("ID_TAXON_JBLR_STATE") != "TEMPORARY_JBLR_FROM_SUCCESSOR_RIOJA_ORDER"]
    return {
        "total_hubs": 3033,
        "cohort_a_inherited": 2210,
        "cohort_b_total": 823,
        "new_official": 562,
        "new_temp": 261,
        "new_official_missing_government_id": len(official_missing_gov),
        "new_official_wrong_state": len(official_wrong_state),
        "new_temp_with_government_id": len(temp_has_gov),
        "new_temp_wrong_state": len(temp_wrong_state),
        "fresh_resolution_keys": [str(h["taxon_work_key"]) for h in temp],
        "reuse_only_official_keys": [str(h["taxon_work_key"]) for h in official],
        "pass": not official_missing_gov and not official_wrong_state and not temp_has_gov and not temp_wrong_state,
    }


def validate_inherited_official_evidence(rows: Sequence[Mapping]) -> dict:
    counts = Counter(str(r.get("integration_promotion_state")) for r in rows)
    if len(rows) != 1405:
        raise ContractError(f"INHERITED_OFFICIAL_EVIDENCE_ROWS:{len(rows)}!=1405")
    if dict(counts) != EXPECTED_INHERITED_EVIDENCE_STATES:
        raise ContractError(f"INHERITED_EVIDENCE_COUNTS:{dict(counts)}")
    changed = sum(str(r.get("current_id_changed_in_integration")) != "NO" for r in rows)
    if changed:
        raise ContractError(f"INHERITED_OPERATIONAL_ID_CHANGED:{changed}")
    return {"rows": 1405, "states": dict(counts), "current_id_changed_in_integration": 0, "pass": True}


def validate_rc3_manifest(rc3: Mapping) -> dict:
    manifest = rc3["manifest"]
    qa = rc3["qa"]
    summary = rc3["summary"]
    counts = manifest.get("counts", {})
    expected = {"hubs": 3033, "rc2Inherited": 2210, "newOfficial": 562, "newTemporary": 261, "sourceRows": 2262, "inheritedOfficialEvidenceDeferred": 1405}
    for k, v in expected.items():
        if counts.get(k) != v:
            raise ContractError(f"MANIFEST_COUNT_{k}:{counts.get(k)}!={v}")
    if qa.get("QA_FINAL") != "PASS" or summary.get("qa", {}).get("QA_FINAL") != "PASS":
        raise ContractError("RC3_QA_NOT_PASS")
    return {"pass": True, "release_id": manifest.get("releaseId"), "counts": expected}


def is_extension_terminal(state: str) -> bool:
    return state in ALLOWED_EXTENSION_TERMINAL_STATES


def assert_extension_state_semantics(state: str) -> str:
    if state in NONTERMINAL_EXTENSION_STATES:
        return "PENDING"
    if state in ALLOWED_EXTENSION_TERMINAL_STATES:
        return "TERMINAL"
    raise ContractError(f"UNKNOWN_EXTENSION_STATE:{state}")


def normalize_source_state(state: str) -> str:
    if state in {"SOURCE_FAILURE", "SOURCE_FAILURE_PENDING", "SOURCE_UNAVAILABLE", "ACCESS_FAILED"}:
        return state
    return state


def build_09_scope(hubs: Sequence[Mapping], historical_review_queue: Sequence[Mapping]) -> dict:
    queue = validate_review_queue(historical_review_queue)
    cohorts = classify_rc3_cohorts(hubs)
    fresh_keys = cohorts["fresh_resolution_keys"]
    official_keys = cohorts["reuse_only_official_keys"]
    if set(fresh_keys) & set(official_keys):
        raise ContractError("COHORT_B_FRESH_REUSE_OVERLAP")
    return {
        "historical_review_queue_count": queue["count"],
        "historical_review_queue_names": queue["names"],
        "new_temp_fresh_scope_count": len(fresh_keys),
        "new_temp_fresh_scope_keys": fresh_keys,
        "new_official_reuse_only_count": len(official_keys),
        "new_official_reuse_only_keys": official_keys,
        "do_not_rerun_all_3033": True,
        "productive_execution_by_08": 0,
    }


def run_controlled_integration(historical_csv: str | Path, rc3_zip: str | Path, historical_review_queue: Sequence[Mapping]) -> dict:
    historical = load_historical_stime_csv(historical_csv)
    rc3 = load_rc3_zip(rc3_zip)
    manifest_check = validate_rc3_manifest(rc3)
    historical_reconciliation = reconcile_historical_to_rc3(historical, rc3["hubs"])
    cohorts = classify_rc3_cohorts(rc3["hubs"])
    evidence = validate_inherited_official_evidence(rc3["inherited_evidence"])
    scope_09 = build_09_scope(rc3["hubs"], historical_review_queue)
    ready = all([
        manifest_check["pass"], historical_reconciliation["pass"], cohorts["pass"], evidence["pass"],
        scope_09["historical_review_queue_count"] == 14,
        scope_09["new_temp_fresh_scope_count"] == 261,
        scope_09["new_official_reuse_only_count"] == 562,
        scope_09["productive_execution_by_08"] == 0,
    ])
    return {
        "mode": MODE,
        "release_id": RELEASE_ID,
        "input_sha256": {"historical_stime_csv": sha256_file(historical_csv), "rc3_zip": sha256_file(rc3_zip)},
        "manifest_check": manifest_check,
        "historical_reconciliation": historical_reconciliation,
        "cohorts": {k: v for k, v in cohorts.items() if k not in {"fresh_resolution_keys", "reuse_only_official_keys"}},
        "inherited_official_evidence": evidence,
        "scope_for_09": {
            "historical_review_queue_count": scope_09["historical_review_queue_count"],
            "new_temp_fresh_scope_count": scope_09["new_temp_fresh_scope_count"],
            "new_official_reuse_only_count": scope_09["new_official_reuse_only_count"],
            "do_not_rerun_all_3033": scope_09["do_not_rerun_all_3033"],
            "productive_execution_by_08": scope_09["productive_execution_by_08"],
        },
        "guards": {
            "FULL_CORPUS_EXECUTION_BY_08": 0,
            "PRODUCTIVE_IDENTITY_WORK_BY_08": 0,
            "NEON_WRITES": 0,
            "DATABASE_WRITES": 0,
            "RC2_MUTATION": 0,
            "STIME00_FINAL_VALIDATED": False,
            "SOURCE_FAILURE_CONVERTED_TO_NOT_FOUND": 0,
            "PARENT_ID_INHERITANCE": 0,
            "RANK_COLLAPSE": 0,
            "HYBRID_COLLAPSE": 0,
        },
        "READY_FOR_09": "YES" if ready else "NO",
    }
