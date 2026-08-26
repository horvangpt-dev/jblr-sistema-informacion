from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import json
import tempfile
import unittest
import zipfile

from jblr.taxonomy.package import build_l1_package
from jblr.taxonomy.validator import validate_rc3_release, validate_relation_rows

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts/taxonomy/release_contract_v1.json"
SCHEMA = ROOT / "contracts/taxonomy/identity_schema_v1.json"
RULES = ROOT / "contracts/taxonomy/id_alias_supersession_rules_v1.json"


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def _make_valid_fixture(base: Path) -> tuple[Path, Path]:
    hub = {
        "successor_release_row_id":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3:ROW:0001","rioja_order":1,
        "taxon_work_key":"TWK-test","taxon_identity_hub_key":"TWK-test","predecessor_release_row_id":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2:ROW:0001",
        "hub_origin":"INHERITED_RC2","hub_display_name":"Fixture taxon","hub_display_name_state":"INHERITED_RC2_FROZEN_NAME",
        "ID_TAXON_GOBIERNO":"","ID_TAXON_JBLR":"ID_TAXON_JBLR_1","ID_TAXON_JBLR_STATE":"TEMPORARY_JBLR_FROM_RIOJA_ORDER",
        "PREVIOUS_ID_TAXON_JBLR":[],"first_rioja_vascular_source_order":"","first_raw_excel_row":"","source_record_count":1,"member_source_ids":["1"]
    }
    route = {
        "source_record_key":"FIXTURE:1","source_snapshot_sha256":"0"*64,"raw_excel_row":1,"rioja_vascular_source_order":1,"global_cross_row":1,
        "rioja_id":"1","source_name_verbatim":"Fixture taxon","global_cross_name_normalized":"Fixture taxon","taxon_work_key":"TWK-test",
        "successor_release_row_id":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3:ROW:0001","identity_route":"RC2","identity_route_reason":"FIXTURE",
        "classification_v3":"FIXTURE","actor06_final_category":"","actor06_selected_official_id":"","actor06_evidence_pointer":"","raw_row_sha256":"1"*64
    }
    evidence = {
        "predecessor_release_row_id":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC2:ROW:0001","rioja_id":"1","rioja_name":"Fixture taxon",
        "evidence_origin":"FIXTURE","official_id":"1","source_rank":"Species","current_miteco_names":"Fixture taxon","current_miteco_ranks":"Species",
        "integration_promotion_state":"DEFERRED","current_id_changed_in_integration":"NO"
    }
    files = {
        "TAXON_HUBS_3033_part01.jsonl": (json.dumps(hub, separators=(",", ":")) + "\n").encode(),
        "RIOJA_SOURCE_ROUTING_2262_part01.jsonl": (json.dumps(route, separators=(",", ":")) + "\n").encode(),
        "INHERITED_ID_EVIDENCE_1405_part01.jsonl": (json.dumps(evidence, separators=(",", ":")) + "\n").encode(),
    }
    qa = {
        "RC2_VALUES_CHANGED":0,"RC2_ROWS_LOST":0,"RIOJA_SOURCE_ROWS_EXPECTED":1,"RIOJA_SOURCE_ROWS_PRESERVED":1,"SOURCE_ATTRIBUTE_LOSS":0,
        "309_FINAL_ROWS_ACCOUNTED":0,"TAXON_WORK_KEY_DUPLICATES":0,"ACTIVE_ID_DUPLICATES":0,"TEMP_ID_REUSE":0,"PARENT_ID_INHERITANCE":0,
        "RANK_COLLAPSE":0,"HYBRID_COLLAPSE":0,"SILENT_NAME_REPLACEMENT":0,"UNRESOLVED_EXCLUDED":0,"CONFLICT_EXCLUDED":0,"QA_FINAL":"PASS"
    }
    files["QA_FINAL.json"] = _json_bytes(qa)
    files["SUCCESSOR_SUMMARY.json"] = _json_bytes({"release_id":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3"})
    manifest = {
        "schema":"FIXTURE","releaseId":"JBLR_TAXONOMIC_UNIVERSE_RELEASE_v1_RC3",
        "counts":{"hubs":1,"rc2Inherited":1,"newOfficial":0,"newTemporary":0,"sourceRows":1,"inheritedOfficialEvidenceDeferred":1},
        "files":{
            "hubParts":[{"file":"TAXON_HUBS_3033_part01.jsonl","rows":1,"sha256":sha256(files["TAXON_HUBS_3033_part01.jsonl"]).hexdigest(),"bytes":len(files["TAXON_HUBS_3033_part01.jsonl"])}],
            "sourceRoutingParts":[{"file":"RIOJA_SOURCE_ROUTING_2262_part01.jsonl","rows":1,"sha256":sha256(files["RIOJA_SOURCE_ROUTING_2262_part01.jsonl"]).hexdigest(),"bytes":len(files["RIOJA_SOURCE_ROUTING_2262_part01.jsonl"])}],
            "inheritedEvidenceParts":[{"file":"INHERITED_ID_EVIDENCE_1405_part01.jsonl","rows":1,"sha256":sha256(files["INHERITED_ID_EVIDENCE_1405_part01.jsonl"]).hexdigest(),"bytes":len(files["INHERITED_ID_EVIDENCE_1405_part01.jsonl"])}],
            "qa":{"file":"QA_FINAL.json","sha256":sha256(files["QA_FINAL.json"]).hexdigest()},
            "summary":{"file":"SUCCESSOR_SUMMARY.json","sha256":sha256(files["SUCCESSOR_SUMMARY.json"]).hexdigest()},
        }
    }
    files["MANIFEST.json"] = _json_bytes(manifest)
    source = base / "fixture.zip"
    with zipfile.ZipFile(source, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in sorted(files.items()):
            zf.writestr(name, data)
    contract = deepcopy(json.loads(CONTRACT.read_text()))
    contract["source"]["sha256"] = sha256(source.read_bytes()).hexdigest()
    contract["source"]["bytes"] = source.stat().st_size
    contract["counts"] = {"hubs":1,"rc2_inherited":1,"new_official":0,"new_temporary":0,"source_rows":1,"inherited_id_evidence":1}
    contract["expected_internal_files"] = {name:{"sha256":sha256(data).hexdigest(),"bytes":len(data)} for name, data in files.items()}
    contract_path = base / "fixture_contract.json"
    contract_path.write_text(json.dumps(contract, indent=2, sort_keys=True) + "\n")
    return source, contract_path


class L1Packet01Tests(unittest.TestCase):
    def test_validator_accepts_valid_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            source, contract = _make_valid_fixture(Path(td))
            result = validate_rc3_release(source, contract)
            self.assertEqual(result.status, "PASS", result.errors)
            self.assertEqual(result.counts, {"hubs":1,"source_rows":1,"inherited_id_evidence":1})

    def test_hash_mismatch_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            source, contract = _make_valid_fixture(Path(td))
            corrupt = Path(td) / "corrupt.zip"
            corrupt.write_bytes(source.read_bytes() + b"x")
            result = validate_rc3_release(corrupt, contract)
            self.assertEqual(result.status, "FAIL")
            self.assertIn("source SHA-256 mismatch", result.errors)

    def test_builder_is_byte_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            source, contract = _make_valid_fixture(base)
            a, b = base / "a.zip", base / "b.zip"
            ra = build_l1_package(source, contract, SCHEMA, RULES, a)
            rb = build_l1_package(source, contract, SCHEMA, RULES, b)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            self.assertEqual(ra["output_sha256"], rb["output_sha256"])

    def test_identity_schema_contains_required_separations(self) -> None:
        defs = json.loads(SCHEMA.read_text())["$defs"]
        for key in ("TaxonConcept","TaxonomicName","SourceRecord","Identification","ExternalIdentifier","Alias","SupersessionRelation"):
            self.assertIn(key, defs)

    def test_alias_and_supersession_guards(self) -> None:
        concepts = {"TWK-a", "TWK-b"}
        provenance = {"source_type":"TEST","source_pointer":"fixture"}
        good = validate_relation_rows(
            concepts,
            [{"alias_id":"A1","alias_value":"legacy","alias_type":"HISTORICAL_INTERNAL_ID","target_taxon_concept_id":"TWK-a","provenance":provenance}],
            [{"relation_id":"S1","from_taxon_concept_id":"TWK-a","to_taxon_concept_id":"TWK-b","relation_type":"SUPERSEDED_BY","reason":"explicit test","provenance":provenance}],
        )
        self.assertTrue(good["pass"])
        cycle = validate_relation_rows(
            concepts, [],
            [
                {"relation_id":"S1","from_taxon_concept_id":"TWK-a","to_taxon_concept_id":"TWK-b","relation_type":"SUPERSEDED_BY","reason":"x","provenance":provenance},
                {"relation_id":"S2","from_taxon_concept_id":"TWK-b","to_taxon_concept_id":"TWK-a","relation_type":"SUPERSEDED_BY","reason":"y","provenance":provenance},
            ],
        )
        self.assertFalse(cycle["pass"])
        self.assertIn("supersession cycle", cycle["supersession_errors"])


if __name__ == "__main__":
    unittest.main()
