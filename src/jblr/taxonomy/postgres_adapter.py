from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any
import json

from .staging_prewrite import EXPECTED_PACKET02_COUNTS, ACCEPTED_NAME_OVERLAP_CANDIDATES

@dataclass(frozen=True)
class PhysicalRule:
    prepared_entity: str
    first_boundary: str
    final_table: str | None
    resource_type: str | None
    disposition: str
    guard: str


PHYSICAL_RULES = (
    PhysicalRule("taxon_concepts", "migration_staging.raw_record", "taxonomy.taxon_concept", "TXC", "MINT_NEW_RESOURCE_AFTER_GATE_EXCEPT_COLLISIONS", "uuidv7 at DML time; jblr_code NULL; never reuse by name"),
    PhysicalRule("taxonomic_names", "migration_staging.raw_record", "taxonomy.taxonomic_name", "NAM", "MINT_NEW_RESOURCE_AFTER_GATE_EXCEPT_COLLISIONS", "verbatim name only; no parsing/identity inference"),
    PhysicalRule("source_records", "migration_staging.raw_record", None, None, "STAGING_ONLY_DEFERRED", "source record != taxon identity; no external_source invented"),
    PhysicalRule("identifications", "migration_staging.raw_record", "taxonomy.identification", "IDN", "DEFERRED", "target_resource_id unavailable without source-record resource mapping"),
    PhysicalRule("operational_identifiers", "migration_staging.raw_record", None, None, "STAGING_ONLY_NEVER_CORE_CODE", "ID_TAXON_JBLR/TWK identifiers never become core.resource.jblr_code"),
    PhysicalRule("external_id_mappings", "migration_staging.raw_record", "taxonomy.external_taxon_reference", "ETR", "DEFERRED", "requires accepted evidence.external_source; no fresh harvest"),
    PhysicalRule("external_id_conflicts", "migration_staging.raw_record", None, None, "QUARANTINE", "explicit conflict is never overwritten"),
    PhysicalRule("unknown_external_ids", "migration_staging.raw_record", None, None, "STAGING_ONLY_UNKNOWN", "UNKNOWN != ABSENCE"),
    PhysicalRule("history_records", "migration_staging.raw_record", None, None, "STAGING_ONLY_DEFERRED", "do not misuse governance.record_revision as release history"),
    PhysicalRule("aliases", "migration_staging.raw_record", None, None, "FRAMEWORK_ZERO_ROWS", "zero != external absence"),
    PhysicalRule("supersessions", "migration_staging.raw_record", None, None, "FRAMEWORK_ZERO_ROWS", "cycles forbidden; zero != external absence"),
)


def physical_mapping_matrix() -> list[dict[str, Any]]:
    rows = []
    for r in PHYSICAL_RULES:
        row = r.__dict__.copy()
        row["prepared_count"] = EXPECTED_PACKET02_COUNTS[r.prepared_entity]
        rows.append(row)
    return rows


def source_identity(entity: str, row: dict[str, Any]) -> tuple[str, str, str]:
    # Stable source identity for migration_staging. It is intentionally not a physical UUID.
    key_fields = {
        "taxon_concepts": "taxon_concept_id",
        "taxonomic_names": "taxonomic_name_id",
        "source_records": "source_record_id",
        "identifications": "identification_id",
        "operational_identifiers": "external_identifier_id",
        "external_id_mappings": "mapping_id",
        "external_id_conflicts": "conflict_id",
        "unknown_external_ids": "unknown_id",
        "history_records": "history_id",
        "aliases": "alias_id",
        "supersessions": "relation_id",
    }
    if entity not in key_fields:
        raise ValueError(f"unsupported prepared entity: {entity}")
    key = str(row[key_fields[entity]])
    return "JBLR_L1", "JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3:L1_PACKET_02", f"{entity}:{key}"


def row_fingerprint(row: dict[str, Any]) -> str:
    data=(json.dumps(row, sort_keys=True, ensure_ascii=False, separators=(",", ":"))+"\n").encode()
    return sha256(data).hexdigest()


def classify_prepared_row(entity: str, row: dict[str, Any]) -> str:
    candidate_ids = set(ACCEPTED_NAME_OVERLAP_CANDIDATES.values())
    if entity == "taxon_concepts" and row.get("taxon_concept_id") in candidate_ids:
        return "QUARANTINE_NAME_OVERLAP"
    if entity == "taxonomic_names" and row.get("taxon_concept_id") in candidate_ids:
        return "QUARANTINE_NAME_OVERLAP"
    if entity == "external_id_conflicts":
        return "QUARANTINE_EXPLICIT_CONFLICT"
    if entity in {"source_records", "operational_identifiers", "unknown_external_ids", "history_records", "aliases", "supersessions"}:
        return "STAGING_ONLY"
    if entity in {"identifications", "external_id_mappings"}:
        return "DEFERRED_RELATION"
    return "READY_NEW_RESOURCE"


def assert_physical_code_boundary(entity: str, row: dict[str, Any], requested_jblr_code: str | None = None) -> None:
    if requested_jblr_code is not None:
        raise ValueError("prewrite/future adapter must pass jblr_code=NULL and use deployed code trigger")
    for key in ("taxon_concept_id", "subject_id", "value"):
        value = str(row.get(key) or "")
        if value.startswith("TWK-") or value.startswith("ID_TAXON_JBLR_"):
            # These values are valid source identifiers but are forbidden as physical codes.
            continue
    if entity == "operational_identifiers" and str(row.get("scheme")) == "JBLR_OPERATIONAL_ID":
        if str(row.get("value", "")).startswith("JBLR-"):
            raise ValueError("operational identifier illegally resembles a physical JBLR code")


def build_prewrite_intents(entities: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    rules={r.prepared_entity:r for r in PHYSICAL_RULES}
    intents=[]
    for entity in sorted(entities):
        if entity not in rules:
            raise ValueError(f"missing physical rule for {entity}")
        rule=rules[entity]
        for row in entities[entity]:
            system,dataset,key=source_identity(entity,row)
            disposition=classify_prepared_row(entity,row)
            intent={
                "source_system":system,
                "source_dataset":dataset,
                "source_record_key":key,
                "source_record_fingerprint":row_fingerprint(row),
                "prepared_entity":entity,
                "disposition":disposition,
                "final_table":rule.final_table,
                "resource_type":rule.resource_type,
                "target_resource_id":None,
                "requested_jblr_code":None,
            }
            if disposition == "READY_NEW_RESOURCE":
                assert_physical_code_boundary(entity,row,None)
            intents.append(intent)
    intents.sort(key=lambda x:(x["source_system"],x["source_dataset"],x["source_record_key"]))
    keys=[(x["source_system"],x["source_dataset"],x["source_record_key"]) for x in intents]
    if len(keys)!=len(set(keys)):
        raise ValueError("duplicate migration_staging source identity")
    return intents


def reconcile_prewrite_intents(first: list[dict[str, Any]], second: list[dict[str, Any]]) -> dict[str, Any]:
    a={(x["source_system"],x["source_dataset"],x["source_record_key"]):x for x in first}
    b={(x["source_system"],x["source_dataset"],x["source_record_key"]):x for x in second}
    missing=sorted(set(a)-set(b)); extra=sorted(set(b)-set(a)); changed=[]
    for key in sorted(set(a)&set(b)):
        if a[key] != b[key]: changed.append(key)
    return {
        "pass": not missing and not extra and not changed,
        "first_count":len(first),
        "second_count":len(second),
        "missing":missing,
        "extra":extra,
        "changed":changed,
    }


def transaction_plan() -> list[dict[str, Any]]:
    return [
        {"step": 1, "mode": "READ_ONLY_PREFLIGHT", "action": "Recheck exact source/package hashes, exact live collision snapshot, empty/expected migration_staging state, and executive DML gate."},
        {"step": 2, "mode": "FUTURE_DML_GATE_ONLY", "action": "BEGIN ISOLATION LEVEL SERIALIZABLE; no statement from this phase is executed by L1.08_PREWRITE."},
        {"step": 3, "mode": "FUTURE_DML_GATE_ONLY", "action": "Register exact accepted Packet02 package as migration_staging.source_file and trace an import_run/governance batch."},
        {"step": 4, "mode": "FUTURE_DML_GATE_ONLY", "action": "Insert all 25,927 prepared rows into migration_staging.raw_record with deterministic source identity/fingerprint; collisions use needs_review."},
        {"step": 5, "mode": "FUTURE_DML_GATE_ONLY", "action": "For clear TXC/NAM only, call uuidv7() for core.resource.resource_id and pass jblr_code NULL; deployed trigger issues physical JBLR code."},
        {"step": 6, "mode": "FUTURE_DML_GATE_ONLY", "action": "Never target a pre-existing live resource solely because names overlap. Quarantine the 3 candidate concepts and 6 candidate name rows."},
        {"step": 7, "mode": "FUTURE_DML_GATE_ONLY", "action": "Register source_map only for newly materialized resources. register_source_mapping must reject any remap."},
        {"step": 8, "mode": "FUTURE_DML_GATE_ONLY", "action": "Reconcile counts, source fingerprints, resource types, and second-run idempotency before commit."},
        {"step": 9, "mode": "ROLLBACK_CONDITION", "action": "ROLLBACK on source hash drift, live snapshot drift, new collision, semantic gap, duplicate/remap, count mismatch, code-policy violation, or provenance loss."},
        {"step": 10, "mode": "FUTURE_EXECUTIVE_GATE_ONLY", "action": "COMMIT only after 00000 authorizes first STAGING DML and all reconciliation checks pass."},
    ]
