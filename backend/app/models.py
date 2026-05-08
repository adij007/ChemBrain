from typing import Any, Literal

from pydantic import BaseModel, Field


SafetyLevel = Literal["green", "yellow", "red", "unknown"]


class Candidate(BaseModel):
    drug: str
    approved_for: str
    target: str
    ic50: str | None = None
    evidence_score: float = Field(ge=0, le=1)
    safety: SafetyLevel
    composite_score: float = Field(ge=0, le=1)
    rationale: str
    reaction_brief: str
    structure_image_url: str | None = None
    safety_detail: str | None = None
    data_confidence: str | None = None
    binding_site: str | None = None
    source_urls: list[str] = Field(default_factory=list)
    mode: Literal["normal", "degraded"] = "normal"
    fallback_used: bool = False
    degraded_reason: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    disease: str
    source: Literal["cache", "live"]
    candidates: list[Candidate]
    warnings: list[str] = Field(default_factory=list)
    request_id: str | None = None


class EnvelopeMeta(BaseModel):
    api_version: Literal["v1"] = "v1"
    request_id: str | None = None


class QueryResponseV1(BaseModel):
    meta: EnvelopeMeta
    data: QueryResponse


class DemoDiseasesResponseV1(BaseModel):
    meta: EnvelopeMeta
    data: list["DemoDisease"]


class HealthResponseV1(BaseModel):
    meta: EnvelopeMeta
    data: dict[str, Any]


class DemoDisease(BaseModel):
    disease: str
    slug: str
    candidate_count: int
