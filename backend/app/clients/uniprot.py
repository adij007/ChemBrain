import httpx

from app.clients.base import get_json


class UniProtClient:
    """Protein enrichment using UniProt REST."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_protein(self, uniprot_id: str | None, symbol: str | None = None) -> dict:
        if uniprot_id:
            data = await get_json(
                self.client,
                "UniProt",
                f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.json",
            )
            return self._normalize(data)

        query = f"gene_exact:{symbol} AND reviewed:true" if symbol else "reviewed:true"
        data = await get_json(
            self.client,
            "UniProt",
            "https://rest.uniprot.org/uniprotkb/search",
            params={"query": query, "format": "json", "size": 1},
        )
        results = data.get("results", [])
        if not results:
            return {"accession": uniprot_id, "function": None, "pathways": []}
        return self._normalize(results[0])

    def _normalize(self, data: dict) -> dict:
        comments = data.get("comments", [])
        function_text = None
        pathways = []
        for comment in comments:
            if comment.get("commentType") == "FUNCTION":
                texts = comment.get("texts", [])
                if texts:
                    function_text = texts[0].get("value")
            if comment.get("commentType") == "PATHWAY":
                for text in comment.get("texts", []):
                    if text.get("value"):
                        pathways.append(text["value"])
        return {
            "accession": data.get("primaryAccession"),
            "protein_name": (
                data.get("proteinDescription", {})
                .get("recommendedName", {})
                .get("fullName", {})
                .get("value")
            ),
            "function": function_text,
            "pathways": pathways,
        }
