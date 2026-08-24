import unittest

import seed_bound_synonymy_recovery_v1 as m


class SeedBoundRelationTests(unittest.TestCase):
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
        ev = m.seed_bound_relation_evidence(text, "Campanula trachelium")
        self.assertTrue(ev)
        self.assertIn("Campanula urticifolia", ev[0]["candidates"])

    def test_accepts_seed_bound_syn_label_small_block(self):
        text = """
        Campanula trachelium
        Syn.: Campanula urticifolia
        Habitat: bosque
        """
        ev = m.seed_bound_relation_evidence(text, "Campanula trachelium")
        self.assertTrue(ev)
        names = {n for x in ev for n in x["candidates"]}
        self.assertIn("Campanula urticifolia", names)

    def test_rejects_unrelated_synonym_block_even_if_seed_elsewhere_on_page(self):
        text = """
        Campanula trachelium is discussed in the introduction.

        unrelated heading
        Syn.: Rosa canina = Rosa dumalis
        Rosa rubiginosa
        """
        ev = m.seed_bound_relation_evidence(text, "Campanula trachelium")
        self.assertEqual(ev, [])

    def test_does_not_treat_not_equal_as_synonym(self):
        text = "Campanula trachelium ≠ Campanula urticifolia"
        ev = m.seed_bound_relation_evidence(text, "Campanula trachelium")
        self.assertEqual(ev, [])


if __name__ == "__main__":
    unittest.main()
