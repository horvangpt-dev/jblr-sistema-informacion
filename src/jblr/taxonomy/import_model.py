from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Iterable
import copy
import json
import zipfile

RC3_RELEASE_ID = "JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3"
RC3_SHA256 = "d45b09e8b57dc403d675f6cada9bd4d65b7411fa57063fd7c90df286ed3b3c71"
EXPECTED_COUNTS = {"taxon_hubs": 3033, "source_records": 2262, "inherited_id_evidence": 1405}
FIXED_DATE = (1980, 1, 1, 0, 0, 0)
ENTITY_KEYS = {
    "taxon_concepts": "taxon_concept_id", "taxonomic_names": "taxonomic_name_id",
    "source_records": "source_record_id", "identifications": "identification_id",
    "operational_identifiers": "external_identifier_id", "external_id_mappings": "mapping_id",
    "external_id_conflicts": "conflict_id", "unknown_external_ids": "unknown_id",
    "history_records": "history_id", "aliases": "alias_id", "supersessions": "relation_id",
}

@dataclass(frozen=True)
class PreparedLoad:
    source_sha256: str
    entities: dict[str, list[dict[str, Any]]]
    counts: dict[str, int]
    fingerprints: dict[str, str]
    semantic_external_mapping_count: int
    semantic_external_mapping_conflicts: int

    @property
    def dataset_sha256(self) -> str:
        return digest(canonical_json({name: self.fingerprints[name] for name in sorted(self.fingerprints)}))

@dataclass(frozen=True)
class UpsertResult:
    inserted: dict[str, int]
    unchanged: dict[str, int]
    state_sha256: str
    state: dict[str, dict[str, dict[str, Any]]]

def digest(data: bytes) -> str:
    return sha256(data).hexdigest()

def canonical_json(obj: object) -> bytes:
    return (json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")

def stable_id(prefix: str, *parts: str) -> str:
    return f"{prefix}:{sha256(chr(31).join(parts).encode('utf-8')).hexdigest()[:24]}"

def provenance(source_type: str, source_pointer: str, evidence_pointer: str | None = None) -> dict[str, Any]:
    return {"source_type": source_type, "source_pointer": source_pointer, "evidence_pointer": evidence_pointer, "recorded_at": None}

def read_parts(zf: zipfile.ZipFile, prefix: str) -> list[tuple[str, int, dict[str, Any]]]:
    rows = []
    for name in sorted(n for n in zf.namelist() if n.startswith(prefix) and n.endswith(".jsonl")):
        for lineno, raw in enumerate(zf.read(name).decode("utf-8").splitlines(), 1):
            if raw.strip():
                row = json.loads(raw)
                if not isinstance(row, dict): raise ValueError(f"{name}:{lineno}: expected object")
                rows.append((name, lineno, row))
    return rows

def sorted_rows(name: str, rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    key = ENTITY_KEYS[name]; values = sorted(list(rows), key=lambda row: str(row[key])); keys = [str(row[key]) for row in values]
    if len(keys) != len(set(keys)): raise ValueError(f"duplicate primary key in {name}")
    return values

def rows_fingerprint(rows: list[dict[str, Any]]) -> str:
    return digest(b"".join(canonical_json(row) for row in rows))

def semantic_external_conflicts(rows: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]]:
    mapped: dict[tuple[str, str], set[str]] = {}
    for row in rows: mapped.setdefault((str(row["scheme"]), str(row["value"])), set()).add(str(row["taxon_concept_id"]))
    conflicts = [{"scheme": s, "value": v, "taxon_concept_ids": sorted(ids)} for (s, v), ids in mapped.items() if len(ids) > 1]
    conflicts.sort(key=lambda row: (row["scheme"], row["value"]))
    return len(mapped), conflicts

def _has_cycle(rows: list[dict[str, Any]]) -> bool:
    graph: dict[str, list[str]] = {}
    for row in rows: graph.setdefault(str(row["from_taxon_concept_id"]), []).append(str(row["to_taxon_concept_id"]))
    visiting: set[str] = set(); visited: set[str] = set()
    def visit(node: str) -> bool:
        if node in visiting: return True
        if node in visited: return False
        visiting.add(node)
        for nxt in graph.get(node, []):
            if visit(nxt): return True
        visiting.remove(node); visited.add(node); return False
    return any(visit(node) for node in graph)

def validate_history_relations(concept_ids: set[str], aliases: list[dict[str, Any]], supersessions: list[dict[str, Any]]) -> None:
    for row in aliases:
        if row["target_taxon_concept_id"] not in concept_ids: raise ValueError("alias broken target")
        if not row.get("provenance", {}).get("source_pointer"): raise ValueError("alias missing provenance")
    for row in supersessions:
        src, dst = row["from_taxon_concept_id"], row["to_taxon_concept_id"]
        if src == dst or src not in concept_ids or dst not in concept_ids: raise ValueError("invalid supersession endpoints")
        if not row.get("reason") or not row.get("provenance", {}).get("source_pointer"): raise ValueError("supersession missing reason/provenance")
    if _has_cycle(supersessions): raise ValueError("supersession cycle")

def simulate_upsert(prepared: PreparedLoad, initial_state: dict[str, dict[str, dict[str, Any]]] | None = None) -> UpsertResult:
    state = copy.deepcopy(initial_state) if initial_state is not None else {name: {} for name in ENTITY_KEYS}
    for name in ENTITY_KEYS: state.setdefault(name, {})
    inserted = {name: 0 for name in ENTITY_KEYS}; unchanged = {name: 0 for name in ENTITY_KEYS}
    for name, rows in prepared.entities.items():
        key_field = ENTITY_KEYS[name]; bucket = state[name]
        for row in rows:
            key = str(row[key_field]); existing = bucket.get(key)
            if existing is None: bucket[key] = copy.deepcopy(row); inserted[name] += 1
            elif canonical_json(existing) == canonical_json(row): unchanged[name] += 1
            else: raise ValueError(f"explicit conflict for {name}:{key}; overwrite prohibited")
    normalized = {name: [state[name][key] for key in sorted(state[name])] for name in sorted(state)}
    return UpsertResult(inserted, unchanged, digest(canonical_json(normalized)), state)
