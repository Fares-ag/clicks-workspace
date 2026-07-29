# Production Vercel setup for clicks-interface.
# Prereq: npx vercel login (or `vercel login`) already completed.
# Usage (from clicks-interface root):
#   .\scripts\vercel-setup-prod.ps1
#   .\scripts\vercel-setup-prod.ps1 -MapsKey "AIza..."
param(
  [string]$MapsKey = "",
  [string]$ApiBase = "https://admin-api.clicks.qa/api",
  [string]$SocketUrl = "https://tech-api.clicks.qa",
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $MapsKey) {
  $envFile = Join-Path (Split-Path (Get-Location) -Parent) "clicks-interface\.env"
  if (-not (Test-Path $envFile)) {
    $envFile = Join-Path (Get-Location) ".env"
  }
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^VITE_GOOGLE_MAPS_API_KEY=' } | Select-Object -First 1
    if ($line) { $MapsKey = ($line -replace '^VITE_GOOGLE_MAPS_API_KEY=', '').Trim() }
  }
}

if (-not $MapsKey) {
  throw "Pass -MapsKey or set VITE_GOOGLE_MAPS_API_KEY in .env"
}

function Set-VercelEnv([string]$Name, [string]$Value) {
  Write-Host "Setting $Name (production)..."
  $Value | vercel env add $Name production --force 2>$null
  if ($LASTEXITCODE -ne 0) {
    # Older CLIs may not support --force; remove then add
    vercel env rm $Name production -y 2>$null
    $Value | vercel env add $Name production
  }
}

Write-Host "Linking project (non-interactive if already linked)..."
if (-not (Test-Path ".vercel\project.json")) {
  vercel link --yes
}

Set-VercelEnv "VITE_API_BASE_URL" $ApiBase
Set-VercelEnv "VITE_SOCKET_URL" $SocketUrl
Set-VercelEnv "VITE_GOOGLE_MAPS_API_KEY" $MapsKey
Set-VercelEnv "VITE_NODE_ENV" "production"
Set-VercelEnv "VITE_APP_NAME" "Clicks Interface"

Write-Host "Adding domain admin.clicks.qa (ignore if already added)..."
vercel domains add admin.clicks.qa 2>$null
vercel domains inspect admin.clicks.qa 2>$null

if (-not $SkipDeploy) {
  Write-Host "Deploying production..."
  vercel --prod --yes
}

Write-Host @"

Next (manual if CLI could not finish DNS):
1. Vercel dashboard → Domains → confirm DNS records for admin.clicks.qa
2. On VPS: bash scripts/apply-vercel-admin-cors.sh
3. Google Cloud: see clicks-api/ops/VERCEL_MAPS_REFERRERS.md
4. Smoke login + Live Map on https://admin.clicks.qa
"@
