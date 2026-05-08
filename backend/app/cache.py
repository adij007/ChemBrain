import json
import re
from pathlib import Path

from app.models import DemoDisease, QueryResponse

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache" / "diseases"


def disease_to_slug(disease: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", disease.lower()).strip("_")
    return slug


def get_cached_disease(disease: str) -> QueryResponse | None:
    path = CACHE_DIR / f"{disease_to_slug(disease)}.json"
    if not path.exists():
        return None

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return QueryResponse.model_validate(data)


def save_cached_disease(response: QueryResponse) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{disease_to_slug(response.disease)}.json"
    with path.open("w", encoding="utf-8") as file:
        file.write(response.model_dump_json(indent=2))
        file.write("\n")
    return path


def list_demo_diseases() -> list[DemoDisease]:
    diseases: list[DemoDisease] = []
    for path in sorted(CACHE_DIR.glob("*.json")):
        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)
        response = QueryResponse.model_validate(data)
        diseases.append(
            DemoDisease(
                disease=response.disease,
                slug=path.stem,
                candidate_count=len(response.candidates),
            )
        )
    return diseases
