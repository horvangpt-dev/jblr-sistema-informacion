import unittest

import seed_bound_synonymy_recovery_v1 as m


class SeedBoundRelationTests(unittest.TestCase):
    def _candidate_names(self, text, seed="Campanula trachelium"):
        return {
            name
            for ev in m.seed_bound_relation_evidence(text, seed)
            for name in ev["candidates"]
        }

    def test_rejects_broad_synonym_section_without_seed(self):
        text = """
        Sinónimos
        Rosa canina
        Rosa rubiginosa
        Rosa agrestis
        """
        self.assertEqual(m.seed_bound_relation_evidence(text, "Campanula trachelium"), [])

    def test_accepts_explicit_symbol_same_line(self):
        text = "Campanula trachelium = Campanula urticifolia"
        names = self._candidate_names(text)
        self.assertEqual(names, {"Campanula urticifolia"})

    def test_accepts_seed_bound_syn_label_clause(self):
        text = """
        Campanula trachelium
        Syn.: Campanula urticifolia
        Habitat: bosque
        """
        names = self._candidate_names(text)
        self.assertEqual(names, {"Campanula urticifolia"})

    def test_rejects_unrelated_synonym_block_even_if_seed_elsewhere_on_page(self):
        text = """
        Campanula trachelium is discussed in the introduction.

        unrelated heading
        Syn.: Rosa canina = Rosa dumalis
        Rosa rubiginosa
        """
        self.assertEqual(m.seed_bound_relation_evidence(text, "Campanula trachelium"), [])

    def test_does_not_treat_not_equal_as_synonym(self):
        text = "Campanula trachelium ≠ Campanula urticifolia"
        self.assertEqual(m.seed_bound_relation_evidence(text, "Campanula trachelium"), [])

    def test_label_clause_rejects_adjacent_unrelated_taxon(self):
        text = """
        Campanula trachelium
        Syn.: Campanula urticifolia
        Rosa canina
        """
        names = self._candidate_names(text)
        self.assertEqual(names, {"Campanula urticifolia"})
        self.assertNotIn("Rosa canina", names)

    def test_two_independent_equals_relations_on_one_line_do_not_cross_contaminate(self):
        text = (
            "Campanula trachelium = Campanula urticifolia; "
            "Rosa canina = Rosa dumalis"
        )
        names = self._candidate_names(text)
        self.assertEqual(names, {"Campanula urticifolia"})
        self.assertNotIn("Rosa canina", names)
        self.assertNotIn("Rosa dumalis", names)

    def test_accepts_only_connected_symbol_chain(self):
        text = (
            "Campanula trachelium = Campanula urticifolia ≡ Campanula latifolia; "
            "Rosa canina = Rosa dumalis"
        )
        names = self._candidate_names(text)
        self.assertEqual(names, {"Campanula urticifolia", "Campanula latifolia"})

    def test_accepts_confirmed_chaenorhinum_multiline_relation(self):
        text = """
        Chaenorhinum rupestre (Guss.) Speta
        ≡ Linaria rupestris (Guss.) J.A.Schmidt
        = Linaria exilis (Coss. & Kralik) Lange
        """
        names = self._candidate_names(text, "Chaenorhinum rupestre")
        self.assertEqual(names, {"Linaria rupestris", "Linaria exilis"})

    def test_multiline_relation_stops_at_unrelated_nonrelation_line(self):
        text = """
        Chaenorhinum rupestre (Guss.) Speta
        ≡ Linaria rupestris (Guss.) J.A.Schmidt
        Rosa canina L.
        = Rosa dumalis Bechst.
        """
        names = self._candidate_names(text, "Chaenorhinum rupestre")
        self.assertEqual(names, {"Linaria rupestris"})
        self.assertNotIn("Rosa canina", names)
        self.assertNotIn("Rosa dumalis", names)

    def test_multiline_relation_requires_relation_marker_at_line_start(self):
        text = """
        Chaenorhinum rupestre (Guss.) Speta
        Nota editorial: = Linaria rupestris (Guss.) J.A.Schmidt
        """
        names = self._candidate_names(text, "Chaenorhinum rupestre")
        self.assertEqual(names, set())


if __name__ == "__main__":
    unittest.main()
