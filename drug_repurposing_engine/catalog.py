"""Load curated disease/pathogen ↔ drug catalog for ChemBrain recommender mode."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from drug_repurposing_engine.inference import validate_context

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "catalog"

CONDITION_FILES = ("diseases.json", "viruses.json", "bacteria.json", "parasites.json")

EVIDENCE_LEVELS = frozenset({"approved", "clinical", "preclinical", "hypothetical"})


@dataclass(frozen=True)
class Condition:
    """A disease, virus, bacterium, or parasite entry from the catalog."""

    id: str
    kind: str
    name: str
    synonyms: tuple[str, ...]
    category: str
    tags: tuple[str, ...]
    summary: str


@dataclass(frozen=True)
class DrugEntry:
    """Drug record including ChemBrain inference context fields."""

    drug_id: str
    context: dict[str, Any]
    tags: tuple[str, ...]


@dataclass(frozen=True)
class DrugLink:
    """Association between a condition and a drug."""

    condition_id: str
    drug_id: str
    evidence_level: str
    mechanism_tag: str


class Catalog:
    """In-memory catalog used by CLI and web UI."""

    def __init__(
        self,
        *,
        conditions: dict[str, Condition],
        drugs: dict[str, DrugEntry],
        links: list[DrugLink],
    ) -> None:
        self._conditions = conditions
        self._drugs = drugs
        self._links = links

    def get_condition(self, condition_id: str) -> Condition | None:
        key = condition_id.strip()
        return self._conditions.get(key) or self._conditions.get(key.lower())

    def get_drug(self, drug_id: str) -> DrugEntry | None:
        return self._drugs.get(drug_id.strip())

    def iter_conditions(self) -> list[Condition]:
        seen: set[str] = set()
        unique: list[Condition] = []
        for cond in self._conditions.values():
            if cond.id in seen:
                continue
            seen.add(cond.id)
            unique.append(cond)
        return sorted(unique, key=lambda c: (c.kind, c.name.lower()))

    def drugs_for_condition(self, condition_id: str) -> list[tuple[DrugEntry, DrugLink]]:
        out: list[tuple[DrugEntry, DrugLink]] = []
        for link in self._links:
            if link.condition_id != condition_id:
                continue
            drug = self._drugs.get(link.drug_id)
            if drug is None:
                continue
            out.append((drug, link))
        return out

    def resolve_condition(self, query: str) -> Condition | None:
        """Resolve by exact id first, then single best fuzzy match."""

        q = query.strip()
        if not q:
            return None

        q_lower = q.lower()
        if q_lower in self._conditions:
            return self._conditions[q_lower]

        for cid, cond in self._conditions.items():
            if cid == q:
                return cond

        matches = search_conditions(self, q, kind=None)
        if len(matches) == 1:
            return matches[0][0]
        if len(matches) > 1 and matches[0][1] > matches[1][1] + 5:
            return matches[0][0]
        return None


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _validate_link(link: dict[str, Any]) -> DrugLink:
    cid = str(link["condition_id"]).strip()
    did = str(link["drug_id"]).strip()
    level = str(link["evidence_level"]).strip().lower()
    if level not in EVIDENCE_LEVELS:
        raise ValueError(f"Invalid evidence_level {level!r} for link {cid}->{did}")
    return DrugLink(
        condition_id=cid,
        drug_id=did,
        evidence_level=level,
        mechanism_tag=str(link.get("mechanism_tag", "")).strip(),
    )


def _validate_drug_record(raw: dict[str, Any]) -> DrugEntry:
    drug_id = str(raw["id"]).strip()
    tags = tuple(str(t).strip() for t in raw.get("tags", []) if str(t).strip())
    context = {k: v for k, v in raw.items() if k not in {"id", "tags"}}
    validate_context(context)
    return DrugEntry(drug_id=drug_id, context=context, tags=tags)


def load_catalog(*, catalog_dir: Path | None = None) -> Catalog:
    """Load and validate all catalog JSON files."""

    base = catalog_dir or CATALOG_DIR
    conditions: dict[str, Condition] = {}

    for fname in CONDITION_FILES:
        path = base / fname
        if not path.exists():
            raise FileNotFoundError(f"Missing catalog file: {path}")
        payload = _load_json(path)
        for row in payload.get("conditions", []):
            cid = str(row["id"]).strip()
            synonyms = tuple(str(s).strip() for s in row.get("synonyms", []) if str(s).strip())
            tags = tuple(str(t).strip() for t in row.get("tags", []) if str(t).strip())
            cond = Condition(
                id=cid,
                kind=str(row["kind"]).strip().lower(),
                name=str(row["name"]).strip(),
                synonyms=synonyms,
                category=str(row.get("category", "")).strip(),
                tags=tags,
                summary=str(row.get("summary", "")).strip(),
            )
            conditions[cid] = cond
            conditions[cid.lower()] = cond

    drugs_path = base / "drugs.json"
    if not drugs_path.exists():
        raise FileNotFoundError(f"Missing catalog file: {drugs_path}")
    drugs_payload = _load_json(drugs_path)
    drugs: dict[str, DrugEntry] = {}
    for raw in drugs_payload.get("drugs", []):
        entry = _validate_drug_record(raw)
        drugs[entry.drug_id] = entry

    links_path = base / "links.json"
    if not links_path.exists():
        raise FileNotFoundError(f"Missing catalog file: {links_path}")
    links_raw = _load_json(links_path).get("links", [])
    links: list[DrugLink] = [_validate_link(row) for row in links_raw]

    canonical_conditions: dict[str, Condition] = {}
    for cond in conditions.values():
        canonical_conditions.setdefault(cond.id, cond)

    condition_lookup: dict[str, Condition] = {}
    for cond in canonical_conditions.values():
        condition_lookup[cond.id] = cond
        condition_lookup[cond.id.lower()] = cond

    for link in links:
        if link.condition_id not in canonical_conditions:
            raise ValueError(f"Unknown condition_id in links: {link.condition_id}")
        if link.drug_id not in drugs:
            raise ValueError(f"Unknown drug_id in links: {link.drug_id}")

    return Catalog(conditions=condition_lookup, drugs=drugs, links=links)


def search_conditions(catalog: Catalog, query: str, *, kind: str | None = None) -> list[tuple[Condition, float]]:
    """Return conditions ranked by simple fuzzy relevance score."""

    q = query.strip().lower()
    if not q:
        return []

    tokens = [t for t in re.split(r"\s+", q) if t]
    results: list[tuple[Condition, float]] = []

    for cond in catalog.iter_conditions():
        if kind and cond.kind.lower() != kind.lower():
            continue
        haystack = " ".join(
            [
                cond.id,
                cond.name.lower(),
                cond.category.lower(),
                " ".join(cond.synonyms).lower(),
                " ".join(cond.tags).lower(),
                cond.summary.lower(),
                cond.kind,
            ]
        )
        score = 0.0
        if q == cond.id.lower():
            score += 200
        if q in cond.name.lower():
            score += 80
        for syn in cond.synonyms:
            if q == syn.lower():
                score += 70
            elif q in syn.lower():
                score += 40
        for tok in tokens:
            if tok in haystack:
                score += 15 + len(tok) * 0.5
        if score > 0:
            results.append((cond, score))

    results.sort(key=lambda x: (-x[1], x[0].name.lower()))
    return results


def context_for_inference(entry: DrugEntry) -> dict[str, Any]:
    """Return a copy of the drug context suitable for `generate_drug_explanations`."""

    return dict(entry.context)
