"""Generate a runnable ChemBrain molecule simulation demo.

Default output:
    demo_output/simulation_demo.html
    demo_output/simulation_payload.json

This is an interactive, real-time 3D molecular visualization using py3Dmol.
It is not a full molecular dynamics simulation; full MD would require an
engine such as OpenMM, a prepared protein system, force fields, solvation,
minimization, and trajectory integration.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from drug_repurposing_engine.inference import (
    fetch_protein_structure,
    generate_drug_3d,
    generate_formula_block,
    generate_visualization_html,
    validate_binding_residues_against_pdb,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_CONTEXT = ROOT / "demo_context_sotorasib_kras_g12c.json"


def load_context(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_demo_html(context: dict[str, Any], formula_block: dict[str, Any], visualization_html: str) -> str:
    formula = formula_block["binding_free_energy"]
    equilibrium = formula_block["equilibrium_expression"]
    dose = formula_block["dose_response"]
    props = formula_block["drug_properties"]
    lipinski = "yes" if props["lipinski_compliant"] else "no"

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ChemBrain Simulation - {context['drug_name']} x {context['target_name']}</title>
  <style>
    body {{
      margin: 0;
      background: #080a0d;
      color: #e8eef6;
      font-family: Arial, Helvetica, sans-serif;
    }}
    main {{
      max-width: 1200px;
      margin: 0 auto;
      padding: 28px;
    }}
    h1 {{
      font-size: 28px;
      margin: 0 0 8px;
    }}
    .subtle {{
      color: #9aa7b5;
      margin: 0 0 22px;
    }}
    .panel {{
      border: 1px solid #253041;
      border-radius: 8px;
      padding: 18px;
      margin-bottom: 18px;
      background: #10151c;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }}
    .metric {{
      background: #151c25;
      border: 1px solid #273244;
      border-radius: 6px;
      padding: 12px;
    }}
    .label {{
      color: #8fa0b3;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .value {{
      margin-top: 6px;
      font-family: Consolas, monospace;
      font-size: 15px;
    }}
    code {{
      color: #9ee6bd;
    }}
  </style>
</head>
<body>
  <main>
    <h1>SIMULATION - {context['drug_name']} x {context['target_name']}</h1>
    <p class="subtle">Interactive 3D visualization from RDKit coordinates and RCSB PDB {context['pdb_id']}.</p>

    <section class="panel">
      <h2>Formula Summary</h2>
      <div class="grid">
        <div class="metric">
          <div class="label">{formula['formula']}</div>
          <div class="value">{formula['value']}</div>
        </div>
        <div class="metric">
          <div class="label">Equilibrium</div>
          <div class="value">{equilibrium['formula']}</div>
        </div>
        <div class="metric">
          <div class="label">Affinity Anchor</div>
          <div class="value">{equilibrium['kd']}</div>
        </div>
        <div class="metric">
          <div class="label">Dose Response</div>
          <div class="value">{dose['formula']}</div>
        </div>
        <div class="metric">
          <div class="label">Drug Properties</div>
          <div class="value">
            MW {props['molecular_weight']} | HBD {props['h_bond_donors']} |
            HBA {props['h_bond_acceptors']} | LogP {props['logp']} |
            Lipinski {lipinski}
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>3D Viewer</h2>
      {visualization_html}
    </section>

    <section class="panel">
      <h2>What This Is Showing</h2>
      <p>
        The left panel is a 3D conformer generated from the drug SMILES.
        The right panel is the crystallographic target protein from RCSB PDB.
        Binding residues are highlighted only if they exist in the coordinate file.
      </p>
      <p>
        This is a real-time interactive molecular visualization. It is not a full
        molecular dynamics trajectory.
      </p>
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ChemBrain molecule simulation demo.")
    parser.add_argument("--context", type=Path, default=DEFAULT_CONTEXT, help="Path to a ChemBrain context JSON file.")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "demo_output", help="Directory for generated artifacts.")
    parser.add_argument(
        "--allow-missing-residues",
        action="store_true",
        help="Generate output even if requested binding residues are missing from the PDB.",
    )
    args = parser.parse_args()

    context = load_context(args.context)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading context: {args.context}")
    print(f"Drug: {context['drug_name']}")
    print(f"Target: {context['target_name']} / PDB {context['pdb_id']}")

    drug_3d = generate_drug_3d(context["smiles"], context["drug_name"])
    print("RDKit 3D drug generation: OK")

    protein_3d = fetch_protein_structure(context["pdb_id"], context["target_name"], uniprot_id=context.get("uniprot_id"))
    print(f"RCSB PDB fetch: OK ({len(protein_3d['pdb_content'])} chars)")

    residue_validation = validate_binding_residues_against_pdb(protein_3d["pdb_content"], context["binding_residues"])
    print(f"Residue validation: {residue_validation}")
    if not residue_validation["all_found"] and not args.allow_missing_residues:
        missing = ", ".join(item["label"] for item in residue_validation["missing"])
        raise SystemExit(f"Stopped: missing binding residues in PDB: {missing}")

    formula_block = generate_formula_block(context, drug_3d["descriptors"])
    visualization_html = generate_visualization_html(drug_3d, protein_3d, context)
    demo_html = build_demo_html(context, formula_block, visualization_html)

    html_path = args.out_dir / "simulation_demo.html"
    json_path = args.out_dir / "simulation_payload.json"

    html_path.write_text(demo_html, encoding="utf-8")
    json_path.write_text(
        json.dumps(
            {
                "context": context,
                "formula_block": formula_block,
                "drug_descriptors": drug_3d["descriptors"],
                "pdb_residue_validation": residue_validation,
                "visualization_html_chars": len(visualization_html),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    print(f"Wrote HTML: {html_path}")
    print(f"Wrote JSON: {json_path}")
    print("Open the HTML file in a browser to rotate, zoom, and inspect the molecules.")


if __name__ == "__main__":
    main()
