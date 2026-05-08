import json
import unittest
from pathlib import Path
from unittest import mock

from drug_repurposing_engine.inference import (
    build_research_synthesis_prompt,
    clean_output,
    extract_bond_summary,
    generate_drug_3d,
    generate_text,
    generate_formula_block,
    generate_visualization_html,
    parse_target_inference_output,
    parse_residue_label,
    validate_binding_residues_against_pdb,
    validate_context,
    validate_rationale_quality,
    validate_simulation_narrative,
)


ROOT = Path(__file__).resolve().parents[1]
CONTEXT = json.loads((ROOT / "sample_context.json").read_text(encoding="utf-8"))


class InferenceUtilityTests(unittest.TestCase):
    @mock.patch("drug_repurposing_engine.inference.requests.post")
    def test_generate_text_reads_response_field_from_ollama(self, mock_post):
        mock_response = mock.Mock()
        mock_response.json.return_value = {"response": "Generated response"}
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response

        output = generate_text("test prompt")
        self.assertEqual(output, "Generated response")

    def test_context_requires_pdb_id(self):
        bad_context = dict(CONTEXT)
        del bad_context["pdb_id"]
        with self.assertRaisesRegex(ValueError, "pdb_id"):
            validate_context(bad_context)

    def test_formula_block_computes_delta_g_from_ic50(self):
        descriptors = {
            "molecular_weight": 129.1,
            "h_bond_donors": 4,
            "h_bond_acceptors": 3,
            "rotatable_bonds": 2,
            "logp": -1.43,
        }
        block = generate_formula_block(CONTEXT, descriptors)
        self.assertEqual(block["binding_free_energy"]["value"], "ΔG ≈ -7.21 kcal/mol")
        self.assertIn("8.3 µM", block["equilibrium_expression"]["kd"])
        self.assertTrue(block["drug_properties"]["lipinski_compliant"])

    def test_rdkit_generates_metformin_3d(self):
        drug_3d = generate_drug_3d(CONTEXT["smiles"], CONTEXT["drug_name"])
        self.assertIn("V2000", drug_3d["mol_block"])
        self.assertGreater(drug_3d["descriptors"]["molecular_weight"], 120)
        self.assertGreaterEqual(drug_3d["descriptors"]["h_bond_donors"], 1)

    def test_residue_label_normalization(self):
        self.assertEqual(parse_residue_label("Gly12"), {"label": "Gly12", "resn": "GLY", "resi": "12"})
        self.assertEqual(parse_residue_label("K16"), {"label": "K16", "resn": "LYS", "resi": "16"})

    def test_visualization_html_uses_json_escaped_models_and_residues(self):
        drug_3d = {
            "mol_block": "metformin\n  test\nM  END\n",
            "descriptors": {
                "molecular_weight": 129.1,
                "h_bond_donors": 4,
                "h_bond_acceptors": 3,
                "rotatable_bonds": 2,
                "logp": -1.43,
            },
        }
        protein_3d = {
            "pdb_content": "HEADER TEST\nATOM      1  N   GLY A  12      0.0 0.0 0.0\nEND\n",
            "pdb_id": "6OIM",
            "target_name": "KRAS",
        }
        html = generate_visualization_html(drug_3d, protein_3d, CONTEXT)
        self.assertIn("drug-viewer", html)
        self.assertIn('"resn": "GLY"', html)
        self.assertIn("3Dmol-min.js", html)

    def test_pdb_residue_validation_detects_missing_mutation_labels(self):
        pdb_content = (
            "ATOM      1  N   CYS A  12      0.0 0.0 0.0  1.00 1.00           N\n"
            "ATOM      2  N   VAL A  14      0.0 0.0 0.0  1.00 1.00           N\n"
        )
        validation = validate_binding_residues_against_pdb(pdb_content, ["Gly12", "Val14"])
        self.assertFalse(validation["all_found"])
        self.assertEqual(validation["matched"], ["Val14"])
        self.assertEqual(validation["missing"][0]["label"], "Gly12")

    def test_bond_summary_extracts_known_interactions(self):
        summary = extract_bond_summary(
            "Hydrogen bonds form with Gly12 while van der Waals and hydrophobic contacts stabilize electrostatic orientation."
        )
        self.assertEqual(
            summary,
            "hydrogen bonds · van der Waals forces · hydrophobic contacts · electrostatic interactions",
        )

    def test_clean_output_keeps_decimal_sentences(self):
        self.assertEqual(clean_output("IC50 is 8.3 µM. incomplete tail"), "IC50 is 8.3 µM.")

    def test_simulation_validator_checks_required_lines(self):
        simulation = "\n".join(
            f"STEP {i}: Title\nFormula: ΔG = RT ln(Kd)\nExplanation: Step {i} explanation."
            for i in range(1, 6)
        )
        validation = validate_simulation_narrative(simulation)
        self.assertTrue(validation["has_five_steps"])
        self.assertTrue(validation["has_required_formula_lines"])
        self.assertTrue(validation["has_required_explanation_lines"])

    def test_validate_rationale_quality_flags_good_rationale(self):
        rationale = (
            "Metformin may modulate KRAS signaling in the RAS signaling pathway while showing measurable binding support "
            "from the reported IC50 of 8.3 µM. The binding affinity signal aligns with moderate genetic evidence for "
            "target dependency, but adverse gastrointestinal effects create a clinical risk that warrants caution."
        )
        checks = validate_rationale_quality(rationale, CONTEXT)
        self.assertTrue(all(checks.values()))

    def test_parse_target_inference_output_returns_three_targets(self):
        raw_output = """
TARGET 1:
Gene: KRAS
UniProt: P01116
Rationale: KRAS is central to oncogenic MAPK signaling and has approved pathway-directed drugs.

TARGET 2:
Gene: EGFR
UniProt: P00533
Rationale: EGFR drives upstream growth signaling and has multiple approved inhibitors.

TARGET 3:
Gene: MTOR
UniProt: P42345
Rationale: mTOR controls cell growth integration and is druggable with approved agents.
"""
        parsed = parse_target_inference_output(raw_output)
        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]["gene"], "KRAS")
        self.assertEqual(parsed[1]["uniprot_id"], "P00533")
        self.assertIn("druggable", parsed[2]["rationale"].lower())

    def test_build_research_synthesis_prompt_contains_core_fields(self):
        prompt = build_research_synthesis_prompt(CONTEXT)
        self.assertIn(CONTEXT["drug_name"], prompt)
        self.assertIn(CONTEXT["target_name"], prompt)
        self.assertIn("confidence", prompt.lower())


if __name__ == "__main__":
    unittest.main()
