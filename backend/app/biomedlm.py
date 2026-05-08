from __future__ import annotations

import importlib
import json
import os
import time
from typing import Any


MECHANISTIC_PROMPT = (
    "Generate a mechanistic repurposing rationale for {drug} against {disease} "
    "in 3-4 sentences. Explain the mechanism of action, why existing binding "
    "data suggests relevance, and note one key risk."
)

REACTION_PROMPT = (
    "Given the chemical structure and functional groups of {drug}, explain step "
    "by step how it physically interacts with the binding site of {target}. "
    "Describe which molecular bonds form, how this disrupts the target's normal "
    "function in {disease}, and what the downstream biological effect is. Keep "
    "it to 4-5 sentences, written for a scientifically literate audience."
)

_LLM_CACHE: dict[str, dict[str, Any]] = {}


def build_context(
    *,
    disease: str,
    target: dict[str, Any],
    protein: dict[str, Any],
    activity: dict[str, Any],
    pubchem: dict[str, Any],
    safety: dict[str, Any],
    binding_site: str,
) -> dict[str, Any]:
    target_label = target.get("name") or target.get("symbol") or activity.get("target")
    drug = activity["drug"]
    return {
        "drug": drug,
        "disease": disease,
        "smiles": pubchem.get("isomeric_smiles") or pubchem.get("canonical_smiles"),
        "molecular_formula": pubchem.get("molecular_formula"),
        "functional_groups": _infer_functional_groups(pubchem),
        "binding_target": {
            "label": target_label,
            "symbol": target.get("symbol") or activity.get("target"),
            "uniprot_id": target.get("uniprot_id") or protein.get("accession"),
            "function": protein.get("function"),
            "pathways": protein.get("pathways") or [],
        },
        "binding_site_residues": binding_site,
        "interaction_type": activity.get("standard_type") or "assay-level binding",
        "ic50": _format_activity(activity),
        "target_pathway": "; ".join(protein.get("pathways") or []) or protein.get("function"),
        "genetic_evidence_score": target.get("evidence_score"),
        "approved_indication": activity.get("approved_for") or "Approved drug",
        "known_adverse_effects": safety.get("safety_detail"),
        "assay_description": activity.get("assay_description"),
        "prompts": {
            "mechanistic_rationale": MECHANISTIC_PROMPT.format(
                drug=drug,
                disease=disease,
            ),
            "reaction_brief": REACTION_PROMPT.format(
                drug=drug,
                target=target_label,
                disease=disease,
            ),
        },
    }


def generate_explanation(context: dict[str, Any]) -> dict[str, Any]:
    """Call a teammate-provided generator when configured, otherwise use a safe fallback.

    Set CHEMBRAIN_ML_MODULE to a module exposing generate_explanation(context).
    The expected return shape is {"rationale": str, "reaction_brief": str}.
    """

    context_hash = _context_hash(context)
    ttl_seconds = int(os.getenv("CHEMBRAIN_LLM_CACHE_TTL_SEC", "1800"))
    now = time.time()
    cached = _LLM_CACHE.get(context_hash)
    if cached and (now - cached["ts"] <= ttl_seconds):
        return cached["payload"]

    payload = _fallback_explanation(context)
    module_name = os.getenv("CHEMBRAIN_ML_MODULE")
    if module_name:
        try:
            module = importlib.import_module(module_name)
            generated = module.generate_explanation(context)
            payload = _normalize_generated_payload(generated, context)
        except Exception:
            payload = _fallback_explanation(context)

    _LLM_CACHE[context_hash] = {"ts": now, "payload": payload}
    return payload


def llm_cache_stats() -> dict[str, Any]:
    return {"entries": len(_LLM_CACHE)}


def _normalize_generated_payload(generated: Any, context: dict[str, Any]) -> dict[str, str]:
    if isinstance(generated, str):
        generated = _parse_json_string(generated)
    if not isinstance(generated, dict):
        fallback = _fallback_explanation(context)
        fallback["mode"] = "degraded"
        fallback["fallback_used"] = True
        fallback["degraded_reason"] = "LLM output was not JSON/dict shaped."
        return fallback

    rationale = str(generated.get("rationale") or "").strip()
    reaction_brief = str(generated.get("reaction_brief") or "").strip()
    if not rationale or not reaction_brief:
        fallback = _fallback_explanation(context)
        fallback["mode"] = "degraded"
        fallback["fallback_used"] = True
        fallback["degraded_reason"] = "LLM output missing rationale or reaction_brief."
        return fallback

    quality = validate_llm_output_quality(rationale, context)
    degraded_reason = None
    mode = "normal"
    fallback_used = False
    if not all(quality.values()):
        mode = "degraded"
        fallback_used = True
        degraded_reason = "Scientific guardrail checks failed."

    return {
        "rationale": rationale,
        "reaction_brief": reaction_brief,
        "mode": mode,
        "fallback_used": fallback_used,
        "degraded_reason": degraded_reason,
    }


def _parse_json_string(text: str) -> Any:
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except Exception:
        return None


def _context_hash(context: dict[str, Any]) -> str:
    import hashlib

    canonical = json.dumps(context, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_llm_output_quality(rationale: str, context: dict[str, Any]) -> dict[str, bool]:
    text = rationale.lower()
    pathway = str(context.get("target_pathway") or "").lower()
    has_pathway = bool(pathway and any(piece in text for piece in pathway.split(";") if piece.strip()))
    has_potency = any(token in text for token in ["ic50", "ki", "kd", "affinity", "binding", "nm", "µm", "um"])
    has_uncertainty = any(token in text for token in ["uncertain", "risk", "caution", "limitation", "unknown"])
    return {
        "mentions_pathway": has_pathway,
        "mentions_potency_signal": has_potency,
        "mentions_uncertainty_or_risk": has_uncertainty,
    }


def _fallback_explanation(context: dict[str, Any]) -> dict[str, str]:
    drug = context["drug"]
    disease = context["disease"]
    target = context["binding_target"]["label"]
    evidence = context.get("genetic_evidence_score") or 0
    ic50 = context.get("ic50") or "measured ChEMBL activity"
    risk = context.get("known_adverse_effects") or "Safety should be reviewed before prioritization."
    target_pathway = context.get("target_pathway") or "the annotated disease pathway"
    binding_site = context.get("binding_site_residues") or "no resolved binding-site residues"
    smiles = context.get("smiles") or "no PubChem SMILES returned"

    rationale = (
        f"{drug} is an approved drug with experimental ChEMBL activity against {target}, "
        f"a target connected to {disease} by Open Targets evidence. The measured activity "
        f"({ic50}) and genetic evidence score ({evidence}) make it a reasonable "
        "repurposing hypothesis for scientific review. Key risk: "
        f"{risk}"
    )
    reaction_brief = (
        f"The molecular context block includes SMILES data ({smiles}) and the target pathway "
        f"context ({target_pathway}). RCSB enrichment reports: {binding_site}. In this "
        "backend fallback, bond-level contacts are described conservatively from assay and "
        "structure metadata rather than claimed as validated docking results."
    )
    return {
        "rationale": rationale,
        "reaction_brief": reaction_brief,
        "mode": "degraded",
        "fallback_used": True,
        "degraded_reason": "Deterministic fallback template.",
    }


def _format_activity(activity: dict[str, Any]) -> str:
    value = activity.get("standard_value")
    units = activity.get("standard_units")
    standard_type = activity.get("standard_type") or "activity"
    if value and units:
        return f"{standard_type} {value} {units}"
    return "measured ChEMBL activity"


def _infer_functional_groups(pubchem: dict[str, Any]) -> list[str]:
    smiles = pubchem.get("isomeric_smiles") or pubchem.get("canonical_smiles") or ""
    groups: list[str] = []
    if "N" in smiles:
        groups.append("nitrogen-containing group")
    if "O" in smiles:
        groups.append("oxygen-containing group")
    if "S" in smiles:
        groups.append("sulfur-containing group")
    if "Cl" in smiles or "F" in smiles or "Br" in smiles:
        groups.append("halogen substituent")
    if "c" in smiles:
        groups.append("aromatic ring system")
    return groups or ["functional groups not inferred from available SMILES"]
