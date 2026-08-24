# Deploy admin-api to Railway production (clicks-admin-api service).
# See RAILWAY_DEPLOY.md for one-time dashboard settings (config-as-code path).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

node "$root\scripts\check-railway-deploy.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node "$root\scripts\check-shared-deps.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying clicks-admin-api to Railway production..."
Write-Host "Ensure GOOGLE_MAPS_API_KEY is set on clicks-admin-api (Geocoding for job locations)."
railway up --service clicks-admin-api -c
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Deploy complete. Watch: railway logs --service clicks-admin-api"
