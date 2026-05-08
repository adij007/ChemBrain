# Drug Repurposing Intelligence Engine Backend

Prototype FastAPI backend for a cache-first drug repurposing demo. The backend
keeps a stable frontend/ML contract while allowing best-effort live API calls.

This is a research prototype, not medical advice or clinical decision support.

## Run locally

```bash
cd "/Users/isomalbanian/Documents/ChemBrain/backend"
source .venv/bin/activate
uvicorn app.main:app --reload
```

On Windows PowerShell:

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

## Endpoints

```text
GET /health
GET /demo-diseases
GET /query?disease=pancreatic%20cancer
GET /query?disease=pancreatic%20cancer&live=true
GET /query?disease=pancreatic%20cancer&live=true&refresh=true
```

Default behavior is cache-first. `live=true` allows the backend to call external
APIs if no cache exists. `refresh=true` bypasses cache, attempts a live refresh,
and writes the live result back to the cache.

Interactive docs are available at:

```text
http://127.0.0.1:8000/docs
```

Integrate clients against `GET /demo-diseases`, `GET /query`, and versioned
`GET /api/v1/*` as needed. For browser-facing deployments, prefer the Flask
gateway on port `5500` (see repository `RUNBOOK.md`), which proxies these APIs.

## Response shape

```json
{
  "disease": "pancreatic cancer",
  "source": "cache",
  "candidates": [
    {
      "drug": "Metformin",
      "approved_for": "Type 2 diabetes",
      "target": "AMPK / mTOR signaling axis",
      "ic50": "prototype evidence",
      "evidence_score": 0.91,
      "safety": "green",
      "composite_score": 0.85,
      "rationale": "...",
      "reaction_brief": "...",
      "structure_image_url": "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/metformin/PNG",
      "safety_detail": "...",
      "data_confidence": "..."
    }
  ],
  "warnings": []
}
```

## Demo cache

Cached demo diseases live in:

```text
backend/cache/diseases/
```

Current cached diseases:

- pancreatic cancer
- Alzheimer's disease
- Parkinson's disease
- SARS-CoV-2
- breast cancer

## Live API coverage

Implemented best-effort clients:

- Open Targets: disease to target mapping
- UniProt: protein enrichment
- ChEMBL target/activity/molecule: binding data plus `max_phase=4` filtering
- PubChem: molecule SMILES/formula/image
- OpenFDA: adverse event summary and coarse safety flag
- RCSB PDB: best-effort structure lookup and binding-site summary metadata

## ML handoff

The backend assembles a BioMedLM-ready context block for each live candidate and
stores it under `candidate.raw.biomedlm_context`. By default, the backend uses a
deterministic fallback explanation so the demo remains runnable without a local
model. To connect the ML teammate's model, expose a Python function:

```python
def generate_explanation(context: dict) -> dict:
    return {
        "rationale": "...",
        "reaction_brief": "...",
    }
```

Then run the backend with:

```bash
CHEMBRAIN_ML_MODULE=your_ml_module uvicorn app.main:app --reload
```

The context includes drug, disease, SMILES, molecular formula, inferred
functional groups, target/UniProt/pathway data, binding-site summary, assay
activity, Open Targets evidence score, approved indication, OpenFDA safety
summary, and the two prompt strings from the project specification.

Prototype-safe fallbacks:

- RCSB returns real candidate structure metadata when it can resolve a target,
  but exact ligand-pocket residues are still flagged as requiring deeper
  structure mapping before clinical interpretation.
- Sparse live results expand across additional Open Targets associations and
  then fall back to a lowered-confidence cached analogue when there is weak
  target/disease token similarity. This is intentionally conservative and marked
  as low-confidence in the response.

## Validate locally

```bash
cd "/Users/isomalbanian/Documents/ChemBrain/backend"
source .venv/bin/activate
PYTHONPATH=. python scripts/validate_backend.py
```
