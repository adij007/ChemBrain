import asyncio

from fastapi.testclient import TestClient

from app.biomedlm import build_context, generate_explanation
from app.main import app
from app.pipeline import _cached_similarity_fallback


client = TestClient(app)


def main() -> None:
    health = client.get("/health")
    assert health.status_code == 200, health.text
    assert health.json() == {"status": "ok"}
    health_v1 = client.get("/api/v1/health")
    assert health_v1.status_code == 200, health_v1.text
    assert health_v1.json().get("meta", {}).get("api_version") == "v1"

    demos = client.get("/demo-diseases")
    assert demos.status_code == 200, demos.text
    assert len(demos.json()) >= 5
    assert {"disease", "slug", "candidate_count"} <= set(demos.json()[0])
    demos_v1 = client.get("/api/v1/demo-diseases")
    assert demos_v1.status_code == 200
    assert isinstance(demos_v1.json().get("data"), list)

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200, openapi.text
    assert openapi.json().get("openapi")

    query = client.get("/query", params={"disease": "pancreatic cancer"})
    assert query.status_code == 200, query.text
    data = query.json()
    assert data["source"] == "cache"
    assert data["candidates"]
    assert {"drug", "target", "rationale", "reaction_brief"} <= set(data["candidates"][0])
    query_v1 = client.get("/api/v1/query", params={"disease": "pancreatic cancer"})
    assert query_v1.status_code == 200
    assert "meta" in query_v1.json() and "data" in query_v1.json()

    missing = client.get("/query", params={"disease": "not a cached disease"})
    assert missing.status_code == 404
    missing_v1 = client.get("/api/v1/query", params={"disease": "not a cached disease"})
    assert missing_v1.status_code == 404

    context = build_context(
        disease="test disease",
        target={"symbol": "EGFR", "name": "epidermal growth factor receptor", "evidence_score": 0.7},
        protein={"accession": "P00533", "function": "Signaling receptor", "pathways": ["EGFR signaling"]},
        activity={
            "drug": "Test Drug",
            "target": "EGFR",
            "standard_type": "IC50",
            "standard_value": "12",
            "standard_units": "nM",
            "approved_for": "Approved drug",
        },
        pubchem={"canonical_smiles": "CCN", "molecular_formula": "C2H7N"},
        safety={"safety_detail": "No severe safety signal in test data."},
        binding_site="RCSB candidate structure test.",
    )
    explanation = generate_explanation(context)
    assert context["prompts"]["mechanistic_rationale"]
    assert explanation["rationale"]
    assert explanation["reaction_brief"]

    fallback = asyncio.run(_cached_similarity_fallback("glioblastoma", [{"symbol": "EGFR"}]))
    assert fallback is not None
    assert fallback.data_confidence
    assert "fallback" in fallback.data_confidence.lower()

    print("Backend validation passed.")


if __name__ == "__main__":
    main()
