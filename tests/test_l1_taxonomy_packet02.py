from __future__ import annotations

from pathlib import Path
import copy
import json
import os
import tempfile
import unittest
import zipfile
from hashlib import sha256

from jblr.taxonomy.importer import (
    PreparedLoad,
    _rows_fingerprint,
    _semantic_external_conflicts,
    dry_run,
    normalize_rc3,
    simulate_upsert,
    validate_history_relations,
)
from jblr.taxonomy.mapping import detect_mapping_conflicts, group_mapping_evidence


def tiny_prepared() -> PreparedLoad:
    entities = {
        "taxon_concepts": [{"taxon_concept_id": "TWK-1", "display_name": "Alpha"}],
        "taxonomic_names": [{"taxonomic_name_id": "TNAME:DISPLAY:TWK-1", "name_verbatim": "Alpha", "taxon_concept_id": "TWK-1"}],
        "source_records": [{"source_record_id": "SRC-1", "source_name_verbatim": "Alpha", "taxon_concept_id": "TWK-1"}],
        "identifications": [{"identification_id": "IDENT-1", "subject_record_id": "SRC-1", "taxon_concept_id": "TWK-1"}],
        "operational_identifiers": [{"external_identifier_id": "OP-1", "value": "J1", "subject_id": "TWK-1"}],
        "external_id_mappings": [{"mapping_id": "MAP-1", "scheme": "X", "value": "9", "taxon_concept_id": "TWK-1"}],
        "external_id_conflicts": [],
        "unknown_external_ids": [],
        "history_records": [{"history_id": "H-1", "taxon_concept_id": "TWK-1"}],
        "aliases": [],
        "supersessions": [],
    }
    counts = {name: len(rows) for name, rows in entities.items()}
    fps = {name: _rows_fingerprint(rows) for name, rows in entities.items()}
    return PreparedLoad("x" * 64, entities, counts, fps, 1, 0)


class Packet02UnitTests(unittest.TestCase):
    def test_upsert_is_idempotent(self):
        prepared = tiny_prepared()
        first = simulate_upsert(prepared)
        second = simulate_upsert(prepared, first.state)
        self.assertEqual(first.state_sha256, second.state_sha256)
        self.assertTrue(all(v == 0 for v in second.inserted.values()))
        self.assertEqual(second.unchanged, prepared.counts)

    def test_explicit_conflict_never_overwrites(self):
        prepared = tiny_prepared()
        first = simulate_upsert(prepared)
        changed = copy.deepcopy(prepared)
        changed.entities["taxon_concepts"][0]["display_name"] = "Changed"
        with self.assertRaisesRegex(ValueError, "overwrite prohibited"):
            simulate_upsert(changed, first.state)

    def test_name_change_cannot_recreate_identity(self):
        prepared = tiny_prepared()
        concept_id = prepared.entities["taxon_concepts"][0]["taxon_concept_id"]
        prepared.entities["taxon_concepts"][0]["display_name"] = "Completely different name"
        self.assertEqual(concept_id, prepared.entities["taxon_concepts"][0]["taxon_concept_id"])

    def test_mapping_conflict_detected_but_repeated_same_mapping_is_evidence(self):
        rows = [
            {"mapping_id": "1", "scheme": "X", "value": "7", "taxon_concept_id": "A"},
            {"mapping_id": "2", "scheme": "X", "value": "7", "taxon_concept_id": "A"},
        ]
        self.assertEqual([], detect_mapping_conflicts(rows))
        self.assertEqual(1, len(group_mapping_evidence(rows)))
        rows.append({"mapping_id": "3", "scheme": "X", "value": "7", "taxon_concept_id": "B"})
        self.assertEqual(1, len(detect_mapping_conflicts(rows)))

    def test_supersession_cycle_rejected(self):
        concepts = {"A", "B"}
        rows = [
            {"relation_id": "1", "from_taxon_concept_id": "A", "to_taxon_concept_id": "B", "reason": "r", "provenance": {"source_pointer": "p"}},
            {"relation_id": "2", "from_taxon_concept_id": "B", "to_taxon_concept_id": "A", "reason": "r", "provenance": {"source_pointer": "p"}},
        ]
        with self.assertRaisesRegex(ValueError, "cycle"):
            validate_history_relations(concepts, [], rows)


@unittest.skipUnless(os.environ.get("JBLR_RC3_PATH"), "JBLR_RC3_PATH not set")
class Packet02RealRC3Tests(unittest.TestCase):
    def setUp(self):
        self.path = Path(os.environ["JBLR_RC3_PATH"])

    def test_real_rc3_normalization_counts(self):
        prepared = normalize_rc3(self.path)
        self.assertEqual(3033, prepared.counts["taxon_concepts"])
        self.assertEqual(2262, prepared.counts["source_records"])
        self.assertEqual(2262, prepared.counts["identifications"])
        self.assertEqual(5295, prepared.counts["taxonomic_names"])
        self.assertEqual(3033, prepared.counts["operational_identifiers"])
        self.assertEqual(4276, prepared.counts["external_id_mappings"])
        self.assertEqual(48, prepared.counts["external_id_conflicts"])
        self.assertEqual(2685, prepared.counts["unknown_external_ids"])
        self.assertEqual(3033, prepared.counts["history_records"])
        self.assertEqual(0, prepared.counts["aliases"])
        self.assertEqual(0, prepared.counts["supersessions"])
        self.assertEqual(4224, prepared.semantic_external_mapping_count)
        self.assertEqual(0, prepared.semantic_external_mapping_conflicts)

    def test_real_rc3_deterministic_and_idempotent(self):
        a = normalize_rc3(self.path)
        b = normalize_rc3(self.path)
        self.assertEqual(a.dataset_sha256, b.dataset_sha256)
        evidence = dry_run(self.path)
        self.assertTrue(evidence["source_byte_immutable"])
        self.assertTrue(evidence["idempotency"]["pass"])
        self.assertEqual(evidence["first_simulated_upsert"]["state_sha256"], evidence["second_simulated_upsert"]["state_sha256"])

    def test_no_identity_derived_from_names_on_real_rc3(self):
        prepared = normalize_rc3(self.path)
        self.assertTrue(all(row["taxon_concept_id"].startswith("TWK-") for row in prepared.entities["taxon_concepts"]))
        self.assertEqual(3033, len({row["taxon_concept_id"] for row in prepared.entities["taxon_concepts"]}))


if __name__ == "__main__":
    unittest.main()
