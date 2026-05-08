from typing import Any

import httpx

from app.clients.base import ExternalAPIError, get_json


class NCBIEUtilsClient:
    """Taxonomy enrichment using NCBI E-utilities."""

    ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def classify_organism(self, term: str) -> dict[str, Any]:
        if not term.strip():
            return {}

        search = await get_json(
            self.client,
            "NCBI E-utilities",
            self.ESEARCH,
            params={
                "db": "taxonomy",
                "term": term,
                "retmode": "json",
                "retmax": 1,
            },
        )
        tax_ids = search.get("esearchresult", {}).get("idlist", [])
        if not tax_ids:
            return {}

        tax_id = str(tax_ids[0])
        summary = await get_json(
            self.client,
            "NCBI E-utilities",
            self.ESUMMARY,
            params={
                "db": "taxonomy",
                "id": tax_id,
                "retmode": "json",
            },
        )
        result = summary.get("result", {}).get(tax_id, {})
        if not result:
            return {}

        return {
            "tax_id": tax_id,
            "scientific_name": result.get("scientificname"),
            "common_name": result.get("commonname"),
            "rank": result.get("rank"),
            "division": result.get("division"),
            "lineage": result.get("lineage"),
        }

