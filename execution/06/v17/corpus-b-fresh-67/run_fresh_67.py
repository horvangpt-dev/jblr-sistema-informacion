#!/usr/bin/env python3
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

TARGET_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"
RUN_ID = "06_CORPUS_B_FRESH_67_TAXONOMY_V17_20260824_001"
SOURCE_BATCH_ID = "CORPUS_B_FRESH_67_v17"
SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_FRESH_67_v17"
AUTHORIZATION_EVENT = "JBLR-EVT-0000-20260824-RECONCILE-REUSE-FIRST-185-001"
RECONCILED_SCOPE_DRIVE_ID = "1GtLSjl1J7Vbf5JVqN_pL4D09z3JIZOMz"


def must_replace(text, old, new, expected=1):
    n = text.count(old)
    if n != expected:
        raise RuntimeError(f"PATCH_PRECONDITION_FAILED count={n} expected={expected} old={old!r}")
    return text.replace(old, new)


def main():
    if len(sys.argv) != 6:
        raise SystemExit("usage: run_fresh_67.py ORIGINAL_ENGINE GROUP_JSON EIDOS_TTL OUT_DIR REQUEST_JSON")
    engine_path, group_path, eidos_path, out_dir, request_path = map(Path, sys.argv[1:])
    req = json.loads(request_path.read_text(encoding="utf-8"))

    assert req["enabled"] is True
    assert req["actor"] == "06"
    assert req["runId"] == RUN_ID
    assert req["sourceBatchId"] == SOURCE_BATCH_ID
    assert req["scope"] == 67
    assert req["authorizationEvent"] == AUTHORIZATION_EVENT
    assert req["reconciledScopeDriveId"] == RECONCILED_SCOPE_DRIVE_ID
    assert req["crossWithA"] is False
    assert req["corpusBFreeze"] is False
    assert req["neonWrites"] == 0 and req["databaseWrites"] == 0
    assert req["noFuzzy"] is True and req["noParentIdInheritance"] is True and req["noRankCollapse"] is True
    assert req["downstreamStimesAuthorized"] is False
    assert req["externalTaxonomicSourcesAuthorized"] is True
    assert req["engineReuse"]["reuseType"] == "TECHNICAL_ENGINE_ONLY"
    assert req["engineReuse"]["priorResultsImported"] is False

    scope = req["scopeRecords"]
    assert len(scope) == 67
    ids = [str(x["B_SOURCE_RECORD_ID"]) for x in scope]
    assert len(set(ids)) == 67
    excluded = {str(x["B_SOURCE_RECORD_ID"]) for x in req["excludedByReuseFirst"]}
    assert excluded == {"3682", "3006"}
    assert not (set(ids) & excluded)

    source = json.loads(group_path.read_text(encoding="utf-8"))
    all_rows = source["groups"][TARGET_GROUP]
    assert len(all_rows) == 185
    by_id = {str(x["B_SOURCE_RECORD_ID"]): x for x in all_rows}
    assert len(by_id) == 185

    selected = []
    for expected in scope:
        rid = str(expected["B_SOURCE_RECORD_ID"])
        row = by_id[rid]
        if row["name"] != expected["name"]:
            raise RuntimeError(f"VERBATIM_SCOPE_MISMATCH id={rid} source={row['name']!r} expected={expected['name']!r}")
        selected.append(row)
    assert len(selected) == 67

    filtered = copy.deepcopy(source)
    filtered["groups"][TARGET_GROUP] = selected

    original = engine_path.read_text(encoding="utf-8")
    patched = original
    patched = must_replace(patched,
        'RUN_ID = "06_CORPUS_B_UNRESOLVED_185_TAXONOMY_20260824_001"',
        f'RUN_ID = "{RUN_ID}"')
    patched = must_replace(patched,
        'SOURCE_BATCH_ID = "CORPUS_B_UNRESOLVED_185_v1"',
        f'SOURCE_BATCH_ID = "{SOURCE_BATCH_ID}"')
    patched = must_replace(patched,
        'SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_185_v1"',
        f'SNAPSHOT_VERSION = "{SNAPSHOT_VERSION}"')
    patched = must_replace(patched, 'assert req["scope"] == 185 and req["crossWithA"] is False',
                           'assert req["scope"] == 67 and req["crossWithA"] is False')
    patched = must_replace(patched, 'assert len(rows) == 185, len(rows)', 'assert len(rows) == 67, len(rows)')
    patched = must_replace(patched, 'assert len(set(ids)) == 185', 'assert len(set(ids)) == 67')
    patched = must_replace(patched, '"inputCount185": len(intake) == 185,', '"inputCount67": len(intake) == 67,')
    patched = must_replace(patched, '"uniqueSourceRecordIds185": len({x["B_SOURCE_RECORD_ID"] for x in intake}) == 185,',
                           '"uniqueSourceRecordIds67": len({x["B_SOURCE_RECORD_ID"] for x in intake}) == 67,')
    patched = must_replace(patched, '"identityCount185": len(identities) == 185,', '"identityCount67": len(identities) == 67,')
    patched = must_replace(patched, '"idStateCount185": len(idstates) == 185,', '"idStateCount67": len(idstates) == 67,')
    patched = must_replace(patched, '"snapshotCount185": len(snapshots) == 185,', '"snapshotCount67": len(snapshots) == 67,')
    patched = must_replace(patched, '"inputRows": 185, "processedRows": len(idstates),',
                           '"inputRows": 67, "processedRows": len(idstates),')

    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="jblr06-fresh67-") as td:
        td = Path(td)
        filtered_path = td / "FILTERED_SCOPE_67.json"
        patched_engine = td / "taxonomy_fresh_67.py"
        filtered_path.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        patched_engine.write_text(patched, encoding="utf-8")
        subprocess.run([
            sys.executable, str(patched_engine), str(filtered_path), str(eidos_path),
            str(out_dir), str(request_path)
        ], check=True)

    authority = {
        "actor": "06",
        "runId": RUN_ID,
        "scope": 67,
        "authorizationEvent": AUTHORIZATION_EVENT,
        "reconciledScopeDriveId": RECONCILED_SCOPE_DRIVE_ID,
        "inputBlobSha": req["inputBlobSha"],
        "scopeRecords": scope,
        "excludedByReuseFirst": req["excludedByReuseFirst"],
        "engineReuse": req["engineReuse"],
        "guards": {
            "crossWithA": False,
            "corpusBFreeze": False,
            "neonWrites": 0,
            "databaseWrites": 0,
            "noFuzzy": True,
            "noParentIdInheritance": True,
            "noRankCollapse": True,
            "downstreamStimesAuthorized": False
        }
    }
    (out_dir / "SCOPE_AUTHORITY.json").write_text(
        json.dumps(authority, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    receipt = json.loads((out_dir / "RUN_RECEIPT.json").read_text(encoding="utf-8"))
    if receipt.get("processedRows") not in (0, 67):
        raise RuntimeError(f"UNEXPECTED_PROCESSED_ROWS:{receipt.get('processedRows')}")


if __name__ == "__main__":
    main()
