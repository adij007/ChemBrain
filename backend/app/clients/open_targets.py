import httpx

from app.clients.base import ExternalAPIError, post_json


class OpenTargetsClient:
    """Disease name to target/gene lookup using Open Targets GraphQL."""

    ENDPOINT = "https://api.platform.opentargets.org/api/v4/graphql"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_targets_for_disease(self, disease: str, limit: int = 5) -> list[dict]:
        disease_id = await self._find_disease_id(disease)
        query = """
        query AssociatedTargets($efoId: String!, $size: Int!) {
          disease(efoId: $efoId) {
            associatedTargets(page: { index: 0, size: $size }) {
              rows {
                score
                target {
                  id
                  approvedSymbol
                  approvedName
                  proteinIds {
                    id
                    source
                  }
                }
              }
            }
          }
        }
        """
        data = await post_json(
            self.client,
            "Open Targets",
            self.ENDPOINT,
            json={"query": query, "variables": {"efoId": disease_id, "size": limit}},
        )
        rows = (
            data.get("data", {})
            .get("disease", {})
            .get("associatedTargets", {})
            .get("rows", [])
        )
        targets = []
        for row in rows:
            target = row.get("target") or {}
            protein_ids = [
                item.get("id")
                for item in target.get("proteinIds", [])
                if item.get("source") == "uniprot_swissprot" and item.get("id")
            ]
            targets.append(
                {
                    "id": target.get("id"),
                    "symbol": target.get("approvedSymbol"),
                    "name": target.get("approvedName"),
                    "evidence_score": round(float(row.get("score") or 0), 3),
                    "uniprot_id": protein_ids[0] if protein_ids else None,
                }
            )
        return [target for target in targets if target.get("symbol")]

    async def _find_disease_id(self, disease: str) -> str:
        query = """
        query SearchDisease($queryString: String!) {
          search(queryString: $queryString, entityNames: ["disease"]) {
            hits {
              id
              name
            }
          }
        }
        """
        data = await post_json(
            self.client,
            "Open Targets",
            self.ENDPOINT,
            json={"query": query, "variables": {"queryString": disease}},
        )
        hits = data.get("data", {}).get("search", {}).get("hits", [])
        if not hits:
            raise ExternalAPIError("Open Targets", f"no disease found for '{disease}'")
        return hits[0]["id"]
