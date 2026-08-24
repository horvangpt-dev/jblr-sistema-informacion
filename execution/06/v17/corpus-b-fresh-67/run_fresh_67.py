#!/usr/bin/env python3
import copy
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

TARGET_GROUP = "NO_RESULT_IN_SPANISH_SOURCES_CONSULTED"
RUN_ID = "06_CORPUS_B_FRESH_67_TAXONOMY_V17_20260824_002"
SUPERSEDED_RUN_ID = "06_CORPUS_B_FRESH_67_TAXONOMY_V17_20260824_001"
SOURCE_BATCH_ID = "CORPUS_B_FRESH_67_v17"
SNAPSHOT_VERSION = "06_TAXONOMIC_SNAPSHOT_CORPUS_B_FRESH_67_v17_RANKFIX_v1"
AUTHORIZATION_EVENT = "JBLR-EVT-0000-20260824-RECONCILE-REUSE-FIRST-185-001"
RECONCILED_SCOPE_DRIVE_ID = "1GtLSjl1J7Vbf5JVqN_pL4D09z3JIZOMz"
RANK_FIX_VERSION = "RANK_FIX_v1"


def must_replace(text, old, new, expected=1):
    n = text.count(old)
    if n != expected:
        raise RuntimeError(f"PATCH_PRECONDITION_FAILED count={n} expected={expected} old={old!r}")
    return text.replace(old, new)


def expected_rank_from_verbatim(name):
    n = " " + re.sub(r"\s+", " ", (name or "").casefold()).strip() + " "
    if re.search(r"\b(?:nothosubsp|subsp|ssp)\.?(?=\s)", n):
        return "subspecies"
    if re.search(r"\bvar\.?(?=\s)", n):
        return "variety"
    if re.search(r"\bf\.?(?=\s)", n):
        return "form"
    return "species"


def load_module(path):
    spec = importlib.util.spec_from_file_location("jblr06_rankfix_engine", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if len(sys.argv) != 6:
        raise SystemExit("usage: run_fresh_67.py ORIGINAL_ENGINE GROUP_JSON EIDOS_TTL OUT_DIR REQUEST_JSON")
    engine_path, group_path, eidos_path, out_dir, request_path = map(Path, sys.argv[1:])
    req = json.loads(request_path.read_text(encoding="utf-8"))

    assert req["enabled"] is True
    assert req["actor"] == "06"
    assert req["runId"] == RUN_ID
    assert req["supersedesRunId"] == SUPERSEDED_RUN_ID
    assert req["rankFixVersion"] == RANK_FIX_VERSION
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

    old_detect = '''def detect_rank(name):
    n = norm(name)
    if " nothosubsp " in n or " subsp " in n or " ssp " in n:
        return "subspecies"
    if " var " in n:
        return "variety"
    if " f " in n:
        return "form"
    return "species"
'''
    new_detect = '''def detect_rank(name):
    n = " " + re.sub(r"\\s+", " ", (name or "").casefold()).strip() + " "
    if re.search(r"\\b(?:nothosubsp|subsp|ssp)\\.?(?=\\s)", n):
        return "subspecies"
    if re.search(r"\\bvar\\.?(?=\\s)", n):
        return "variety"
    if re.search(r"\\bf\\.?(?=\\s)", n):
        return "form"
    return "species"
'''
    patched = must_replace(patched, old_detect, new_detect)

    old_markers = '''    c = re.sub(r"\\bssp\\.?\\b", "subsp.", c)
    c = re.sub(r"\\bsubsp\\b", "subsp.", c)
    c = re.sub(r"\\bvar\\b", "var.", c)
    c = re.sub(r"\\bf\\b", "f.", c)
'''
    new_markers = '''    c = re.sub(r"\\bssp\\.?(?=\\s)", "subsp.", c)
    c = re.sub(r"\\bsubsp\\.?(?=\\s)", "subsp.", c)
    c = re.sub(r"\\bvar\\.?(?=\\s)", "var.", c)
    c = re.sub(r"\\bf\\.?(?=\\s)", "f.", c)
'''
    patched = must_replace(patched, old_markers, new_markers)

    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="jblr06-fresh67-rankfix-") as td:
        td = Path(td)
        filtered_path = td / "FILTERED_SCOPE_67.json"
        patched_engine = td / "taxonomy_fresh_67_rankfix.py"
        filtered_path.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        patched_engine.write_text(patched, encoding="utf-8")

        mod = load_module(patched_engine)
        unit_cases = {
            "Avenula lodunensis subsp. romero-zarcoi": "subspecies",
            "Anteriorchis coriophora var. carpetana": "variety",
            "Hieracium lactucella subsp. lactucella": "subspecies",
            "Biscutella valentina var. variegata": "variety",
            "Adenocarpus hispanicus subsp. neilense": "subspecies",
            "Littorela uniflora": "species"
        }
        for name, expected_rank in unit_cases.items():
            actual = mod.detect_rank(name)
            if actual != expected_rank:
                raise RuntimeError(f"RANK_UNIT_TEST_FAILED name={name!r} expected={expected_rank} actual={actual}")
            canon = mod.canonical(name)
            if ".." in canon:
                raise RuntimeError(f"CANONICAL_DOUBLE_PERIOD_TEST_FAILED name={name!r} canonical={canon!r}")

        subprocess.run([
            sys.executable, str(patched_engine), str(filtered_path), str(eidos_path),
            str(out_dir), str(request_path)
        ], check=True)

    intake = json.loads((out_dir / "SOURCE_INTAKE_RECEIPTS.json").read_text(encoding="utf-8"))["rows"]
    identities = json.loads((out_dir / "TAXONOMIC_IDENTITY_RESULTS.json").read_text(encoding="utf-8"))["rows"]
    if len(intake) != 67 or len(identities) != 67:
        raise RuntimeError("RANK_FIX_OUTPUT_COUNT_MISMATCH")

    rank_counts = {"species": 0, "subspecies": 0, "variety": 0, "form": 0}
    failures = []
    for src, identity in zip(intake, identities):
        verbatim = src["NOMBRE_BIODIVERSIDAD_RIOJANA_VERBATIM"]
        expected_rank = expected_rank_from_verbatim(verbatim)
        actual_intake_rank = src["requiredRank"]
        actual_identity_rank = identity["rank"]
        parsed_name = src["parsedScientificName"]
        rank_counts[expected_rank] = rank_counts.get(expected_rank, 0) + 1
        if actual_intake_rank != expected_rank or actual_identity_rank != expected_rank:
            failures.append({
                "B_SOURCE_RECORD_ID": src["B_SOURCE_RECORD_ID"],
                "verbatim": verbatim,
                "expectedRank": expected_rank,
                "intakeRank": actual_intake_rank,
                "identityRank": actual_identity_rank
            })
        if ".." in parsed_name:
            failures.append({
                "B_SOURCE_RECORD_ID": src["B_SOURCE_RECORD_ID"],
                "verbatim": verbatim,
                "error": "DOUBLE_PERIOD_IN_PARSED_NAME",
                "parsedScientificName": parsed_name
            })

    rank_qa = {
        "runId": RUN_ID,
        "rankFixVersion": RANK_FIX_VERSION,
        "pass": len(failures) == 0,
        "scope": 67,
        "checkedRows": 67,
        "rankCounts": rank_counts,
        "doublePeriodCount": sum(1 for x in intake if ".." in x["parsedScientificName"]),
        "failures": failures,
        "unitTests": {
            "subspDottedRecognized": True,
            "varDottedRecognized": True,
            "speciesUnaffected": True,
            "canonicalDoublePeriodForbidden": True
        }
    }
    (out_dir / "RANK_FIX_QA.json").write_text(json.dumps(rank_qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not rank_qa["pass"]:
        raise RuntimeError(f"INDEPENDENT_RANK_QA_FAILED:{len(failures)}")

    authority = {
        "actor": "06",
        "runId": RUN_ID,
        "supersedesRunId": SUPERSEDED_RUN_ID,
        "rankFixVersion": RANK_FIX_VERSION,
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
