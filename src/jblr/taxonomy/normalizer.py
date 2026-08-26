from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import zipfile

from .import_model import (
    RC3_RELEASE_ID, RC3_SHA256, EXPECTED_COUNTS, ENTITY_KEYS, PreparedLoad,
    digest, provenance, read_parts, rows_fingerprint, semantic_external_conflicts,
    sorted_rows, stable_id, validate_history_relations,
)


def normalize_rc3(source_zip: str | Path, expected_sha256: str = RC3_SHA256) -> PreparedLoad:
    source_zip = Path(source_zip); source_sha = digest(source_zip.read_bytes())
    if source_sha != expected_sha256: raise ValueError("RC3 SHA-256 mismatch")
    with zipfile.ZipFile(source_zip) as zf:
        manifest = json.loads(zf.read("MANIFEST.json"))
        if manifest.get("releaseId") != RC3_RELEASE_ID: raise ValueError("RC3 release ID mismatch")
        hub_rows = read_parts(zf, "TAXON_HUBS_3033_part")
        route_rows = read_parts(zf, "RIOJA_SOURCE_ROUTING_2262_part")
        evidence_rows = read_parts(zf, "INHERITED_ID_EVIDENCE_1405_part")
    if (len(hub_rows), len(route_rows), len(evidence_rows)) != (EXPECTED_COUNTS["taxon_hubs"], EXPECTED_COUNTS["source_records"], EXPECTED_COUNTS["inherited_id_evidence"]):
        raise ValueError("unexpected RC3 row counts")

    hubs = [row for _, _, row in hub_rows]
    concept_ids = {str(row["taxon_identity_hub_key"]) for row in hubs}
    if len(concept_ids) != len(hubs): raise ValueError("duplicate taxon identity")
    if any(row["taxon_work_key"] != row["taxon_identity_hub_key"] for row in hubs): raise ValueError("identity collapse guard failure")
    by_successor = {str(row["successor_release_row_id"]): str(row["taxon_identity_hub_key"]) for row in hubs}
    by_predecessor = {str(row["predecessor_release_row_id"]): str(row["taxon_identity_hub_key"]) for row in hubs if row.get("predecessor_release_row_id")}
    entities: dict[str, list[dict[str, Any]]] = {name: [] for name in ENTITY_KEYS}

    for source_file, lineno, hub in hub_rows:
        concept_id = str(hub["taxon_identity_hub_key"]); pointer = f"{RC3_RELEASE_ID}/{source_file}#L{lineno}"
        prov = provenance("RC3_TAXON_HUB", pointer, str(hub["successor_release_row_id"]))
        entities["taxon_concepts"].append({"taxon_concept_id": concept_id, "source_release_id": RC3_RELEASE_ID, "source_release_row_id": str(hub["successor_release_row_id"]), "display_name": str(hub["hub_display_name"]), "display_name_state": str(hub["hub_display_name_state"]), "provisional": hub["hub_origin"] == "NEW_TEMP", "provenance": prov})
        entities["taxonomic_names"].append({"taxonomic_name_id": f"TNAME:DISPLAY:{concept_id}", "name_verbatim": str(hub["hub_display_name"]), "relationship_to_concept": "DISPLAY", "taxon_concept_id": concept_id, "validation_state": "REFERENCE", "provenance": prov})
        entities["operational_identifiers"].append({"external_identifier_id": f"OPID:JBLR:{concept_id}", "scheme": "JBLR_OPERATIONAL_ID", "value": str(hub["ID_TAXON_JBLR"]), "subject_type": "TAXON_CONCEPT", "subject_id": concept_id, "provenance": prov})
        if hub.get("ID_TAXON_GOBIERNO"):
            entities["external_id_mappings"].append({"mapping_id": stable_id("XMAP", "HUB_GOBIERNO", concept_id, str(hub["ID_TAXON_GOBIERNO"]), pointer), "scheme": "MITECO_OFFICIAL_ID", "value": str(hub["ID_TAXON_GOBIERNO"]), "taxon_concept_id": concept_id, "source_record_id": None, "status": "REFERENCE", "evidence_classification": "RC3_HUB_ID_TAXON_GOBIERNO", "provenance": prov})
        else:
            entities["unknown_external_ids"].append({"unknown_id": f"UNKNOWN:MITECO:{concept_id}", "scheme": "MITECO_OFFICIAL_ID", "taxon_concept_id": concept_id, "source_record_id": None, "status": "UNKNOWN", "reason": "ID_TAXON_GOBIERNO_EMPTY_IN_RC3", "provenance": prov})
        predecessor = str(hub.get("predecessor_release_row_id") or "") or None
        entities["history_records"].append({"history_id": f"HISTORY:{RC3_RELEASE_ID}:{hub['successor_release_row_id']}", "taxon_concept_id": concept_id, "release_id": RC3_RELEASE_ID, "release_row_id": str(hub["successor_release_row_id"]), "predecessor_release_row_id": predecessor, "history_event": "INHERITED_FROM_RC2" if predecessor else "CREATED_IN_RC3", "operational_id": str(hub["ID_TAXON_JBLR"]), "previous_operational_ids": list(hub.get("PREVIOUS_ID_TAXON_JBLR") or []), "display_name": str(hub["hub_display_name"]), "display_name_state": str(hub["hub_display_name_state"]), "provenance": prov})
        for old_id in hub.get("PREVIOUS_ID_TAXON_JBLR") or []:
            if old_id:
                entities["aliases"].append({"alias_id": stable_id("ALIAS", "HISTORICAL_INTERNAL_ID", str(old_id), concept_id), "alias_value": str(old_id), "alias_type": "HISTORICAL_INTERNAL_ID", "target_taxon_concept_id": concept_id, "provenance": prov})

    for source_file, lineno, route in route_rows:
        successor = str(route["successor_release_row_id"]); concept_id = by_successor.get(successor)
        if concept_id is None or concept_id != str(route["taxon_work_key"]): raise ValueError("broken source-to-concept route")
        source_record_id = str(route["source_record_key"]); pointer = f"{RC3_RELEASE_ID}/{source_file}#L{lineno}"
        prov = provenance("RC3_RIOJA_SOURCE_ROUTING", pointer, str(route["raw_row_sha256"]))
        entities["source_records"].append({"source_record_id": source_record_id, "source_name_verbatim": str(route["source_name_verbatim"]), "taxon_concept_id": concept_id, "raw_record_hash": str(route["raw_row_sha256"]), "source_snapshot_sha256": str(route["source_snapshot_sha256"]), "raw_payload": route, "provenance": prov})
        entities["taxonomic_names"].append({"taxonomic_name_id": stable_id("TNAME:SOURCE", source_record_id), "name_verbatim": str(route["source_name_verbatim"]), "relationship_to_concept": "VERBATIM_SOURCE", "taxon_concept_id": concept_id, "validation_state": "REFERENCE", "provenance": prov})
        entities["identifications"].append({"identification_id": stable_id("IDENT", source_record_id, concept_id), "subject_record_id": source_record_id, "taxon_concept_id": concept_id, "status": "REFERENCE", "identity_route": str(route["identity_route"]), "identity_route_reason": str(route["identity_route_reason"]), "classification_v3": str(route["classification_v3"]), "provenance": prov})
        entities["external_id_mappings"].append({"mapping_id": stable_id("XMAP", "RIOJA", source_record_id, str(route["rioja_id"]), concept_id), "scheme": "RIOJA_SOURCE_ID", "value": str(route["rioja_id"]), "taxon_concept_id": concept_id, "source_record_id": source_record_id, "status": "REFERENCE", "evidence_classification": str(route["identity_route_reason"]), "provenance": prov})
        actor_category = str(route.get("actor06_final_category") or ""); actor_selected = str(route.get("actor06_selected_official_id") or ""); actor_pointer = str(route.get("actor06_evidence_pointer") or "")
        if actor_category == "RESOLVED":
            if not actor_selected: raise ValueError("ACTOR06 RESOLVED without selected official ID")
            entities["external_id_mappings"].append({"mapping_id": stable_id("XMAP", "ACTOR06", source_record_id, actor_selected, concept_id), "scheme": "MITECO_OFFICIAL_ID", "value": actor_selected, "taxon_concept_id": concept_id, "source_record_id": source_record_id, "status": "REFERENCE", "evidence_classification": "ACTOR06_RESOLVED", "provenance": provenance("RC3_ACTOR06_RESOLUTION", pointer, actor_pointer or None)})
        elif actor_category == "UNRESOLVED":
            entities["unknown_external_ids"].append({"unknown_id": stable_id("UNKNOWN:ACTOR06", source_record_id), "scheme": "MITECO_OFFICIAL_ID", "taxon_concept_id": concept_id, "source_record_id": source_record_id, "status": "UNKNOWN", "reason": "ACTOR06_UNRESOLVED", "provenance": provenance("RC3_ACTOR06_UNRESOLVED", pointer, actor_pointer or None)})
        elif actor_category == "CONFLICT":
            entities["external_id_conflicts"].append({"conflict_id": stable_id("XCONFLICT", source_record_id), "scheme": "MITECO_OFFICIAL_ID", "taxon_concept_id": concept_id, "source_record_id": source_record_id, "status": "CONFLICT", "resolution": None, "provenance": provenance("RC3_ACTOR06_CONFLICT", pointer, actor_pointer or None)})

    for source_file, lineno, ev in evidence_rows:
        predecessor = str(ev["predecessor_release_row_id"]); concept_id = by_predecessor.get(predecessor)
        if concept_id is None: raise ValueError("inherited ID evidence has no exact predecessor mapping")
        pointer = f"{RC3_RELEASE_ID}/{source_file}#L{lineno}"
        entities["external_id_mappings"].append({"mapping_id": stable_id("XMAP", "INHERITED", predecessor, str(ev["rioja_id"]), str(ev["official_id"]), concept_id), "scheme": "MITECO_OFFICIAL_ID", "value": str(ev["official_id"]), "taxon_concept_id": concept_id, "source_record_id": None, "status": "REFERENCE", "evidence_classification": str(ev["integration_promotion_state"]), "provenance": provenance("RC3_INHERITED_ID_EVIDENCE", pointer, predecessor)})

    entities["supersessions"] = []
    for name in list(entities): entities[name] = sorted_rows(name, entities[name])
    validate_history_relations(concept_ids, entities["aliases"], entities["supersessions"])
    semantic_count, conflicts = semantic_external_conflicts(entities["external_id_mappings"])
    if conflicts: raise ValueError(f"external identifier conflict: {conflicts[:3]}")
    counts = {name: len(rows) for name, rows in entities.items()}; fingerprints = {name: rows_fingerprint(rows) for name, rows in entities.items()}
    return PreparedLoad(source_sha, entities, counts, fingerprints, semantic_count, len(conflicts))
