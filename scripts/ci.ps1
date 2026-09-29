# Local CI: build + optional API smoke
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "== LogHR CI =="
npm install --prefer-offline
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build -w @skillaz/shared
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build -w @skillaz/api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build -w @skillaz/web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Build OK"

try {
  $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -TimeoutSec 3
  if ($health.status -eq "ok") {
    Write-Host "API up - running smoke"
    node scripts/smoke-api.mjs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } else {
    Write-Host "API health unexpected - skip smoke"
  }
} catch {
  Write-Host "API not running - skip smoke (start API to validate)"
}

Write-Host "CI done"
