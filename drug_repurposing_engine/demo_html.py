"""HTML builders for ChemBrain CLI and web UI."""

from __future__ import annotations

import html as html_module
from typing import Any

from drug_repurposing_engine.catalog import Condition


def disease_output_slug(condition_id: str) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in condition_id.strip().lower())
    return "_".join(x for x in safe.split("_") if x) or "condition"


def build_ranked_index_html(
    condition: Condition,
    ranked_rows: list[dict[str, Any]],
    *,
    enrichment_section: str = "",
) -> str:
    rows_html = []
    for row in ranked_rows:
        drug_id = html_module.escape(row["drug_id"])
        rank = row["rank"]
        score = html_module.escape(str(row["total_score"]))
        mechanism = html_module.escape(str(row["components"].get("mechanism_tag", "")))
        detail_name = f"drug_{rank:02d}_{drug_id}.html"
        rows_html.append(
            f"<tr><td>{rank}</td><td><a href=\"{detail_name}\">{drug_id}</a></td>"
            f"<td>{score}</td><td>{mechanism}</td></tr>"
        )

    cond_name = html_module.escape(condition.name)
    cond_summary = html_module.escape(condition.summary)
    kind = html_module.escape(condition.kind)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ChemBrain — {cond_name}</title>
  <style>
    body {{ margin: 0; background: #080a0d; color: #e8eef6; font-family: Arial, Helvetica, sans-serif; }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 28px; }}
    h1 {{ font-size: 26px; margin: 0 0 10px; }}
    .subtle {{ color: #9aa7b5; margin-bottom: 22px; }}
    table {{ width: 100%; border-collapse: collapse; background: #10151c; border: 1px solid #253041; }}
    th, td {{ border-bottom: 1px solid #253041; padding: 10px 12px; text-align: left; }}
    th {{ color: #8fa0b3; font-size: 12px; text-transform: uppercase; }}
    a {{ color: #7ec8ff; }}
    .panel {{ border: 1px solid #253041; border-radius: 8px; padding: 18px; margin-bottom: 18px; background: #10151c; }}
  </style>
</head>
<body>
  <main>
    <h1>Disease / pathogen mode</h1>
    <p class="subtle">{kind} · <strong>{cond_name}</strong></p>
    <section class="panel"><p>{cond_summary}</p></section>
    {enrichment_section}
    <section class="panel">
      <h2>Ranked candidates (heuristic)</h2>
      <table>
        <thead><tr><th>Rank</th><th>Drug</th><th>Score</th><th>Mechanism (catalog)</th></tr></thead>
        <tbody>
          {"".join(rows_html)}
        </tbody>
      </table>
      <p style="font-size:12px;color:#8fa0b3;margin-top:12px;">
        Scores combine IC50-derived affinity, evidence tier, genetic-evidence field, Lipinski bonus, and adverse-effect count penalty.
        Not for clinical decisions.
      </p>
    </section>
  </main>
</body>
</html>
"""


def build_demo_html_static(context: dict[str, Any], formula_block: dict[str, Any], visualization_html: str) -> str:
    """Same layout as historical `run_demo.py` single-demo HTML."""

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
    .narrative {{
      white-space: pre-wrap;
      font-size: 14px;
      line-height: 1.45;
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


def build_demo_html_with_llm(context: dict[str, Any], explanations: dict[str, Any]) -> str:
    """Full demo page including BioMedLM/BioGPT narrative sections."""

    sim = explanations["simulation"]
    formula_block = sim["formula_block"]
    visualization_html = sim["visualization_html"]

    base = build_demo_html_static(context, formula_block, visualization_html)

    rationale = html_module.escape(explanations.get("mechanistic_rationale", ""))
    reaction = html_module.escape(explanations.get("reaction_brief", ""))
    narrative = html_module.escape(sim.get("narrative", ""))
    bond = html_module.escape(explanations.get("bond_summary", ""))
    model_info = explanations.get("model") or {}

    llm_sections = f"""
    <section class="panel">
      <h2>Mechanistic rationale (LLM)</h2>
      <div class="narrative">{rationale}</div>
    </section>
    <section class="panel">
      <h2>Reaction brief (LLM)</h2>
      <div class="narrative">{reaction}</div>
    </section>
    <section class="panel">
      <h2>Simulation narrative (LLM)</h2>
      <div class="narrative">{narrative}</div>
    </section>
    <section class="panel">
      <h2>Bond summary</h2>
      <p>{bond}</p>
      <p style="font-size:12px;color:#8fa0b3;">Model: {html_module.escape(str(model_info.get('name','')))} · Device: {html_module.escape(str(model_info.get('device','')))}</p>
    </section>
"""

    marker = "<section class=\"panel\">\n      <h2>What This Is Showing</h2>"
    if marker in base:
        return base.replace(marker, llm_sections + marker, 1)
    return base + llm_sections


def format_enrichment_section(payload: dict[str, Any]) -> str:
    if not payload.get("ok"):
        detail = html_module.escape(str(payload.get("detail", payload.get("reason", ""))))
        return f'<section class="panel"><h2>Open Targets hints</h2><p>Unavailable ({detail}).</p></section>'

    hits = payload.get("hits") or []
    if not hits:
        return '<section class="panel"><h2>Open Targets hints</h2><p>No disease hits returned.</p></section>'

    lines = []
    for h in hits:
        hid = html_module.escape(str(h.get("id", "")))
        name = html_module.escape(str(h.get("name", "")))
        desc = html_module.escape(str(h.get("description", "")))
        lines.append(f"<li><strong>{name}</strong> <code>{hid}</code><br/><span style=\"color:#9aa7b5\">{desc}</span></li>")

    return (
        '<section class="panel"><h2>Open Targets hints (informational)</h2>'
        f"<ul>{''.join(lines)}</ul>"
        "<p style=\"font-size:12px;color:#8fa0b3\">External ontology matches are not drug recommendations.</p>"
        "</section>"
    )
