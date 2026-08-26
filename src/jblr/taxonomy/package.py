from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import json
import zipfile

from .validator import validate_rc3_release

_FIXED_DATE = (1980, 1, 1, 0, 0, 0)


def _canonical_json(obj: object) -> bytes:
    return (json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def _write(zf: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=_FIXED_DATE)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    zf.writestr(info, data)


def build_l1_package(
    source_zip: str | Path,
    release_contract: str | Path,
    identity_schema: str | Path,
    relation_rules: str | Path,
    output_zip: str | Path,
) -> dict[str, object]:
    source_zip = Path(source_zip)
    release_contract = Path(release_contract)
    identity_schema = Path(identity_schema)
    relation_rules = Path(relation_rules)
    output_zip = Path(output_zip)

    validation = validate_rc3_release(source_zip, release_contract)
    if validation.status != "PASS":
        raise ValueError(f"source validation failed: {validation.errors}")

    payloads = {
        "contracts/identity_schema_v1.json": identity_schema.read_bytes(),
        "contracts/id_alias_supersession_rules_v1.json": relation_rules.read_bytes(),
        "contracts/release_contract_v1.json": release_contract.read_bytes(),
        "relations/ALIASES.jsonl": b"",
        "relations/SUPERSESSIONS.jsonl": b"",
        "source/JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3.zip": source_zip.read_bytes(),
    }
    manifest = {
        "schema": "JBLR_L1_REPRODUCIBLE_PACKAGE_MANIFEST_V1",
        "packet": "L1_PACKET_01",
        "release_id": "JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3",
        "source_sha256": validation.source_sha256,
        "validation_status": validation.status,
        "counts": validation.counts,
        "semantic_guards": {
            "name_is_identity": False,
            "source_record_is_taxon_identity": False,
            "aliases_asserted": 0,
            "supersessions_asserted": 0,
            "staging_writes": 0,
            "production_writes": 0,
        },
        "files": {name: {"sha256": sha256(data).hexdigest(), "bytes": len(data)} for name, data in sorted(payloads.items())},
        "build": {
            "entry_order": "lexicographic",
            "entry_timestamp": "1980-01-01T00:00:00Z",
            "compression": "ZIP_DEFLATED",
        },
    }
    payloads["L1_MANIFEST.json"] = _canonical_json(manifest)

    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_zip, "w") as zf:
        for name in sorted(payloads):
            _write(zf, name, payloads[name])

    result = dict(manifest)
    result["output_sha256"] = sha256(output_zip.read_bytes()).hexdigest()
    result["output_bytes"] = output_zip.stat().st_size
    return result
