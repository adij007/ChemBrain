import unittest

from drug_repurposing_engine.catalog import load_catalog, search_conditions


class CatalogTests(unittest.TestCase):
    def test_load_catalog_validates_all_drugs(self) -> None:
        cat = load_catalog()
        self.assertGreater(len(cat.iter_conditions()), 0)
        self.assertIsNotNone(cat.get_drug("sotorasib_kras"))

    def test_search_finds_covid_synonym(self) -> None:
        cat = load_catalog()
        hits = search_conditions(cat, "COVID", kind=None)
        self.assertTrue(any("covid" in h[0].id.lower() for h in hits))

    def test_resolve_nsclc_kras_condition(self) -> None:
        cat = load_catalog()
        cond = cat.resolve_condition("NSCLC KRAS G12C")
        self.assertIsNotNone(cond)
        assert cond is not None
        self.assertEqual(cond.id, "nsclc_kras_g12c")

    def test_drugs_linked_for_malaria(self) -> None:
        cat = load_catalog()
        pairs = cat.drugs_for_condition("malaria_pfalciparum")
        self.assertEqual(len(pairs), 2)


if __name__ == "__main__":
    unittest.main()
