import math
from typing import Any

import httpx

from app.clients.base import ExternalAPIError, get_json


class ChEMBLClient:
    """Binding activity lookup plus max_phase=4 approved-drug filtering."""

    BASE = "https://www.ebi.ac.uk/chembl/api/data"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def get_approved_drug_activities(
        self,
        target_symbol: str,
        uniprot_id: str | None,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        chembl_target_id = await self._find_target_chembl_id(target_symbol, uniprot_id)
        if not chembl_target_id:
            return []

        data = await get_json(
            self.client,
            "ChEMBL activity",
            f"{self.BASE}/activity.json",
            params={
                "target_chembl_id": chembl_target_id,
                "standard_type__in": "IC50,Ki,Kd,EC50",
                "limit": limit,
            },
        )
        activities = data.get("activities", [])
        approved = []
        seen = set()
        for activity in activities:
            molecule_id = activity.get("molecule_chembl_id")
            if not molecule_id or molecule_id in seen:
                continue
            seen.add(molecule_id)
            molecule = await self._get_molecule(molecule_id)
            if self._max_phase(molecule) != 4:
                continue
            pref_name = molecule.get("pref_name")
            if not pref_name:
                continue
            approved.append(
                {
                    "drug": pref_name.title(),
                    "molecule_chembl_id": molecule_id,
                    "approved_for": molecule.get("first_approval")
                    and f"Approved drug, first approval {molecule['first_approval']}"
                    or "Approved drug",
                    "target": target_symbol,
                    "target_chembl_id": chembl_target_id,
                    "standard_type": activity.get("standard_type"),
                    "standard_value": activity.get("standard_value"),
                    "standard_units": activity.get("standard_units"),
                    "binding_score": self._binding_score(activity),
                    "assay_description": activity.get("assay_description"),
                }
            )
        return approved

    async def _find_target_chembl_id(
        self,
        target_symbol: str,
        uniprot_id: str | None,
    ) -> str | None:
        query = uniprot_id or target_symbol
        data = await get_json(
            self.client,
            "ChEMBL target",
            f"{self.BASE}/target/search.json",
            params={"q": query, "limit": 5},
        )
        targets = data.get("targets", [])
        for target in targets:
            if target.get("target_chembl_id") and target.get("target_type") == "SINGLE PROTEIN":
                return target["target_chembl_id"]
        if targets:
            return targets[0].get("target_chembl_id")
        return None

    async def _get_molecule(self, molecule_id: str) -> dict:
        try:
            return await get_json(
                self.client,
                "ChEMBL molecule",
                f"{self.BASE}/molecule/{molecule_id}.json",
            )
        except ExternalAPIError:
            return {}

    def _max_phase(self, molecule: dict) -> int:
        try:
            return int(float(molecule.get("max_phase") or 0))
        except (TypeError, ValueError):
            return 0

    def _binding_score(self, activity: dict) -> float:
        try:
            value = float(activity.get("standard_value"))
        except (TypeError, ValueError):
            return 0.4
        units = (activity.get("standard_units") or "").lower()
        if units in {"nm", "nanomolar"}:
            nm_value = value
        elif units in {"um", "µm", "microM".lower()}:
            nm_value = value * 1000
        else:
            nm_value = value
        if nm_value <= 0:
            return 0.4
        score = 1 - min(math.log10(nm_value + 1) / 6, 1)
        return round(max(score, 0.05), 3)
