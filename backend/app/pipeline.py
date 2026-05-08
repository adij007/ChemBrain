import asyncio

import httpx

from app.cache import save_cached_disease
from app.biomedlm import build_context, generate_explanation
from app.clients.base import ExternalAPIError
from app.clients.bvbrc import BVBRCClient
from app.clients.chembl import ChEMBLClient
from app.clients.ncbi import NCBIEUtilsClient
from app.clients.open_targets import OpenTargetsClient
from app.clients.openfda import OpenFDAClient
from app.clients.pubchem import PubChemClient
from app.clients.rcsb import RCSBClient
from app.clients.uniprot import UniProtClient
from app.clients.veupathdb import VEuPathDBClient
from app.models import Candidate, QueryResponse, SafetyLevel
from app.scoring import composite_score


class PipelineError(RuntimeError):
    pass


async def run_live_pipeline(disease: str, *, cache_result: bool = True) -> QueryResponse:
    warnings: list[str] = []
    timeout = httpx.Timeout(8.0, connect=4.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        open_targets = OpenTargetsClient(client)
        uniprot = UniProtClient(client)
        chembl = ChEMBLClient(client)
        pubchem = PubChemClient(client)
        openfda = OpenFDAClient(client)
        rcsb = RCSBClient(client)
        ncbi = NCBIEUtilsClient(client)
        bvbrc = BVBRCClient(client)
        veupathdb = VEuPathDBClient(client)

        taxonomy_task = ncbi.classify_organism(disease)
        bvbrc_task = bvbrc.search_pathogen_context(disease)
        veupathdb_task = veupathdb.search_parasite_context(disease)
        taxonomy_data, bvbrc_data, veupathdb_data = await asyncio.gather(
            taxonomy_task,
            bvbrc_task,
            veupathdb_task,
            return_exceptions=True,
        )
        pathogen_context = {
            "ncbi_taxonomy": taxonomy_data if isinstance(taxonomy_data, dict) else {},
            "bv_brc": bvbrc_data if isinstance(bvbrc_data, dict) else {},
            "veupathdb": veupathdb_data if isinstance(veupathdb_data, dict) else {},
        }

        try:
            targets = await open_targets.get_targets_for_disease(disease, limit=10)
        except ExternalAPIError as exc:
            raise PipelineError(str(exc)) from exc

        if not targets:
            raise PipelineError(f"No disease targets found for '{disease}'.")

        used_cached_similarity_fallback = False
        candidates = await _collect_candidates(
            disease=disease,
            targets=targets[:5],
            uniprot=uniprot,
            chembl=chembl,
            pubchem=pubchem,
            openfda=openfda,
            rcsb=rcsb,
            warnings=warnings,
            activity_limit=25,
            per_target_limit=3,
            pathogen_context=pathogen_context,
        )

        if not candidates:
            warnings.append("Sparse result fallback: expanding to additional Open Targets associations.")
            candidates = await _collect_candidates(
                disease=disease,
                targets=targets[5:10],
                uniprot=uniprot,
                chembl=chembl,
                pubchem=pubchem,
                openfda=openfda,
                rcsb=rcsb,
                warnings=warnings,
                activity_limit=100,
                per_target_limit=2,
                pathogen_context=pathogen_context,
            )

        if not candidates:
            fallback_candidate = await _cached_similarity_fallback(disease, targets)
            if fallback_candidate is not None:
                used_cached_similarity_fallback = True
                warnings.append(
                    "Sparse result fallback: returned a lowered-confidence cached analogue "
                    "because live approved-drug retrieval was empty."
                )
                candidates.append(fallback_candidate)

        if not candidates:
            raise PipelineError(
                "No approved-drug candidates found from live APIs or sparse-result fallback. "
                "Use cached demo diseases."
            )

        candidates.sort(key=lambda item: item.composite_score, reverse=True)
        response = QueryResponse(
            disease=disease,
            source="live",
            candidates=candidates[:10],
            warnings=warnings,
        )
        if cache_result and not used_cached_similarity_fallback:
            save_cached_disease(response)
        return response


async def _collect_candidates(
    *,
    disease: str,
    targets: list[dict],
    uniprot: UniProtClient,
    chembl: ChEMBLClient,
    pubchem: PubChemClient,
    openfda: OpenFDAClient,
    rcsb: RCSBClient,
    warnings: list[str],
    activity_limit: int,
    per_target_limit: int,
    pathogen_context: dict,
) -> list[Candidate]:
    candidates: list[Candidate] = []
    for target in targets:
        try:
            protein = await uniprot.get_protein(
                target.get("uniprot_id"),
                target.get("symbol"),
            )
        except ExternalAPIError as exc:
            warnings.append(str(exc))
            protein = {}

        try:
            activities = await chembl.get_approved_drug_activities(
                target.get("symbol") or "",
                target.get("uniprot_id") or protein.get("accession"),
                limit=activity_limit,
            )
        except ExternalAPIError as exc:
            warnings.append(str(exc))
            continue

        for activity in activities[:per_target_limit]:
            candidate = await _build_candidate(
                disease=disease,
                target=target,
                protein=protein,
                activity=activity,
                pubchem=pubchem,
                openfda=openfda,
                rcsb=rcsb,
                pathogen_context=pathogen_context,
            )
            candidates.append(candidate)
    return candidates


async def _build_candidate(
    *,
    disease: str,
    target: dict,
    protein: dict,
    activity: dict,
    pubchem: PubChemClient,
    openfda: OpenFDAClient,
    rcsb: RCSBClient,
    pathogen_context: dict,
) -> Candidate:
    drug = activity["drug"]
    pubchem_task = pubchem.get_compound_summary(drug)
    safety_task = openfda.get_safety_summary(drug)
    binding_task = rcsb.get_binding_site_summary(
        target.get("symbol") or activity["target"],
        target.get("uniprot_id") or protein.get("accession"),
    )
    pubchem_data, safety_data, binding_site = await asyncio.gather(
        pubchem_task,
        safety_task,
        binding_task,
    )

    safety: SafetyLevel = safety_data.get("safety", "unknown")
    score = composite_score(
        binding_score=float(activity.get("binding_score") or 0.4),
        evidence_score=float(target.get("evidence_score") or 0),
        safety=safety,
        confidence_score=0.65,
    )
    ic50 = _format_activity(activity)
    target_label = target.get("name") or target.get("symbol") or activity["target"]
    context = build_context(
        disease=disease,
        target=target,
        protein=protein,
        activity=activity,
        pubchem=pubchem_data,
        safety=safety_data,
        binding_site=binding_site,
    )
    explanation = generate_explanation(context)
    return Candidate(
        drug=drug,
        approved_for=activity.get("approved_for") or "Approved drug",
        target=target_label,
        ic50=ic50,
        evidence_score=float(target.get("evidence_score") or 0),
        safety=safety,
        composite_score=score,
        rationale=explanation["rationale"],
        reaction_brief=explanation["reaction_brief"],
        structure_image_url=pubchem_data.get("structure_image_url"),
        safety_detail=safety_data.get("safety_detail"),
        data_confidence=_data_confidence(activity),
        binding_site=binding_site,
        source_urls=[
            "https://platform.opentargets.org/",
            "https://www.ebi.ac.uk/chembl/",
            "https://pubchem.ncbi.nlm.nih.gov/",
            "https://open.fda.gov/apis/drug/event/",
            "https://www.rcsb.org/",
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
            "https://www.bv-brc.org/api/",
            "https://veupathdb.org/service/",
        ],
        mode=str(explanation.get("mode") or "normal"),
        fallback_used=bool(explanation.get("fallback_used")),
        degraded_reason=(
            str(explanation.get("degraded_reason"))
            if explanation.get("degraded_reason")
            else None
        ),
        raw={
            "target": target,
            "protein": protein,
            "activity": activity,
            "pubchem": pubchem_data,
            "safety": safety_data,
            "pathogen_context": pathogen_context,
            "biomedlm_context": context,
            "llm_guardrails": explanation.get("quality_checks"),
        },
    )


async def _cached_similarity_fallback(disease: str, targets: list[dict]) -> Candidate | None:
    from app.cache import list_demo_diseases, get_cached_disease

    disease_tokens = _tokens(disease)
    target_tokens = set()
    for target in targets:
        target_tokens.update(_tokens(target.get("symbol") or ""))
        target_tokens.update(_tokens(target.get("name") or ""))

    best: tuple[float, Candidate] | None = None
    for demo in list_demo_diseases():
        cached = get_cached_disease(demo.disease)
        if cached is None:
            continue
        demo_tokens = _tokens(cached.disease)
        for candidate in cached.candidates:
            candidate_tokens = demo_tokens | _tokens(candidate.target) | _tokens(candidate.drug)
            similarity = _jaccard(disease_tokens | target_tokens, candidate_tokens)
            if similarity == 0 and "cancer" in candidate_tokens and target_tokens:
                similarity = 0.05
            if best is None or similarity > best[0]:
                best = (similarity, candidate)

    if best is None or best[0] <= 0:
        return None

    candidate = best[1].model_copy(deep=True)
    candidate.composite_score = round(max(candidate.composite_score * 0.55, 0.05), 2)
    candidate.evidence_score = round(max(candidate.evidence_score * 0.5, 0.05), 2)
    candidate.data_confidence = (
        "Low-confidence sparse-result fallback from cached analogue; requires scientific validation."
    )
    candidate.rationale = (
        f"{candidate.drug} is included only as a sparse-result fallback for {disease}, "
        "based on weak token similarity to cached target/disease context. Treat this as a "
        "placeholder hypothesis until live ChEMBL/Open Targets evidence is available."
    )
    candidate.raw["fallback_similarity"] = best[0]
    return candidate


def _format_activity(activity: dict) -> str:
    value = activity.get("standard_value")
    units = activity.get("standard_units")
    standard_type = activity.get("standard_type") or "activity"
    if value and units:
        return f"{standard_type} {value} {units}"
    return "measured ChEMBL activity"


def _data_confidence(activity: dict) -> str:
    assay = activity.get("assay_description")
    molecule_id = activity.get("molecule_chembl_id")
    bits = [
        "Live result from Open Targets, ChEMBL, PubChem, OpenFDA, RCSB Search v1, NCBI E-utilities, BV-BRC, and VEuPathDB."
    ]
    if molecule_id:
        bits.append(f"ChEMBL molecule: {molecule_id}.")
    if assay:
        bits.append(f"Assay context: {assay[:180]}.")
    return " ".join(bits)


def _tokens(value: str) -> set[str]:
    import re

    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 2 and token not in {"disease", "protein", "target"}
    }


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0
    return len(left & right) / len(left | right)
