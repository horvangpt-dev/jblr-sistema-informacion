#!/usr/bin/env python3
import csv
import io
import json
import subprocess
import unicodedata
from pathlib import Path

INPUT_BLOB = "ef5192304fa22c2ca8a9daffd67f58aa9c4827de"
HIST_COMMIT = "2753116cdfc53aea44cbc0ddc8196a13d6246873"
BASE_COMMIT = "3f9a860aa6664e44bf3091a2259d6a9ddc9bc8e4"
TARGET_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"
OUT = Path("execution/06/vnext/reuse-first-preflight-185/output")

IDENTITY_KEYS = {
    "taxon", "name", "NOMBRE_RIOJA_VERBATIM", "verbatim_name", "scientific_name",
    "scientificName", "input_taxon", "powo_matched_canonical", "wfo_matched_canonical",
    "anthos_matched_canonical"
}
RELATION_KEYS = {
    "accepted_name", "acceptedName", "accepted_name_resolved", "powo_accepted_name",
    "wfo_accepted_name", "anthos_accepted_name", "synonym", "synonyms"
}
ID_KEYS = {"MITECO_IDTAXON", "idtaxon", "miteco_idtaxon"}
STATUS_KEYS = {
    "resolution", "phase1_resolution", "phase2_state", "state", "terminalState",
    "powo_state", "wfo_state", "anthos_state", "taxonomic_status"
}


def git(*args, text=True):
    return subprocess.check_output(["git", *args], text=text)


def strict_name(v):
    if not isinstance(v, str):
        return None
    return unicodedata.normalize("NFC", v.strip())


def scalar_strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, list):
        for x in v:
            if isinstance(x, str):
                yield x


def add_evidence(store, target, kind, path, record, key, value):
    item = {
        "kind": kind,
        "path": path,
        "key": key,
        "value": value,
        "statuses": {k: record.get(k) for k in STATUS_KEYS if record.get(k) not in (None, "")},
        "miteco_idtaxon": next((record.get(k) for k in ID_KEYS if record.get(k) not in (None, "")), None),
    }
    fingerprint = json.dumps(item, sort_keys=True, ensure_ascii=False)
    if fingerprint not in store[target][kind]["seen"]:
        store[target][kind]["seen"].add(fingerprint)
        store[target][kind]["items"].append(item)


def inspect_record(record, path, targets, store):
    if not isinstance(record, dict):
        return
    for k, v in record.items():
        if k in IDENTITY_KEYS:
            for s in scalar_strings(v):
                n = strict_name(s)
                if n in targets:
                    add_evidence(store, n, "exact_name", path, record, k, s)
        if k in RELATION_KEYS:
            for s in scalar_strings(v):
                n = strict_name(s)
                if n in targets:
                    add_evidence(store, n, "documented_relation", path, record, k, s)
    for v in record.values():
        if isinstance(v, dict):
            inspect_record(v, path, targets, store)
        elif isinstance(v, list):
            for x in v:
                if isinstance(x, dict):
                    inspect_record(x, path, targets, store)


def parse_blob_at(commit, path, targets, store):
    try:
        raw = git("show", f"{commit}:{path}")
    except subprocess.CalledProcessError:
        return
    if path.lower().endswith(".csv"):
        try:
            for row in csv.DictReader(io.StringIO(raw)):
                inspect_record(row, f"{commit}:{path}", targets, store)
        except Exception:
            return
    elif path.lower().endswith(".json"):
        try:
            obj = json.loads(raw)
        except Exception:
            return
        if isinstance(obj, dict):
            inspect_record(obj, f"{commit}:{path}", targets, store)
        elif isinstance(obj, list):
            for row in obj:
                if isinstance(row, dict):
                    inspect_record(row, f"{commit}:{path}", targets, store)


def explicit_resolution_signal(items):
    for item in items:
        if item.get("miteco_idtaxon") not in (None, ""):
            return True
        for k, v in item.get("statuses", {}).items():
            s = str(v).upper()
            if k == "resolution" and s == "KEEP_TAXONIC_RESPONSE":
                return True
            if "RESOLVED" in s and "UNRESOLVED" not in s:
                return True
            if s in {"EXACT_CANONICAL_FOUND", "SUPPORTED", "PASS"}:
                return True
    return False


def main():
    input_obj = json.loads(git("cat-file", "blob", INPUT_BLOB))
    rows = input_obj["groups"][TARGET_GROUP]
    if len(rows) != 185:
        raise SystemExit(f"INPUT_COUNT_NOT_185:{len(rows)}")
    target_rows = {strict_name(r["name"]): r for r in rows}
    targets = set(target_rows)
    if len(targets) != 185:
        raise SystemExit("TARGET_NAMES_NOT_UNIQUE_185")

    store = {
        t: {
            "exact_name": {"seen": set(), "items": []},
            "documented_relation": {"seen": set(), "items": []},
            "exact_id": {"seen": set(), "items": []},
        } for t in targets
    }

    # Historical ACTOR 06 evidence only: structured result artifacts and explicit taxonomy reconciliations.
    hist_paths = git("ls-tree", "-r", "--name-only", HIST_COMMIT).splitlines()
    hist_paths = [p for p in hist_paths if (
        (p.startswith("evidence/06_stimes/taxonomic_reality_") and p.lower().endswith((".csv", ".json")))
        or (p.startswith("app/data/taxonomy/") and p.lower().endswith((".csv", ".json")))
    )]
    for p in hist_paths:
        parse_blob_at(HIST_COMMIT, p, targets, store)

    # Prior batch-specific evidence already canonical before this preflight: ACTOR 09 first 25 attempt.
    base_paths = git("ls-tree", "-r", "--name-only", BASE_COMMIT).splitlines()
    prefix = "execution/09/corpus-b-source-expansion-v1/spanish-deep/runs/CORPUS_B_FAST_NAME_NETWORK_EIDOS_185_20260824_001/"
    base_paths = [p for p in base_paths if p.startswith(prefix) and p.lower().endswith(".json")]
    for p in base_paths:
        parse_blob_at(BASE_COMMIT, p, targets, store)

    # Exact MITECO ID gate is intentionally strict. Current 185 input has null IDs, so no ID reuse is inferred.
    input_nonnull_ids = 0
    details = []
    counts = {"EXACT_ID_TAXON": 0, "EXACT_NAME": 0, "DOCUMENTED_SYNONYM_NETWORK": 0, "NO_HISTORICAL_REUSE_MATCH": 0}
    explicit_signal_count = 0

    for name in sorted(targets):
        src = target_rows[name]
        current_id = src.get("MITECO_IDTAXON")
        if current_id not in (None, ""):
            input_nonnull_ids += 1
        exact = store[name]["exact_name"]["items"]
        rel = store[name]["documented_relation"]["items"]
        # Do not infer an ID from B_SOURCE_RECORD_ID or parent/rank relations.
        if current_id not in (None, "") and store[name]["exact_id"]["items"]:
            stage = "EXACT_ID_TAXON"
        elif exact:
            stage = "EXACT_NAME"
        elif rel:
            stage = "DOCUMENTED_SYNONYM_NETWORK"
        else:
            stage = "NO_HISTORICAL_REUSE_MATCH"
        counts[stage] += 1
        signal = explicit_resolution_signal(exact + rel)
        if signal:
            explicit_signal_count += 1
        details.append({
            "B_SOURCE_RECORD_ID": src.get("B_SOURCE_RECORD_ID"),
            "NOMBRE_RIOJA_VERBATIM": src.get("name"),
            "input_MITECO_IDTAXON": current_id,
            "reuse_stage": stage,
            "explicit_historical_resolution_signal": signal,
            "exact_name_evidence_count": len(exact),
            "documented_relation_evidence_count": len(rel),
            "exact_name_evidence": exact,
            "documented_relation_evidence": rel,
        })

    reuse_total = counts["EXACT_ID_TAXON"] + counts["EXACT_NAME"] + counts["DOCUMENTED_SYNONYM_NETWORK"]
    report = {
        "preflight": "REUSE_FIRST_CROSSWALK_PREFLIGHT_v1",
        "actor": "06",
        "mode": "READ_ONLY_EVIDENCE_REUSE",
        "input_blob": INPUT_BLOB,
        "input_rows": 185,
        "historical_actor06_commit": HIST_COMMIT,
        "baseline_commit": BASE_COMMIT,
        "match_order": ["EXACT_ID_TAXON", "EXACT_NAME", "DOCUMENTED_SYNONYM_NETWORK"],
        "counts": counts,
        "historical_reuse_match_total": reuse_total,
        "remaining_without_historical_reuse_match": counts["NO_HISTORICAL_REUSE_MATCH"],
        "input_nonnull_miteco_ids": input_nonnull_ids,
        "explicit_historical_resolution_signal_count": explicit_signal_count,
        "historical_files_scanned": hist_paths,
        "prior_09_files_scanned": base_paths,
        "guards": {
            "external_taxonomic_network_calls": 0,
            "corpus_a_membership_cross": 0,
            "corpus_b_freeze": 0,
            "neon_writes": 0,
            "database_writes": 0,
            "fuzzy_matching": 0,
            "parent_id_inheritance": 0,
            "rank_collapse": 0,
            "historical_files_modified": 0,
        },
        "semantics": [
            "EVIDENCE_REUSE!=CORPUS_A_MEMBERSHIP_ASSERTION",
            "EXACT_NAME_EVIDENCE!=FINAL_EIDOS_ID",
            "DOCUMENTED_RELATION_REFERENCE!=FORCED_ID",
            "NO_HISTORICAL_REUSE_MATCH!=ABSENCE",
            "SOURCE_FAILURE!=NOT_FOUND",
        ],
        "details": details,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "REUSE_FIRST_PREFLIGHT_REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (OUT / "REUSE_FIRST_PREFLIGHT_ROWS.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=[
            "B_SOURCE_RECORD_ID", "NOMBRE_RIOJA_VERBATIM", "input_MITECO_IDTAXON", "reuse_stage",
            "explicit_historical_resolution_signal", "exact_name_evidence_count", "documented_relation_evidence_count"
        ])
        w.writeheader()
        for d in details:
            w.writerow({k: d[k] for k in w.fieldnames})
    print(json.dumps({k: report[k] for k in ["preflight", "input_rows", "counts", "historical_reuse_match_total", "remaining_without_historical_reuse_match", "explicit_historical_resolution_signal_count", "guards"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
