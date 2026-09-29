# Bootstrap LogHR infra + DB
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "== LogHR bootstrap =="

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker не найден. Для локального Postgres пропустите docker и задайте DATABASE_URL в .env"
  Write-Host "winget install Docker.DockerDesktop"
} else {
  try {
    docker compose up -d postgres redis minio minio-init metabase
    Write-Host "Waiting for Postgres..."
    Start-Sleep -Seconds 8
  } catch {
    Write-Host "Docker compose недоступен — используем DATABASE_URL из .env"
  }
}

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example — поправьте DATABASE_URL при необходимости"
}

Copy-Item .env apps\api\.env -Force -ErrorAction SilentlyContinue

npm install
npm run build -w @skillaz/shared
npm run db:generate
npm run db:migrate
npm run db:seed

Write-Host ""
Write-Host "Done."
Write-Host "  npm run dev:clean   # освободить :3000/:3001"
Write-Host "  npm run dev:api"
Write-Host "  npm run dev:web"
Write-Host "Login: admin@loghr.local / admin123"
