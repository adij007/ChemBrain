import unittest

from drug_repurposing_engine.catalog import load_catalog
from drug_repurposing_engine.ranker import rank_drug_candidates


class RankerTests(unittest.TestCase):
    def test_ranking_is_deterministic(self) -> None:
        cat = load_catalog()
        pairs = cat.drugs_for_condition("nsclc_kras_g12c")
        a = rank_drug_candidates(pairs)
        b = rank_drug_candidates(pairs)
        self.assertEqual([r["drug_id"] for r in a], [r["drug_id"] for r in b])

    def test_rank_increments(self) -> None:
        cat = load_catalog()
        pairs = cat.drugs_for_condition("hiv1_infection")
        ranked = rank_drug_candidates(pairs)
        ranks = [r["rank"] for r in ranked]
        self.assertEqual(ranks, list(range(1, len(ranked) + 1)))


if __name__ == "__main__":
    unittest.main()
