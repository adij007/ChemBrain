"""Deterministic ranking for catalog drug candidates."""

from __future__ import annotations

import math
from typing import Any

from drug_repurposing_engine.catalog import DrugEntry, DrugLink
from drug_repurposing_engine.inference import generate_drug_3d, generate_formula_block, ic50_to_molar

DISCLAIMER = (
    "ChemBrain ranks curated demo candidates using heuristic scores (IC50, genetic evidence, "
    "curation tier, Lipinski, adverse-effect count). This is not clinical guidance."
)

EVIDENCE_WEIGHT = {
    "approved": 1.0,
    "clinical": 0.85,
    "preclinical": 0.65,
    "hypothetical": 0.45,
}


def _affinity_component(ic50_value: float, ic50_unit: str) -> float:
    molar = ic50_to_molar(float(ic50_value), str(ic50_unit))
    # Lower IC50 (M) => larger score; clamp to avoid extreme spikes
    safe_molar = max(float(molar), 1e-15)
    return min(-math.log10(safe_molar) * 8.0, 120.0)


def rank_drug_candidates(
    candidates: list[tuple[DrugEntry, DrugLink]],
    *,
    include_lipinski: bool = True,
) -> list[dict[str, Any]]:
    """Return sorted candidate rows with transparent score breakdown."""

    scored: list[dict[str, Any]] = []

    for drug_entry, link in candidates:
        ctx = drug_entry.context
        affinity = _affinity_component(float(ctx["ic50_value"]), str(ctx["ic50_unit"]))
        evidence = EVIDENCE_WEIGHT.get(link.evidence_level, 0.5) * 25.0
        genetic = float(ctx["genetic_evidence_score"]) * 12.0
        adverse_penalty = -0.55 * len(ctx["adverse_effects"])

        lipinski_bonus = 0.0
        lipinski_flag: bool | None = None
        if include_lipinski:
            drug_3d = generate_drug_3d(ctx["smiles"], ctx["drug_name"])
            formula_block = generate_formula_block(ctx, drug_3d["descriptors"])
            lipinski_flag = bool(formula_block["drug_properties"]["lipinski_compliant"])
            lipinski_bonus = 6.0 if lipinski_flag else 0.0

        total = affinity + evidence + genetic + lipinski_bonus + adverse_penalty

        scored.append(
            {
                "drug_id": drug_entry.drug_id,
                "rank": 0,
                "total_score": round(total, 4),
                "components": {
                    "affinity_from_ic50": round(affinity, 4),
                    "evidence_level": link.evidence_level,
                    "evidence_weighted": round(evidence, 4),
                    "genetic_evidence": round(genetic, 4),
                    "lipinski_bonus": round(lipinski_bonus, 4) if include_lipinski else None,
                    "lipinski_compliant": lipinski_flag,
                    "adverse_effect_penalty": round(adverse_penalty, 4),
                    "mechanism_tag": link.mechanism_tag,
                },
                "caveats": [DISCLAIMER],
            }
        )

    scored.sort(key=lambda row: (-row["total_score"], row["drug_id"]))
    for idx, row in enumerate(scored, start=1):
        row["rank"] = idx
    return scored
