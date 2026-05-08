import httpx

from app.clients.base import ExternalAPIError, get_json
from app.models import SafetyLevel


class OpenFDAClient:
    """Safety signal enrichment using OpenFDA adverse event reports."""

    ENDPOINT = "https://api.fda.gov/drug/event.json"
    SEVERE_TERMS = {"death", "cardiac arrest", "respiratory failure", "hepatic failure"}
    MODERATE_TERMS = {"nausea", "vomiting", "diarrhoea", "diarrhea", "rash", "headache"}

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_safety_summary(self, drug_name: str) -> dict:
        try:
            data = await get_json(
                self.client,
                "OpenFDA",
                self.ENDPOINT,
                params={
                    "search": f'patient.drug.medicinalproduct:"{drug_name}"',
                    "count": "patient.reaction.reactionmeddrapt.exact",
                    "limit": 5,
                },
            )
        except ExternalAPIError:
            return {
                "safety": "unknown",
                "safety_detail": "OpenFDA unavailable for this candidate.",
            }

        results = data.get("results", [])
        reactions = [str(item.get("term", "")).lower() for item in results[:5]]
        safety = self._classify(reactions)
        top_terms = ", ".join(item.get("term", "") for item in results[:3] if item.get("term"))
        detail = (
            f"Commonly reported OpenFDA reactions include {top_terms}."
            if top_terms
            else "No common OpenFDA reaction summary returned."
        )
        return {"safety": safety, "safety_detail": detail}

    def _classify(self, reactions: list[str]) -> SafetyLevel:
        if any(term in reaction for term in self.SEVERE_TERMS for reaction in reactions):
            return "red"
        if reactions:
            return "yellow"
        return "unknown"
