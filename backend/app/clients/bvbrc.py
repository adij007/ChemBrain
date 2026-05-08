from typing import Any

import httpx

from app.clients.base import ExternalAPIError


class BVBRCClient:
    """Bacteria and virus enrichment via BV-BRC API."""

    BASE = "https://www.bv-brc.org/api"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def search_pathogen_context(self, term: str) -> dict[str, Any]:
        if not term.strip():
            return {}

        # BV-BRC supports RQL-style filters. We keep this best-effort and resilient:
        # failures should not break candidate generation.
        url = f"{self.BASE}/taxonomy/"
        try:
            response = await self.client.get(
                url,
                params={
                    "http_accept": "application/json",
                    "keyword": term,
                    "limit": 1,
                },
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            return {}

        if not isinstance(payload, list) or not payload:
            return {}

        item = payload[0]
        return {
            "taxon_id": item.get("taxon_id"),
            "taxon_name": item.get("taxon_name"),
            "lineage": item.get("lineage_names"),
            "genetic_code": item.get("genetic_code"),
        }

