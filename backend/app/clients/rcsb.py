import httpx

from app.clients.base import ExternalAPIError, get_json, post_json


class RCSBClient:
    """Best-effort binding-site enrichment using RCSB search and entry APIs."""

    SEARCH_ENDPOINT = "https://search.rcsb.org/rcsbsearch/v1/query"
    ENTRY_ENDPOINT = "https://data.rcsb.org/rest/v1/core/entry"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_binding_site_summary(
        self,
        target_symbol: str,
        uniprot_id: str | None = None,
    ) -> str:
        try:
            pdb_id = await self._find_pdb_id(target_symbol, uniprot_id)
            if not pdb_id:
                return self._fallback(target_symbol)
            residue_lookup_note = await self._search_entry_residue_note(pdb_id)
            entry = await get_json(
                self.client,
                "RCSB PDB",
                f"{self.ENTRY_ENDPOINT}/{pdb_id}",
            )
        except ExternalAPIError:
            return self._fallback(target_symbol)

        title = (
            entry.get("struct", {}).get("title")
            or entry.get("rcsb_id")
            or pdb_id
        )
        method = (
            entry.get("exptl", [{}])[0].get("method")
            if entry.get("exptl")
            else "unknown method"
        )
        resolution = (
            entry.get("rcsb_entry_info", {})
            .get("resolution_combined", [None])[0]
        )
        ligand_count = (
            entry.get("rcsb_entry_info", {})
            .get("nonpolymer_entity_count")
        )
        resolution_text = f", {resolution} A resolution" if resolution else ""
        ligand_text = (
            f", {ligand_count} non-polymer ligand entities"
            if ligand_count is not None
            else ""
        )
        return (
            f"RCSB candidate structure {pdb_id}: {title} "
            f"({method}{resolution_text}{ligand_text}). Exact binding-site residues "
            f"require ligand-pocket mapping before clinical interpretation. {residue_lookup_note}"
        )

    async def _find_pdb_id(self, target_symbol: str, uniprot_id: str | None) -> str | None:
        query_value = uniprot_id or target_symbol
        search = {
            "query": {
                "type": "terminal",
                "service": "full_text",
                "parameters": {"value": query_value},
            },
            "request_options": {
                "paginate": {"start": 0, "rows": 1},
                "results_content_type": ["experimental"],
                "sort": [{"sort_by": "score", "direction": "desc"}],
            },
            "return_type": "entry",
        }
        data = await post_json(
            self.client,
            "RCSB search",
            self.SEARCH_ENDPOINT,
            json=search,
        )
        results = data.get("result_set", [])
        if not results:
            return None
        identifier = results[0].get("identifier")
        return str(identifier).lower() if identifier else None

    async def _search_entry_residue_note(self, pdb_id: str) -> str:
        # Query by exact entry id via RCSB search API v1.
        search = {
            "query": {
                "type": "terminal",
                "service": "text",
                "parameters": {
                    "attribute": "rcsb_entry_container_identifiers.entry_id",
                    "operator": "exact_match",
                    "value": pdb_id.upper(),
                },
            },
            "return_type": "entry",
            "request_options": {"paginate": {"start": 0, "rows": 1}},
        }
        try:
            data = await post_json(
                self.client,
                "RCSB search",
                self.SEARCH_ENDPOINT,
                json=search,
            )
        except ExternalAPIError:
            return "RCSB Search v1 residue query unavailable."

        result_set = data.get("result_set", [])
        if result_set:
            return "RCSB Search v1 entry lookup succeeded for residue-level follow-up."
        return "RCSB Search v1 did not confirm entry-level residue lookup."

    def _fallback(self, target_symbol: str) -> str:
        return (
            f"RCSB binding-site lookup not resolved for {target_symbol}; "
            "prototype uses pathway and assay-level evidence instead."
        )
