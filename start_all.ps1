param(
  [int]$ApiPort = 4100,
  [int]$WebPort = 5173,
  [switch]$StartCoreApi
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Test-PortInUse {
  param([int]$Port)
  try {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $connection
  } catch {
    $netstat = cmd /c "netstat -ano | findstr :$Port"
    return -not [string]::IsNullOrWhiteSpace($netstat)
  }
}

Write-Host "ChemBrain canonical runtime"
Write-Host "  Web: apps/web -> http://localhost:$WebPort"
Write-Host "  API: apps/api -> http://localhost:$ApiPort"
Write-Host "  Core API: services/core-api (optional FastAPI enrichment)"
Write-Host "  Legacy Flask webapp: not started by default"

if (Test-PortInUse -Port $ApiPort) { Write-Host "Port $ApiPort is already listening; API may already be running." -ForegroundColor Yellow }
if (Test-PortInUse -Port $WebPort) { Write-Host "Port $WebPort is already listening; web may already be running." -ForegroundColor Yellow }
if (Test-PortInUse -Port 11434) { Write-Host "Ollama is reachable on port 11434." -ForegroundColor Green } else { Write-Host "Ollama is not listening on 11434. LLM mode will report an actionable error." -ForegroundColor Yellow }

Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "cd '$Root'; `$env:PORT='$ApiPort'; npm run api"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "cd '$Root'; `$env:VITE_API_BASE_URL='http://localhost:$ApiPort'; npm run web -- --host localhost --port $WebPort"

if ($StartCoreApi) {
  Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", "cd '$Root\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
}

Write-Host "Started canonical ChemBrain shells."
Write-Host "Health: http://localhost:$ApiPort/api/health"
