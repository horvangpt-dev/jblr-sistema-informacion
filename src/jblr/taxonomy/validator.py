from __future__ import annotations

from dataclasses import dataclass, asdict
from hashlib import sha256
from pathlib import Path
from typing import Any
import json
import zipfile


@dataclass(frozen=True)
class ValidationResult:
    status: str
    source_sha256: str
    release_id: str | None
    counts: dict[str, int]
    checks: dict[str, Any]
    errors: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def _jsonl_rows(zf: zipfile.ZipFile, names: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for name in names:
        for lineno, raw in enumerate(zf.read(name).decode("utf-8").splitlines(), start=1):
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{name}:{lineno}: invalid JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{name}:{lineno}: expected JSON object")
            rows.append(row)
    return rows


def _duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    dup: set[str] = set()
    for value in values:
        if not value:
            continue
        if value in seen:
            dup.add(value)
        seen.add(value)
    return sorted(dup)


def _missing_or_extra_keys(rows: list[dict[str, Any]], expected: set[str]) -> list[dict[str, Any]]:
    problems: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        actual = set(row)
        if actual != expected:
            problems.append({
                "row": index,
                "missing": sorted(expected - actual),
                "extra": sorted(actual - expected),
            })
    return problems


def _has_cycle(edges: list[tuple[str, str]]) -> bool:
    graph: dict[str, list[str]] = {}
    for src, dst in edges:
        graph.setdefault(src, []).append(dst)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        for nxt in graph.get(node, []):
            if visit(nxt):
                return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in graph)


def _valid_provenance(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and bool(value.get("source_type"))
        and bool(value.get("source_pointer"))
    )


def validate_relation_rows(
    concept_ids: set[str],
    aliases: list[dict[str, Any]],
    supersessions: list[dict[str, Any]],
) -> dict[str, Any]:
    alias_errors: list[str] = []
    allowed_alias_types = {"HISTORICAL_INTERNAL_ID", "LEGACY_OPERATIONAL_ID", "SOURCE_IDENTIFIER", "NAME_REFERENCE"}
    for i, row in enumerate(aliases, start=1):
        if row.get("target_taxon_concept_id") not in concept_ids:
            alias_errors.append(f"alias row {i}: broken target")
        if row.get("alias_type") not in allowed_alias_types:
            alias_errors.append(f"alias row {i}: invalid alias_type")
        if not _valid_provenance(row.get("provenance")):
            alias_errors.append(f"alias row {i}: missing/invalid provenance")
    if _duplicates([str(r.get("alias_id", "")) for r in aliases]):
        alias_errors.append("duplicate alias_id")

    supersession_errors: list[str] = []
    edges: list[tuple[str, str]] = []
    for i, row in enumerate(supersessions, start=1):
        src = str(row.get("from_taxon_concept_id", ""))
        dst = str(row.get("to_taxon_concept_id", ""))
        if src not in concept_ids or dst not in concept_ids:
            supersession_errors.append(f"supersession row {i}: broken endpoint")
        if not src or src == dst:
            supersession_errors.append(f"supersession row {i}: invalid self/empty relation")
        if row.get("relation_type") not in {"SUPERSEDED_BY", "REPLACED_BY"}:
            supersession_errors.append(f"supersession row {i}: invalid relation_type")
        if not row.get("reason"):
            supersession_errors.append(f"supersession row {i}: missing reason")
        if not _valid_provenance(row.get("provenance")):
            supersession_errors.append(f"supersession row {i}: missing/invalid provenance")
        if src and dst:
            edges.append((src, dst))
    if _duplicates([str(r.get("relation_id", "")) for r in supersessions]):
        supersession_errors.append("duplicate relation_id")
    if _has_cycle(edges):
        supersession_errors.append("supersession cycle")

    return {
        "alias_rows": len(aliases),
        "supersession_rows": len(supersessions),
        "alias_errors": alias_errors,
        "supersession_errors": supersession_errors,
        "pass": not alias_errors and not supersession_errors,
    }


def validate_rc3_release(zip_path: str | Path, contract_path: str | Path) -> ValidationResult:
    zip_path = Path(zip_path)
    contract = json.loads(Path(contract_path).read_text(encoding="utf-8"))
    errors: list[str] = []
    checks: dict[str, Any] = {}
    source_sha = _digest(zip_path.read_bytes())
    expected_sha = contract["source"]["sha256"]
    checks["source_hash"] = {"expected": expected_sha, "observed": source_sha, "pass": source_sha == expected_sha}
    if source_sha != expected_sha:
        return ValidationResult(
            status="FAIL",
            source_sha256=source_sha,
            release_id=None,
            counts={},
            checks=checks,
            errors=("source SHA-256 mismatch",),
        )

    with zipfile.ZipFile(zip_path) as zf:
        actual_names = sorted(zf.namelist())
        expected_internal = contract["expected_internal_files"]
        expected_names = sorted(expected_internal)
        checks["internal_file_set"] = {"expected_count": len(expected_names), "observed_count": len(actual_names), "pass": actual_names == expected_names}
        if actual_names != expected_names:
            errors.append("internal file set mismatch")

        internal_hash_failures = []
        for name, spec in expected_internal.items():
            if name not in actual_names:
                internal_hash_failures.append(name)
                continue
            data = zf.read(name)
            if _digest(data) != spec["sha256"] or len(data) != spec["bytes"]:
                internal_hash_failures.append(name)
        checks["internal_hashes"] = {"failures": internal_hash_failures, "pass": not internal_hash_failures}
        if internal_hash_failures:
            errors.append("internal file hash/size mismatch")

        manifest = json.loads(zf.read("MANIFEST.json"))
        qa = json.loads(zf.read("QA_FINAL.json"))
        release_id = manifest.get("releaseId")
        checks["release_id"] = {"expected": contract["release_id"], "observed": release_id, "pass": release_id == contract["release_id"]}
        if release_id != contract["release_id"]:
            errors.append("release ID mismatch")

        hub_names = sorted(n for n in actual_names if n.startswith("TAXON_HUBS_3033_part") and n.endswith(".jsonl"))
        route_names = sorted(n for n in actual_names if n.startswith("RIOJA_SOURCE_ROUTING_2262_part") and n.endswith(".jsonl"))
        evidence_names = sorted(n for n in actual_names if n.startswith("INHERITED_ID_EVIDENCE_1405_part") and n.endswith(".jsonl"))
        hubs = _jsonl_rows(zf, hub_names)
        routes = _jsonl_rows(zf, route_names)
        evidence = _jsonl_rows(zf, evidence_names)
        counts = {"hubs": len(hubs), "source_rows": len(routes), "inherited_id_evidence": len(evidence)}

        expected_counts = contract["counts"]
        count_pass = counts["hubs"] == expected_counts["hubs"] and counts["source_rows"] == expected_counts["source_rows"] and counts["inherited_id_evidence"] == expected_counts["inherited_id_evidence"]
        checks["row_counts"] = {"expected": {k: expected_counts[k] for k in counts}, "observed": counts, "pass": count_pass}
        if not count_pass:
            errors.append("row count mismatch")

        origin_counts: dict[str, int] = {}
        for row in hubs:
            origin_counts[row["hub_origin"]] = origin_counts.get(row["hub_origin"], 0) + 1
        expected_origins = {"INHERITED_RC2": expected_counts["rc2_inherited"], "NEW_OFFICIAL": expected_counts["new_official"], "NEW_TEMP": expected_counts["new_temporary"]}
        observed_origins = {key: origin_counts.get(key, 0) for key in expected_origins}
        unexpected_origins = {key: value for key, value in origin_counts.items() if key not in expected_origins}
        origin_pass = observed_origins == expected_origins and not unexpected_origins
        checks["hub_origin_counts"] = {"expected": expected_origins, "observed": observed_origins, "unexpected": unexpected_origins, "pass": origin_pass}
        if not origin_pass:
            errors.append("hub origin counts mismatch")

        field_checks = {}
        for label, rows in (("hub", hubs), ("source_routing", routes), ("inherited_id_evidence", evidence)):
            problems = _missing_or_extra_keys(rows, set(contract["required_fields"][label]))
            field_checks[label] = {"problem_rows": problems[:20], "problem_count": len(problems), "pass": not problems}
            if problems:
                errors.append(f"{label} attribute loss/addition")
        checks["attribute_sets"] = field_checks

        identity_fields = ["successor_release_row_id", "taxon_work_key", "taxon_identity_hub_key", "ID_TAXON_JBLR", "ID_TAXON_GOBIERNO"]
        identity_dups = {field: _duplicates([str(row.get(field, "")) for row in hubs]) for field in identity_fields}
        checks["identity_duplicates"] = {"duplicates": identity_dups, "pass": all(not v for v in identity_dups.values())}
        if any(identity_dups.values()):
            errors.append("duplicate identity/identifier value")

        work_key_mismatches = [row["successor_release_row_id"] for row in hubs if row["taxon_work_key"] != row["taxon_identity_hub_key"]]
        checks["identity_collapse_guard"] = {"mismatches": work_key_mismatches[:20], "count": len(work_key_mismatches), "pass": not work_key_mismatches}
        if work_key_mismatches:
            errors.append("taxon_work_key/taxon_identity_hub_key mismatch")

        by_successor = {row["successor_release_row_id"]: row for row in hubs}
        broken_routes: list[str] = []
        mismatched_routes: list[str] = []
        for row in routes:
            target = by_successor.get(row["successor_release_row_id"])
            if target is None:
                broken_routes.append(row["source_record_key"])
            elif target["taxon_work_key"] != row["taxon_work_key"]:
                mismatched_routes.append(row["source_record_key"])
        checks["source_references"] = {"broken": broken_routes[:20], "mismatched": mismatched_routes[:20], "broken_count": len(broken_routes), "mismatched_count": len(mismatched_routes), "pass": not broken_routes and not mismatched_routes}
        if broken_routes or mismatched_routes:
            errors.append("broken or inconsistent source-to-concept reference")

        missing_provenance = [row.get("source_record_key", f"row-{i}") for i, row in enumerate(routes, start=1) if not row.get("source_record_key") or not row.get("source_snapshot_sha256") or not row.get("raw_row_sha256")]
        checks["source_provenance"] = {"missing": missing_provenance[:20], "count": len(missing_provenance), "pass": not missing_provenance}
        if missing_provenance:
            errors.append("mandatory source provenance missing")

        expected_manifest_counts = {
            "hubs": expected_counts["hubs"],
            "rc2Inherited": expected_counts["rc2_inherited"],
            "newOfficial": expected_counts["new_official"],
            "newTemporary": expected_counts["new_temporary"],
            "sourceRows": expected_counts["source_rows"],
            "inheritedOfficialEvidenceDeferred": expected_counts["inherited_id_evidence"],
        }
        manifest_count_failures = {k: {"expected": v, "observed": manifest.get("counts", {}).get(k)} for k, v in expected_manifest_counts.items() if manifest.get("counts", {}).get(k) != v}
        checks["manifest_counts"] = {"failures": manifest_count_failures, "pass": not manifest_count_failures}
        if manifest_count_failures:
            errors.append("manifest count mismatch")

        manifest_hash_failures: list[str] = []
        file_groups = manifest.get("files", {})
        for group in ("hubParts", "sourceRoutingParts", "inheritedEvidenceParts"):
            for spec in file_groups.get(group, []):
                name = spec["file"]
                if name not in actual_names or _digest(zf.read(name)) != spec["sha256"] or len(zf.read(name)) != spec["bytes"]:
                    manifest_hash_failures.append(name)
        for group in ("qa", "summary"):
            spec = file_groups.get(group, {})
            if spec:
                name = spec["file"]
                if name not in actual_names or _digest(zf.read(name)) != spec["sha256"]:
                    manifest_hash_failures.append(name)
        checks["manifest_file_hashes"] = {"failures": sorted(set(manifest_hash_failures)), "pass": not manifest_hash_failures}
        if manifest_hash_failures:
            errors.append("manifest file hash mismatch")

        qa_required_zero = ["RC2_VALUES_CHANGED", "RC2_ROWS_LOST", "SOURCE_ATTRIBUTE_LOSS", "TAXON_WORK_KEY_DUPLICATES", "ACTIVE_ID_DUPLICATES", "TEMP_ID_REUSE", "PARENT_ID_INHERITANCE", "RANK_COLLAPSE", "HYBRID_COLLAPSE", "SILENT_NAME_REPLACEMENT", "UNRESOLVED_EXCLUDED", "CONFLICT_EXCLUDED"]
        qa_failures = {k: qa.get(k) for k in qa_required_zero if qa.get(k) != 0}
        if qa.get("RIOJA_SOURCE_ROWS_EXPECTED") != expected_counts["source_rows"] or qa.get("RIOJA_SOURCE_ROWS_PRESERVED") != expected_counts["source_rows"]:
            qa_failures["RIOJA_SOURCE_ROWS"] = [qa.get("RIOJA_SOURCE_ROWS_EXPECTED"), qa.get("RIOJA_SOURCE_ROWS_PRESERVED")]
        if qa.get("QA_FINAL") != "PASS":
            qa_failures["QA_FINAL"] = qa.get("QA_FINAL")
        checks["qa_final"] = {"failures": qa_failures, "pass": not qa_failures}
        if qa_failures:
            errors.append("QA_FINAL invariant failure")

    return ValidationResult(
        status="PASS" if not errors else "FAIL",
        source_sha256=source_sha,
        release_id=release_id,
        counts=counts,
        checks=checks,
        errors=tuple(errors),
    )
