from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import zipfile

from .import_model import (
    RC3_RELEASE_ID, RC3_SHA256, FIXED_DATE, PreparedLoad, UpsertResult,
    canonical_json, digest, simulate_upsert, validate_history_relations,
    rows_fingerprint as _rows_fingerprint,
    semantic_external_conflicts as _semantic_external_conflicts,
)
from .normalizer import normalize_rc3


def dry_run(source_zip: str | Path, expected_sha256: str = RC3_SHA256) -> dict[str, Any]:
    before = digest(Path(source_zip).read_bytes()); prepared = normalize_rc3(source_zip, expected_sha256)
    first = simulate_upsert(prepared); second = simulate_upsert(prepared, first.state); after = digest(Path(source_zip).read_bytes())
    all_unchanged = all(second.unchanged[name] == prepared.counts[name] for name in prepared.counts)
    no_inserts = all(value == 0 for value in second.inserted.values())
    result = {
        "schema": "JBLR_L1_PACKET_02_DRY_RUN_EVIDENCE_V1", "packet": "L1_PACKET_02",
        "source_release_id": RC3_RELEASE_ID, "source_sha256_before": before, "source_sha256_after": after,
        "source_byte_immutable": before == after == expected_sha256, "counts": prepared.counts,
        "fingerprints": prepared.fingerprints, "dataset_sha256": prepared.dataset_sha256,
        "external_id_mapping_evidence_rows": prepared.counts["external_id_mappings"],
        "external_id_mapping_semantic_unique": prepared.semantic_external_mapping_count,
        "external_id_mapping_conflicts": prepared.semantic_external_mapping_conflicts,
        "actor06_explicit_conflicts": prepared.counts["external_id_conflicts"],
        "unknown_external_ids": prepared.counts["unknown_external_ids"], "history_records": prepared.counts["history_records"],
        "aliases_asserted": prepared.counts["aliases"], "supersessions_asserted": prepared.counts["supersessions"],
        "first_simulated_upsert": {"inserted": first.inserted, "state_sha256": first.state_sha256},
        "second_simulated_upsert": {"inserted": second.inserted, "unchanged": second.unchanged, "state_sha256": second.state_sha256},
        "idempotency": {"pass": no_inserts and all_unchanged and first.state_sha256 == second.state_sha256, "same_state_sha256": first.state_sha256 == second.state_sha256, "second_run_inserts_zero": no_inserts, "second_run_all_rows_unchanged": all_unchanged},
        "writes": {"dev_data_writes": 0, "staging_data_writes": 0, "production_writes": 0, "neon_data_writes": 0, "migrations": 0},
    }
    if not result["source_byte_immutable"] or not result["idempotency"]["pass"]: raise ValueError("dry-run invariant failure")
    return result


def _write(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=FIXED_DATE); info.compress_type = zipfile.ZIP_DEFLATED; info.create_system = 3; info.external_attr = 0o100644 << 16; zf.writestr(info, data)


def build_dry_run_package(source_zip: str | Path, output_zip: str | Path, expected_sha256: str = RC3_SHA256) -> dict[str, Any]:
    prepared = normalize_rc3(source_zip, expected_sha256); evidence = dry_run(source_zip, expected_sha256); payloads: dict[str, bytes] = {}
    for name, rows in prepared.entities.items(): payloads[f"prepared/{name}.jsonl"] = b"".join(canonical_json(row) for row in rows)
    payloads["DRY_RUN_EVIDENCE.json"] = (json.dumps(evidence, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
    manifest = {"schema": "JBLR_L1_PACKET_02_DRY_RUN_PACKAGE_MANIFEST_V1", "packet": "L1_PACKET_02", "source_release_id": RC3_RELEASE_ID, "source_sha256": prepared.source_sha256, "dataset_sha256": prepared.dataset_sha256, "counts": prepared.counts, "files": {name: {"bytes": len(data), "sha256": digest(data)} for name, data in sorted(payloads.items())}, "build": {"entry_order": "lexicographic", "entry_timestamp": "1980-01-01T00:00:00Z", "compression": "ZIP_DEFLATED"}, "write_boundary": {"staging": 0, "production": 0, "neon": 0, "migrations": 0}}
    payloads["MANIFEST.json"] = (json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode(); output_zip = Path(output_zip); output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w") as zf:
        for name in sorted(payloads): _write(zf, name, payloads[name])
    return {**manifest, "output_sha256": digest(output_zip.read_bytes()), "output_bytes": output_zip.stat().st_size}


__all__ = ["PreparedLoad", "UpsertResult", "normalize_rc3", "simulate_upsert", "validate_history_relations", "dry_run", "build_dry_run_package", "_rows_fingerprint", "_semantic_external_conflicts"]
