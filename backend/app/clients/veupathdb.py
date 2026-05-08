from typing import Any

import httpx


class VEuPathDBClient:
    """Parasite-oriented metadata enrichment via VEuPathDB."""

    BASE = "https://veupathdb.org/service"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def search_parasite_context(self, term: str) -> dict[str, Any]:
        if not term.strip():
            return {}

        # Best-effort lookup against organism endpoint.
        try:
            response = await self.client.get(
                f"{self.BASE}/organisms",
                params={"search": term, "pageSize": 1},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            return {}

        if isinstance(payload, list):
            items = payload
        else:
            items = payload.get("records") or payload.get("results") or []

        if not items:
            return {}

        item = items[0]
        return {
            "organism": item.get("displayName") or item.get("organismName"),
            "project": item.get("project") or item.get("projectName"),
            "taxon_id": item.get("ncbiTaxonId") or item.get("taxonId"),
        }

