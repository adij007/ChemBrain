# ChemBrain-v2 Operator Runbook

## Canonical Runtime

The live app path is:

```text
apps/web (React/TanStack/Vite) -> apps/api (Express BFF) -> JSON store
                                             | optional enrichment
                                             v
                                      services/core-api (FastAPI)
                                             | optional local narrative
                                             v
                                      Ollama OpenAI-compatible API
```

`apps/web` and `apps/api` are the canonical names. On this Windows checkout they are junctions to the historical folders `chem-discover-hub-main` and `backend-node`; use the `apps/*` commands anyway. `webapp` is legacy/demo Flask. `backend` is optional FastAPI enrichment, not the browser-facing API.

## Windows Startup

Use a PowerShell without a broken profile, or launch commands through `powershell.exe -NoProfile`.

Terminal 1, API:

```powershell
cd D:\ChemBrain-v2
$env:PORT="4100"
$env:JWT_SECRET="replace-with-a-strong-local-secret-at-least-32-chars"
$env:FRONTEND_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
$env:OPENAI_BASE_URL="http://localhost:11434/v1"
$env:OPENAI_API_KEY="ollama"
$env:OPENAI_MODEL="llama3:latest"
npm run dev:api
```

Terminal 2, frontend:

```powershell
cd D:\ChemBrain-v2
$env:VITE_API_BASE_URL="http://localhost:4100"
npm run dev:web
```

Terminal 3, optional local LLM:

```powershell
ollama serve
ollama pull llama3
```

Open `http://localhost:5173`.

## Health Checks

```powershell
curl http://localhost:4100/api/health
curl http://localhost:11434/api/tags
curl http://localhost:8000/health
```

Expected states:

- `dataStore.status = ok` is required.
- `coreApi.status = down` is allowed unless live enrichment is required.
- `ollama.status = ok` and `ollama.modelAvailable = true` are required only when `llmMode` is on.

## Troubleshooting

- Frontend shows network failure: verify `VITE_API_BASE_URL` and `curl http://localhost:4100/api/health`.
- Search returns no candidates: inspect the `enrichment` object in `/api/research/candidates`; transport failures are reported there instead of hidden.
- Cookie auth fails locally: use the same host in browser and API origin, preferably `localhost` for both.
- Mutation returns `CSRF_INVALID`: refresh/sign in again so the browser has a fresh `chembrain_csrf` cookie.
- LLM returns `LLM_NOT_CONFIGURED`: restart `apps/api` with `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`, and an installed `OPENAI_MODEL`.
- Vite dev crashes after route generation: stop stale Node/Vite listeners on `5173` and restart. The config disables the dep-optimizer race that caused this on Node 24.

## Quality Gates

```powershell
npm run build:api
npm run build:web
python -m unittest discover -s tests
```
