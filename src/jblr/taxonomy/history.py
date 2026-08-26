from __future__ import annotations

from typing import Any

from .import_model import validate_history_relations


def reconstruct_history(history_records: list[dict[str, Any]], taxon_concept_id: str) -> list[dict[str, Any]]:
    rows = [row for row in history_records if row["taxon_concept_id"] == taxon_concept_id]
    rows.sort(key=lambda row: (row["release_id"], row["release_row_id"]))
    return rows


__all__ = ["reconstruct_history", "validate_history_relations"]
