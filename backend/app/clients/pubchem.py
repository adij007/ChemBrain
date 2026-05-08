import httpx

from app.clients.base import ExternalAPIError, get_json


class PubChemClient:
    """Molecule structure enrichment using PubChem PUG REST."""

    BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_compound_summary(self, drug_name: str) -> dict:
        encoded_name = drug_name.replace("/", " ")
        try:
            data = await get_json(
                self.client,
                "PubChem",
                f"{self.BASE}/{encoded_name}/property/CanonicalSMILES,IsomericSMILES,MolecularFormula/JSON",
            )
        except ExternalAPIError:
            return {}
        props = data.get("PropertyTable", {}).get("Properties", [])
        if not props:
            return {}
        item = props[0]
        return {
            "cid": item.get("CID"),
            "canonical_smiles": item.get("CanonicalSMILES"),
            "isomeric_smiles": item.get("IsomericSMILES"),
            "molecular_formula": item.get("MolecularFormula"),
            "structure_image_url": f"{self.BASE}/{encoded_name}/PNG",
        }
