from __future__ import annotations

from dataclasses import dataclass, asdict
from hashlib import sha256
from pathlib import Path
from typing import Any
import json
import zipfile

PACKET02_SHA256 = "4f433be676851833d5e609da6ea9891a4bf4fc9ca22eeb0d187b954f72625ae4"
RC3_SHA256 = "d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71"
EXPECTED_PACKET02_COUNTS = {
    "taxon_concepts": 3033,
    "taxonomic_names": 5295,
    "source_records": 2262,
    "identifications": 2262,
    "operational_identifiers": 3033,
    "external_id_mappings": 4276,
    "external_id_conflicts": 48,
    "unknown_external_ids": 2685,
    "history_records": 3033,
    "aliases": 0,
    "supersessions": 0,
}

# These are collision-review candidates, not identity mappings. They originate from the
# accepted 00000 prewrite event and exact RC3 prepared rows. They MUST NOT target the
# listed live UUIDs automatically.
ACCEPTED_NAME_OVERLAP_CANDIDATES = {
    "Plantago major": "TWK-b4e6c8ce0b3698aca6950bd7",
    "Papaver rhoeas": "TWK-25de774fbf529a9dce497745",
    "Artemisia herba-alba": "TWK-7a89d9240a4dd39dcd67c0b9",
}

DIRECT_REVIEW_LIVE_IDS = {
    # TXC
    "01a009e0-2f68-7881-a991-0fd47ae3f2a8": "TWK-b4e6c8ce0b3698aca6950bd7",
    "01a009e0-2f86-76c4-8fe7-3bb55a729575": "TWK-25de774fbf529a9dce497745",
    "01a00f50-dbb8-789f-89be-efde65ca64ea": "TWK-7a89d9240a4dd39dcd67c0b9",
    # NAM
    "01a009e0-2f75-72d3-ba87-6410ab2c3268": "TWK-b4e6c8ce0b3698aca6950bd7",
    "01a009e0-2f86-7f75-84dd-69d7e6e072ce": "TWK-25de774fbf529a9dce497745",
    "01a00f50-db22-7d44-91d8-57b0ee4c44ce": "TWK-7a89d9240a4dd39dcd67c0b9",
}

DEPENDENCY_REVIEW_LIVE_IDS = {
    # Plantago / Papaver name usages
    "01a009e0-2f7c-753b-99bd-a316b1c673b6",
    "01a009e0-2f87-761f-b39f-577a5496a7fe",
    # Plantago / Artemisia identifications
    "01a00a00-191b-797b-88a2-17a57bcc53fa",
    "01a00f50-dd7a-766b-9ac1-a7a690ed048d",
    # Plantago external reference + regional assertion
    "01a00e58-ce35-7feb-b996-3f36766797b9",
    "01a00cd2-04ef-706a-9e14-2d47c9de0a18",
}

@dataclass(frozen=True)
class CollisionLedgerEntry:
    live_object_type: str
    live_object_key: str
    classification: str
    live_label: str | None
    linked_live_resource_ids: tuple[str, ...]
    rc3_candidate_taxon_concept_id: str | None
    action: str
    reason: str


def _sha256(data: bytes) -> str:
    return sha256(data).hexdigest()


def canonical_json(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def read_packet02(path: str | Path) -> dict[str, list[dict[str, Any]]]:
    p = Path(path)
    observed = _sha256(p.read_bytes())
    if observed != PACKET02_SHA256:
        raise ValueError(f"Packet02 SHA mismatch: {observed}")
    with zipfile.ZipFile(p) as zf:
        manifest = json.loads(zf.read("MANIFEST.json"))
        if manifest.get("source_sha256") != RC3_SHA256:
            raise ValueError("embedded RC3 SHA mismatch")
        entities: dict[str, list[dict[str, Any]]] = {}
        for name, expected in EXPECTED_PACKET02_COUNTS.items():
            member = f"prepared/{name}.jsonl"
            rows = [json.loads(line) for line in zf.read(member).decode("utf-8").splitlines() if line.strip()]
            if len(rows) != expected:
                raise ValueError(f"{name} count mismatch: {len(rows)} != {expected}")
            entities[name] = rows
    return entities


def packet02_fingerprint(entities: dict[str, list[dict[str, Any]]]) -> str:
    payload = {name: [_sha256(canonical_json(row)) for row in rows] for name, rows in sorted(entities.items())}
    return _sha256(canonical_json(payload))


def load_live_snapshot(path: str | Path) -> dict[str, Any]:
    obj = json.loads(Path(path).read_text(encoding="utf-8"))
    if obj.get("snapshot_schema") != "JBLR_L1_08_PREWRITE_STAGING_TAXONOMY_SNAPSHOT_V1":
        raise ValueError("unexpected staging snapshot schema")
    return obj


def _entry(
    object_type: str,
    key: str,
    classification: str,
    label: str | None,
    linked: list[str] | tuple[str, ...] = (),
    candidate: str | None = None,
    action: str = "PRESERVE",
    reason: str = "",
) -> CollisionLedgerEntry:
    return CollisionLedgerEntry(object_type, key, classification, label, tuple(sorted(str(x) for x in linked if x)), candidate, action, reason)


def build_collision_ledger(snapshot: dict[str, Any]) -> list[CollisionLedgerEntry]:
    entries: list[CollisionLedgerEntry] = []

    # taxonomy.term is not a core.resource identity. It is still part of the complete
    # pre-existing taxonomy state and must be accounted for.
    for row in snapshot.get("terms", []):
        entries.append(_entry(
            "taxonomy.term", row["term_key"], "REFERENCE_TERM_NO_RC3_IDENTITY", row.get("label"),
            action="REUSE_REFERENCE_TERM_IF_EXPLICITLY_NEEDED",
            reason="Existing rank vocabulary; not a taxon identity and not a collision candidate.",
        ))

    def direct_or_clear(object_type: str, row: dict[str, Any], label_field: str) -> None:
        rid = str(row["resource_id"]); candidate = DIRECT_REVIEW_LIVE_IDS.get(rid)
        if candidate:
            entries.append(_entry(
                object_type, rid, "NAME_OVERLAP_ONLY_REVIEW_REQUIRED", row.get(label_field),
                candidate=candidate,
                action="QUARANTINE_DO_NOT_REUSE_UUID_OR_JBLR_CODE",
                reason="Accepted prewrite event identifies a nominal overlap. NAME != IDENTITY; no automatic merge is permitted.",
            ))
        else:
            entries.append(_entry(
                object_type, rid, "NO_RC3_COLLISION", row.get(label_field),
                action="PRESERVE_EXISTING_OBJECT_UNCHANGED",
                reason="No accepted RC3 collision evidence for this live object.",
            ))

    for row in snapshot.get("taxon_concepts", []):
        direct_or_clear("taxonomy.taxon_concept", row, "concept_label")
    for row in snapshot.get("taxonomic_names", []):
        direct_or_clear("taxonomy.taxonomic_name", row, "scientific_name")

    dependent_specs = [
        ("name_usages", "taxonomy.name_usage", "verbatim_name", ("taxon_concept_id", "taxonomic_name_id", "treatment_resource_id")),
        ("identifications", "taxonomy.identification", "verbatim_identification", ("target_resource_id", "taxon_concept_id", "taxonomic_name_id")),
        ("external_taxon_references", "taxonomy.external_taxon_reference", "external_id", ("taxon_concept_id", "taxonomic_name_id", "external_source_id")),
        ("regional_taxon_assertions", "taxonomy.regional_taxon_assertion", "presence_value_status", ("taxon_concept_id", "geographic_area_id", "source_resource_id")),
    ]
    for bucket, object_type, label_field, link_fields in dependent_specs:
        for row in snapshot.get(bucket, []):
            rid = str(row["resource_id"])
            linked = [str(row.get(f)) for f in link_fields if row.get(f)]
            if rid in DEPENDENCY_REVIEW_LIVE_IDS:
                candidate_ids = {DIRECT_REVIEW_LIVE_IDS[x] for x in linked if x in DIRECT_REVIEW_LIVE_IDS}
                candidate = sorted(candidate_ids)[0] if len(candidate_ids) == 1 else None
                entries.append(_entry(
                    object_type, rid, "DEPENDENCY_ON_NAME_OVERLAP_REVIEW_REQUIRED", row.get(label_field), linked,
                    candidate=candidate,
                    action="PRESERVE_AND_QUARANTINE_DEPENDENCY",
                    reason="This live object depends on a live concept/name that has a nominal RC3 overlap; dependency cannot authorize identity reuse.",
                ))
            else:
                entries.append(_entry(
                    object_type, rid, "NO_RC3_COLLISION", row.get(label_field), linked,
                    action="PRESERVE_EXISTING_OBJECT_UNCHANGED",
                    reason="No accepted RC3 collision evidence for this live object or its identity dependency.",
                ))

    keys = [(e.live_object_type, e.live_object_key) for e in entries]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate live object in collision ledger")
    expected = 23
    if len(entries) != expected:
        raise ValueError(f"collision ledger incomplete: {len(entries)} != {expected}")
    return sorted(entries, key=lambda e: (e.live_object_type, e.live_object_key))


def collision_summary(entries: list[CollisionLedgerEntry]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in entries:
        out[e.classification] = out.get(e.classification, 0) + 1
    return dict(sorted(out.items()))


def rc3_collision_candidates(entities: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    concepts = {r["taxon_concept_id"]: r for r in entities["taxon_concepts"]}
    names_by_concept: dict[str, list[dict[str, Any]]] = {}
    for row in entities["taxonomic_names"]:
        names_by_concept.setdefault(row["taxon_concept_id"], []).append(row)
    results = []
    for name, cid in sorted(ACCEPTED_NAME_OVERLAP_CANDIDATES.items()):
        if cid not in concepts:
            raise ValueError(f"accepted collision candidate missing from Packet02: {cid}")
        if concepts[cid]["display_name"] != name:
            raise ValueError(f"collision candidate display name drift for {cid}")
        results.append({
            "candidate_name": name,
            "rc3_taxon_concept_id": cid,
            "rc3_source_release_row_id": concepts[cid]["source_release_row_id"],
            "rc3_provisional": concepts[cid]["provisional"],
            "prepared_name_rows": len(names_by_concept.get(cid, [])),
            "classification": "NAME_OVERLAP_ONLY_REVIEW_REQUIRED",
            "identity_merge_authorized": False,
        })
    return {
        "total_rc3_concepts": len(concepts),
        "candidate_concepts": len(results),
        "non_candidate_concepts": len(concepts) - len(results),
        "candidate_name_rows": sum(x["prepared_name_rows"] for x in results),
        "candidates": results,
    }


def assert_no_operational_id_promoted(entities: dict[str, list[dict[str, Any]]]) -> None:
    for row in entities["operational_identifiers"]:
        value = str(row["value"])
        if value.startswith("JBLR-"):
            raise ValueError("Packet02 operational ID looks like a physical JBLR code")
        if str(row["subject_id"]).startswith("JBLR-"):
            raise ValueError("RC3 taxon identity has been replaced by a physical JBLR code")


def evidence_document(packet02_path: str | Path, snapshot_path: str | Path) -> dict[str, Any]:
    entities = read_packet02(packet02_path)
    snapshot = load_live_snapshot(snapshot_path)
    ledger = build_collision_ledger(snapshot)
    collision_index = rc3_collision_candidates(entities)
    assert_no_operational_id_promoted(entities)
    total_prepared = sum(len(v) for v in entities.values())
    return {
        "schema": "JBLR_L1_08_PREWRITE_EVIDENCE_V1",
        "source": {
            "packet02_sha256": PACKET02_SHA256,
            "rc3_sha256": RC3_SHA256,
            "packet02_counts": EXPECTED_PACKET02_COUNTS,
            "prepared_total_rows": total_prepared,
            "prepared_fingerprint": packet02_fingerprint(entities),
        },
        "staging": {
            "snapshot_branch_id": snapshot["branch_id"],
            "postgres_version": snapshot["postgres_version"],
            "migration_staging_counts": snapshot["migration_staging_counts"],
            "taxonomy_live_objects_accounted": len(ledger),
            "collision_summary": collision_summary(ledger),
        },
        "collisions": collision_index,
        "future_physical_readiness": {
            "taxon_concepts_new_resource_candidates": 3030,
            "taxon_concepts_quarantined_name_overlap": 3,
            "taxonomic_names_new_resource_candidates": 5289,
            "taxonomic_names_quarantined_name_overlap": 6,
            "name_usage_relations_deferred_missing_rc3_treatment_resource": 5295,
            "all_prepared_rows_first_traceable_boundary": "migration_staging.raw_record",
        },
        "guards": {
            "name_equals_identity": False,
            "reuse_live_uuid_on_name_overlap": False,
            "reuse_live_jblr_code_on_name_overlap": False,
            "rc3_operational_id_to_physical_jblr_code": False,
            "rc3_temp_id_to_physical_jblr_code": False,
            "fresh_external_harvest": False,
            "second_staging_schema": False,
        },
        "writes": {
            "dev_dml": 0,
            "staging_dml": 0,
            "production_writes": 0,
            "migrations": 0,
        },
    }
