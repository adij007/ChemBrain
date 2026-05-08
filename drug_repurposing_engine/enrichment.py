"""Optional OpenTargets Platform GraphQL enrichment (read-only, best-effort)."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

OPEN_TARGETS_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"


def fetch_open_targets_disease_hints(query: str, *, timeout: int = 12) -> dict[str, Any]:
    """Search diseases by free text; returns structured hints for UI display."""

    q = query.strip()
    if len(q) < 2:
        return {"ok": False, "reason": "query_too_short", "hits": []}

    gql = """query ChemBrainSearch($q: String!) {
      search(queryString: $q, entityNames: ["disease"], page: { index: 0, size: 8 }) {
        hits {
          id
          name
          entity
          description
        }
      }
    }
    """
    payload = json.dumps({"query": gql, "variables": {"q": q}}).encode("utf-8")
    req = Request(
        OPEN_TARGETS_GRAPHQL,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "ChemBrain/1.0"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except URLError as exc:
        return {"ok": False, "reason": "network_error", "detail": str(exc), "hits": []}
    except OSError as exc:
        return {"ok": False, "reason": "io_error", "detail": str(exc), "hits": []}

    if body.get("errors"):
        return {"ok": False, "reason": "graphql_errors", "detail": body["errors"], "hits": []}

    hits_raw = body.get("data", {}).get("search", {}).get("hits") or []
    hits = []
    for h in hits_raw:
        if str(h.get("entity", "")).lower() != "disease":
            continue
        hits.append(
            {
                "id": h.get("id"),
                "name": h.get("name"),
                "description": (h.get("description") or "")[:280],
            }
        )

    return {"ok": True, "hits": hits}
