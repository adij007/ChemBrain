import statistics
import time
import uuid
from collections import deque
import os

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from app.cache import get_cached_disease, list_demo_diseases
from app.biomedlm import llm_cache_stats
from app.models import (
    DemoDisease,
    DemoDiseasesResponseV1,
    EnvelopeMeta,
    HealthResponseV1,
    QueryResponse,
    QueryResponseV1,
)
from app.pipeline import PipelineError, run_live_pipeline

app = FastAPI(
    title="Drug Repurposing Intelligence Engine",
    description="Prototype backend for cache-first drug repurposing search.",
    version="0.1.0",
)

_METRICS = {
    "requests_total": 0,
    "success_total": 0,
    "error_total": 0,
    "latencies_ms": deque(maxlen=2000),
    "query_calls": 0,
}
_JOBS: dict[str, dict] = {}


def _require_api_access(request: Request) -> None:
    if request.url.path in {"/health", "/health/live", "/health/ready", "/health/deep", "/metrics"}:
        return

    expected_key = (
        request.app.state.settings.get("api_key")
        if hasattr(request.app.state, "settings")
        else None
    )
    if not expected_key:
        return
    provided = request.headers.get("x-api-key") or request.query_params.get("api_key")
    if provided != expected_key:
        raise HTTPException(status_code=401, detail="Unauthorized: missing or invalid API key.")
    if request.url.path.startswith("/api/v1/admin/"):
        role = (request.headers.get("x-role") or "").strip().lower()
        if role not in {"admin", "owner"}:
            raise HTTPException(status_code=403, detail="Forbidden: admin role required.")


def _rate_limit(request: Request) -> None:
    per_minute = int(
        request.app.state.settings.get("rate_limit_per_minute", 0)
        if hasattr(request.app.state, "settings")
        else 0
    )
    if per_minute <= 0:
        return
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    bucket = request.app.state.rate_buckets.setdefault(ip, deque())
    while bucket and now - bucket[0] > 60:
        bucket.popleft()
    if len(bucket) >= per_minute:
        raise HTTPException(status_code=429, detail="Rate limit exceeded.")
    bucket.append(now)


@app.on_event("startup")
async def startup() -> None:
    app.state.settings = {
        "api_key": os.environ.get("CHEMBRAIN_API_KEY", "").strip(),
        "rate_limit_per_minute": int(os.environ.get("CHEMBRAIN_RATE_LIMIT_PER_MIN", "0")),
    }
    app.state.rate_buckets = {}


@app.middleware("http")
async def request_observability(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    _METRICS["requests_total"] += 1
    try:
        _require_api_access(request)
        _rate_limit(request)
        response = await call_next(request)
        if response.status_code < 400:
            _METRICS["success_total"] += 1
        else:
            _METRICS["error_total"] += 1
    except HTTPException as exc:
        _METRICS["error_total"] += 1
        response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    except Exception:
        _METRICS["error_total"] += 1
        response = JSONResponse(status_code=500, content={"detail": "Internal server error"})

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    _METRICS["latencies_ms"].append(elapsed_ms)
    response.headers["x-request-id"] = request_id
    response.headers["x-response-time-ms"] = str(elapsed_ms)
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/live")
def health_live(request: Request) -> dict[str, str]:
    return {"status": "ok", "request_id": request.state.request_id}


@app.get("/health/ready")
def health_ready(request: Request) -> dict[str, object]:
    try:
        demo_count = len(list_demo_diseases())
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Readiness failed: {exc}") from exc
    return {
        "status": "ready",
        "request_id": request.state.request_id,
        "checks": {"demo_cache": demo_count > 0, "demo_count": demo_count},
    }


@app.get("/health/deep")
async def health_deep(request: Request) -> dict[str, object]:
    started = time.perf_counter()
    deep_details: dict[str, object] = {
        "status": "ready",
        "request_id": request.state.request_id,
        "checks": {},
    }
    try:
        probe = await run_live_pipeline("pancreatic cancer", cache_result=False)
        deep_details["checks"]["inference_probe"] = bool(probe.candidates)
    except Exception as exc:
        deep_details["checks"]["inference_probe"] = False
        deep_details["checks"]["probe_error"] = str(exc)
        deep_details["status"] = "degraded"
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    deep_details["checks"]["probe_latency_ms"] = elapsed_ms
    return deep_details


@app.get("/metrics")
def metrics() -> dict[str, object]:
    latencies = list(_METRICS["latencies_ms"])
    p50 = round(statistics.median(latencies), 2) if latencies else 0.0
    p95 = round(sorted(latencies)[int(0.95 * (len(latencies) - 1))], 2) if latencies else 0.0
    return {
        "requests_total": _METRICS["requests_total"],
        "success_total": _METRICS["success_total"],
        "error_total": _METRICS["error_total"],
        "latency_p50_ms": p50,
        "latency_p95_ms": p95,
        "llm_cache": llm_cache_stats(),
        "jobs_total": len(_JOBS),
    }


@app.get("/demo-diseases", response_model=list[DemoDisease])
def demo_diseases() -> list[DemoDisease]:
    return list_demo_diseases()


@app.get("/query", response_model=QueryResponse)
async def query_disease(
    request: Request,
    disease: str = Query(..., min_length=2),
    live: bool = Query(False, description="Try live APIs if no cache exists."),
    refresh: bool = Query(False, description="Bypass cache and refresh from live APIs."),
) -> QueryResponse:
    _METRICS["query_calls"] += 1
    cached = get_cached_disease(disease)
    if cached is not None and not refresh:
        cached.request_id = request.state.request_id
        return cached

    if not live and not refresh:
        raise HTTPException(
            status_code=404,
            detail=(
                "No cached prototype result found for this disease yet. "
                "Try a disease from /demo-diseases or call with live=true."
            ),
        )

    try:
        result = await run_live_pipeline(disease, cache_result=cached is None or refresh)
        result.request_id = request.state.request_id
        return result
    except PipelineError as exc:
        if cached is not None:
            cached.warnings.append(f"Live refresh failed: {exc}")
            cached.request_id = request.state.request_id
            return cached
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/v1/health", response_model=HealthResponseV1)
def health_v1(request: Request) -> HealthResponseV1:
    return HealthResponseV1(
        meta=EnvelopeMeta(request_id=request.state.request_id),
        data={"status": "ok"},
    )


@app.get("/api/v1/demo-diseases", response_model=DemoDiseasesResponseV1)
def demo_diseases_v1(request: Request) -> DemoDiseasesResponseV1:
    return DemoDiseasesResponseV1(
        meta=EnvelopeMeta(request_id=request.state.request_id),
        data=list_demo_diseases(),
    )


@app.get("/api/v1/query", response_model=QueryResponseV1)
async def query_disease_v1(
    request: Request,
    disease: str = Query(..., min_length=2),
    live: bool = Query(False),
    refresh: bool = Query(False),
) -> QueryResponseV1:
    data = await query_disease(request=request, disease=disease, live=live, refresh=refresh)
    return QueryResponseV1(meta=EnvelopeMeta(request_id=request.state.request_id), data=data)


async def _run_job(job_id: str, disease: str, live: bool, refresh: bool) -> None:
    _JOBS[job_id]["status"] = "running"
    try:
        result = await run_live_pipeline(disease, cache_result=not refresh)
        _JOBS[job_id]["status"] = "completed"
        _JOBS[job_id]["result"] = result.model_dump()
    except Exception as exc:
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = str(exc)


@app.post("/api/v1/jobs/query")
async def create_query_job(
    request: Request,
    background_tasks: BackgroundTasks,
    disease: str = Query(..., min_length=2),
    live: bool = Query(True),
    refresh: bool = Query(False),
) -> dict[str, object]:
    job_id = str(uuid.uuid4())
    _JOBS[job_id] = {"status": "queued", "disease": disease, "request_id": request.state.request_id}
    background_tasks.add_task(_run_job, job_id, disease, live, refresh)
    return {"job_id": job_id, "status": "queued", "request_id": request.state.request_id}


@app.get("/api/v1/jobs/{job_id}")
def get_job(job_id: str, request: Request) -> dict[str, object]:
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return {"request_id": request.state.request_id, **job}


@app.get("/api/v1/export/markdown")
async def export_markdown(
    request: Request,
    disease: str = Query(..., min_length=2),
    live: bool = Query(False),
) -> dict[str, object]:
    result = await query_disease(request=request, disease=disease, live=live, refresh=False)
    lines = [f"# Report: {result.disease}", "", f"Source: {result.source}", ""]
    for idx, candidate in enumerate(result.candidates, start=1):
        lines.append(f"## {idx}. {candidate.drug}")
        lines.append(f"- Target: {candidate.target}")
        lines.append(f"- Rationale: {candidate.rationale}")
        lines.append("")
    return {"request_id": request.state.request_id, "markdown": "\n".join(lines)}


@app.get("/api/v1/admin/diagnostics")
def admin_diagnostics(request: Request) -> dict[str, object]:
    return {
        "request_id": request.state.request_id,
        "metrics": metrics(),
        "health": {"live": health_live(request), "ready": health_ready(request)},
    }
