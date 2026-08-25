import unittest
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "src"))
import reconcile as r


def synthetic_hub(origin, n, gov="", state=None):
    if state is None:
        if origin == r.COHORT_A_ORIGIN:
            state = "TEMPORARY_JBLR_FROM_RIOJA_ORDER"
        elif origin == r.COHORT_B_OFFICIAL_ORIGIN:
            state = "GOVERNMENT_EIDOS_EXACT_CURRENT_AT_CREATION"
        else:
            state = "TEMPORARY_JBLR_FROM_SUCCESSOR_RIOJA_ORDER"
    twk = f"TWK-{n:04d}"
    return {"rioja_order": n, "taxon_work_key": twk, "taxon_identity_hub_key": twk, "hub_origin": origin, "ID_TAXON_GOBIERNO": gov, "ID_TAXON_JBLR_STATE": state}


class ControlledContractTests(unittest.TestCase):
    def test_01_extension_terminal_states_exact(self):
        for state in r.ALLOWED_EXTENSION_TERMINAL_STATES:
            self.assertTrue(r.is_extension_terminal(state))
            self.assertEqual(r.assert_extension_state_semantics(state), "TERMINAL")

    def test_02_source_failure_pending_is_not_terminal(self):
        self.assertFalse(r.is_extension_terminal("SOURCE_FAILURE_PENDING"))
        self.assertEqual(r.assert_extension_state_semantics("SOURCE_FAILURE_PENDING"), "PENDING")

    def test_03_source_failure_never_normalizes_to_not_found(self):
        for state in ["SOURCE_FAILURE", "SOURCE_FAILURE_PENDING", "SOURCE_UNAVAILABLE", "ACCESS_FAILED"]:
            self.assertEqual(r.normalize_source_state(state), state)
            self.assertNotEqual(r.normalize_source_state(state), "NOT_FOUND")

    def test_04_review_queue_requires_14_unique_names(self):
        self.assertEqual(r.validate_review_queue([{"name": f"T{i}"} for i in range(14)])["count"], 14)

    def test_05_review_queue_duplicate_rejected(self):
        q = [{"name": f"T{i}"} for i in range(13)] + [{"name": "T1"}]
        with self.assertRaises(r.ContractError): r.validate_review_queue(q)

    def test_06_historical_reconciliation_uses_twk_not_name(self):
        hist = [{"rioja_order": str(i), "taxon_work_key": f"TWK-{i:04d}", "TAX_RIOJA": "X", "RESOLUCION_ID_NACIONAL": ""} for i in range(1, 2211)]
        hubs = [synthetic_hub(r.COHORT_A_ORIGIN, i) for i in range(1, 2211)]
        for h in hubs: h["hub_display_name"] = "DIFFERENT DISPLAY STRING"
        out = r.reconcile_historical_to_rc3(hist, hubs)
        self.assertTrue(out["pass"]); self.assertEqual(out["intersection"], 2210)

    def test_07_missing_historical_key_fails_mapping(self):
        hist = [{"rioja_order": str(i), "taxon_work_key": f"TWK-{i:04d}", "TAX_RIOJA": "X", "RESOLUCION_ID_NACIONAL": ""} for i in range(1, 2211)]
        hubs = [synthetic_hub(r.COHORT_A_ORIGIN, i) for i in range(1, 2210)] + [synthetic_hub(r.COHORT_A_ORIGIN, 9999)]
        out = r.reconcile_historical_to_rc3(hist, hubs)
        self.assertFalse(out["pass"]); self.assertEqual(out["missing_historical_twk_in_rc3"], 1)

    def test_08_rioja_order_mismatch_detected(self):
        hist = [{"rioja_order": str(i), "taxon_work_key": f"TWK-{i:04d}", "TAX_RIOJA": "X", "RESOLUCION_ID_NACIONAL": ""} for i in range(1, 2211)]
        hubs = [synthetic_hub(r.COHORT_A_ORIGIN, i) for i in range(1, 2211)]
        hubs[0]["rioja_order"] = 999
        out = r.reconcile_historical_to_rc3(hist, hubs)
        self.assertFalse(out["pass"]); self.assertEqual(out["rioja_order_mismatch_count"], 1)

    def test_09_identity_hub_key_mismatch_detected(self):
        hist = [{"rioja_order": str(i), "taxon_work_key": f"TWK-{i:04d}", "TAX_RIOJA": "X", "RESOLUCION_ID_NACIONAL": ""} for i in range(1, 2211)]
        hubs = [synthetic_hub(r.COHORT_A_ORIGIN, i) for i in range(1, 2211)]
        hubs[0]["taxon_identity_hub_key"] = "OTHER"
        out = r.reconcile_historical_to_rc3(hist, hubs)
        self.assertFalse(out["pass"]); self.assertEqual(out["identity_hub_key_mismatch_count"], 1)

    def _valid_hubs(self):
        return ([synthetic_hub(r.COHORT_A_ORIGIN, i) for i in range(1, 2211)] +
                [synthetic_hub(r.COHORT_B_OFFICIAL_ORIGIN, 2210+i, gov=str(900000+i)) for i in range(1, 563)] +
                [synthetic_hub(r.COHORT_B_TEMP_ORIGIN, 2772+i) for i in range(1, 262)])

    def test_10_cohort_counts_are_strict(self):
        out = r.classify_rc3_cohorts(self._valid_hubs())
        self.assertTrue(out["pass"]); self.assertEqual(out["cohort_b_total"], 823)

    def test_11_new_official_without_government_id_fails(self):
        hubs = self._valid_hubs(); hubs[2210]["ID_TAXON_GOBIERNO"] = ""
        out = r.classify_rc3_cohorts(hubs)
        self.assertFalse(out["pass"]); self.assertEqual(out["new_official_missing_government_id"], 1)

    def test_12_new_temp_with_government_id_fails(self):
        hubs = self._valid_hubs(); hubs[-1]["ID_TAXON_GOBIERNO"] = "123"
        out = r.classify_rc3_cohorts(hubs)
        self.assertFalse(out["pass"]); self.assertEqual(out["new_temp_with_government_id"], 1)

    def test_13_new_official_and_new_temp_scopes_do_not_overlap(self):
        out = r.build_09_scope(self._valid_hubs(), [{"name": f"Q{i}"} for i in range(14)])
        self.assertEqual(out["new_official_reuse_only_count"], 562); self.assertEqual(out["new_temp_fresh_scope_count"], 261)
        self.assertFalse(set(out["new_temp_fresh_scope_keys"]) & set(out["new_official_reuse_only_keys"]))

    def test_14_08_never_marks_productive_execution(self):
        out = r.build_09_scope(self._valid_hubs(), [{"name": f"Q{i}"} for i in range(14)])
        self.assertEqual(out["productive_execution_by_08"], 0)

    def test_15_do_not_rerun_all_3033_contract_is_true(self):
        out = r.build_09_scope(self._valid_hubs(), [{"name": f"Q{i}"} for i in range(14)])
        self.assertTrue(out["do_not_rerun_all_3033"])

    def test_16_unknown_extension_state_is_rejected(self):
        with self.assertRaises(r.ContractError): r.assert_extension_state_semantics("NOT_FOUND_OR_MAYBE_ABSENT")

    def test_17_rank_or_parent_collapse_not_encoded_as_terminal_state(self):
        self.assertNotIn("PARENT_MATCH", r.ALLOWED_EXTENSION_TERMINAL_STATES)
        self.assertNotIn("RANK_COLLAPSED", r.ALLOWED_EXTENSION_TERMINAL_STATES)

    def test_18_temp_id_is_not_official_id_semantically(self):
        h = synthetic_hub(r.COHORT_B_TEMP_ORIGIN, 3001)
        self.assertEqual(h["ID_TAXON_GOBIERNO"], "")
        self.assertEqual(h["ID_TAXON_JBLR_STATE"], "TEMPORARY_JBLR_FROM_SUCCESSOR_RIOJA_ORDER")


if __name__ == "__main__": unittest.main(verbosity=2)
