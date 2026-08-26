from __future__ import annotations

from typing import Any


def group_mapping_evidence(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (str(row["scheme"]), str(row["value"]), str(row["taxon_concept_id"]))
        grouped.setdefault(key, []).append(row)
    return grouped


def detect_mapping_conflicts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_external: dict[tuple[str, str], set[str]] = {}
    for row in rows:
        key = (str(row["scheme"]), str(row["value"]))
        by_external.setdefault(key, set()).add(str(row["taxon_concept_id"]))
    return [
        {"scheme": scheme, "value": value, "taxon_concept_ids": sorted(ids)}
        for (scheme, value), ids in sorted(by_external.items())
        if len(ids) > 1
    ]
