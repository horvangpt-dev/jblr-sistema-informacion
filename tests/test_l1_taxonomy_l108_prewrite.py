from __future__ import annotations

from pathlib import Path
import json
import os
import unittest

from jblr.taxonomy.staging_prewrite import (
    EXPECTED_PACKET02_COUNTS, PACKET02_SHA256, RC3_SHA256,
    assert_no_operational_id_promoted, build_collision_ledger, collision_summary,
    evidence_document, load_live_snapshot, read_packet02, rc3_collision_candidates,
)
from jblr.taxonomy.postgres_adapter import (
    assert_physical_code_boundary, classify_prepared_row, physical_mapping_matrix,
    row_fingerprint, source_identity, transaction_plan, build_prewrite_intents, reconcile_prewrite_intents,
)

FIXTURE=Path(__file__).parents[1] / "execution/L1/L1_08_PREWRITE_STAGING_SNAPSHOT.json"

class PrewriteFixtureTests(unittest.TestCase):
    def setUp(self):
        self.snapshot=load_live_snapshot(FIXTURE)

    def test_complete_live_collision_ledger_23_of_23(self):
        ledger=build_collision_ledger(self.snapshot)
        self.assertEqual(23, len(ledger))
        self.assertEqual({
            "DEPENDENCY_ON_NAME_OVERLAP_REVIEW_REQUIRED": 6,
            "NAME_OVERLAP_ONLY_REVIEW_REQUIRED": 6,
            "NO_RC3_COLLISION": 9,
            "REFERENCE_TERM_NO_RC3_IDENTITY": 2,
        }, collision_summary(ledger))

    def test_no_name_overlap_entry_authorizes_identity_reuse(self):
        ledger=build_collision_ledger(self.snapshot)
        reviews=[e for e in ledger if "OVERLAP" in e.classification]
        self.assertTrue(reviews)
        self.assertTrue(all("QUARANTINE" in e.action for e in reviews))

    def test_mapping_matrix_covers_every_packet02_entity(self):
        matrix=physical_mapping_matrix()
        self.assertEqual(set(EXPECTED_PACKET02_COUNTS), {r["prepared_entity"] for r in matrix})
        self.assertEqual(25927, sum(r["prepared_count"] for r in matrix))
        self.assertTrue(all(r["first_boundary"] == "migration_staging.raw_record" for r in matrix))

    def test_transaction_plan_has_rollback_and_no_prewrite_commit(self):
        plan=transaction_plan()
        self.assertTrue(any(x["mode"] == "ROLLBACK_CONDITION" for x in plan))
        self.assertTrue(any(x["mode"] == "FUTURE_EXECUTIVE_GATE_ONLY" for x in plan))
        self.assertFalse(any(x["mode"] == "PREWRITE_DML" for x in plan))

    def test_requested_physical_jblr_code_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "jblr_code=NULL"):
            assert_physical_code_boundary("taxon_concepts", {"taxon_concept_id":"TWK-X"}, "JBLR-TXC-12345678")

    def test_source_identity_is_not_physical_resource_identity(self):
        system,dataset,key=source_identity("taxon_concepts", {"taxon_concept_id":"TWK-X"})
        self.assertEqual("JBLR_L1", system)
        self.assertTrue(key.endswith("TWK-X"))
        self.assertFalse(key.startswith("JBLR-TXC-"))

class PrewritePersistedEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(__file__).parents[1]
        self.e=json.loads((self.root/"execution/L1/L1_08_PREWRITE_EVIDENCE.json").read_text())

    def test_persisted_zero_write_and_collision_counts(self):
        self.assertEqual({"dev_dml":0,"staging_dml":0,"production_writes":0,"migrations":0},self.e["writes"])
        self.assertEqual(23,self.e["staging"]["taxonomy_live_objects_accounted"])
        self.assertEqual(3,self.e["collisions"]["candidate_concepts"])
        self.assertEqual(6,self.e["collisions"]["candidate_name_rows"])

    def test_persisted_prepared_reconciliation_counts(self):
        self.assertEqual(25927,self.e["source"]["prepared_total_rows"])
        self.assertEqual(25927,sum(self.e["prepared_dispositions"].values()))
        self.assertEqual(8319,self.e["prepared_dispositions"]["READY_NEW_RESOURCE"])
        self.assertEqual(9,self.e["prepared_dispositions"]["QUARANTINE_NAME_OVERLAP"])

@unittest.skipUnless(os.environ.get("JBLR_PACKET02_PATH"), "JBLR_PACKET02_PATH not set")
class PrewriteRealPacketTests(unittest.TestCase):
    def setUp(self):
        self.path=Path(os.environ["JBLR_PACKET02_PATH"])
        self.entities=read_packet02(self.path)

    def test_exact_packet_and_embedded_rc3_hashes_and_counts(self):
        self.assertEqual(PACKET02_SHA256, __import__('hashlib').sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(EXPECTED_PACKET02_COUNTS, {k:len(v) for k,v in self.entities.items()})
        self.assertEqual(25927, sum(map(len,self.entities.values())))

    def test_collision_candidates_are_exactly_three_concepts_six_names(self):
        c=rc3_collision_candidates(self.entities)
        self.assertEqual(3, c["candidate_concepts"])
        self.assertEqual(3030, c["non_candidate_concepts"])
        self.assertEqual(6, c["candidate_name_rows"])
        self.assertTrue(all(not x["identity_merge_authorized"] for x in c["candidates"]))

    def test_operational_ids_never_promoted_to_physical_codes(self):
        assert_no_operational_id_promoted(self.entities)
        vals=[x["value"] for x in self.entities["operational_identifiers"]]
        self.assertEqual(3033, len(vals))
        self.assertTrue(any(str(x).startswith("ID_TAXON_JBLR_") for x in vals))
        self.assertTrue(any(not str(x).startswith("ID_TAXON_JBLR_") for x in vals))
        self.assertTrue(all(not str(x).startswith("JBLR-") for x in vals))

    def test_prepared_dispositions_and_idempotent_fingerprints(self):
        a=[]; b=[]
        for entity,rows in sorted(self.entities.items()):
            for row in rows:
                a.append((source_identity(entity,row),row_fingerprint(row),classify_prepared_row(entity,row)))
                b.append((source_identity(entity,row),row_fingerprint(row),classify_prepared_row(entity,row)))
        self.assertEqual(a,b)
        self.assertEqual(25927,len(a))
        self.assertEqual(3,sum(1 for x in a if x[2]=="QUARANTINE_NAME_OVERLAP" and x[0][2].startswith("taxon_concepts:")))
        self.assertEqual(6,sum(1 for x in a if x[2]=="QUARANTINE_NAME_OVERLAP" and x[0][2].startswith("taxonomic_names:")))

    def test_physical_intents_reconcile_idempotently_without_ids_or_codes(self):
        first=build_prewrite_intents(self.entities); second=build_prewrite_intents(self.entities)
        rec=reconcile_prewrite_intents(first,second)
        self.assertTrue(rec["pass"])
        self.assertEqual(25927,rec["first_count"])
        self.assertTrue(all(x["target_resource_id"] is None for x in first))
        self.assertTrue(all(x["requested_jblr_code"] is None for x in first))
        self.assertEqual(8319,sum(1 for x in first if x["disposition"]=="READY_NEW_RESOURCE"))

    def test_evidence_is_repeatable_and_zero_write(self):
        a=evidence_document(self.path,FIXTURE); b=evidence_document(self.path,FIXTURE)
        self.assertEqual(a,b)
        self.assertEqual(RC3_SHA256,a["source"]["rc3_sha256"])
        self.assertEqual({"dev_dml":0,"staging_dml":0,"production_writes":0,"migrations":0}, a["writes"])

if __name__ == '__main__': unittest.main()
