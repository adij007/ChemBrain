# Simulation UI Handoff

The backend-facing function returns:

```python
{
    "mechanistic_rationale": "...",
    "reaction_brief": "...",
    "simulation": {
        "narrative": "...",
        "formula_block": {...},
        "visualization_html": "..."
    },
    "bond_summary": "hydrogen bonds · van der Waals forces"
}
```

## Layout

```text
SIMULATION — {drug_name} × {target_name}

FORMULA SUMMARY
ΔG = RT ln(Kd)        -> computed ΔG from IC50
Equilibrium: [Drug] + [Target] ⇌ [Drug·Target]
Kd ≈ input IC50      | Hill: Effect = Emax×[D]/(IC50+[D])
MW / H-donors / H-acceptors / LogP / Lipinski compliant

3D VIEWER
[Drug molecule — rotating 3D]  [Protein — rotating 3D]
Drug formula                   PDB ID and binding residues

REACTION SIMULATION
STEP 1..5, each with Formula and Explanation lines
```

## Rendering

- Render `simulation.visualization_html` in an iframe or trusted HTML component.
- The HTML loads `https://3dmol.org/build/3Dmol-min.js`.
- The left viewer renders the RDKit-generated MOL block.
- The right viewer renders the RCSB PDB file and highlights normalized residues like `Gly12 -> GLY 12`.
- If a viewer is blank, first confirm the 3Dmol CDN is reachable from the demo browser.
