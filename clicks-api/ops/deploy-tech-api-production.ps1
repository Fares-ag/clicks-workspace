# Deploy customer-tech-api to Railway production (clicks-tech-api service).
# See RAILWAY_DEPLOY.md for one-time dashboard settings (config-as-code path).
#
# Prerequisites: railway CLI logged in, project linked to melodious-achievement.
#
# Before first deploy with maps/multi-job features, set on Railway:
#   GOOGLE_MAPS_API_KEY  — server key (Geocoding for job location resolver)
#   JOB_START_MAX_METERS — default 200 (tech-api only)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

node "$root\scripts\check-railway-deploy.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node "$root\scripts\check-shared-deps.js"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Deploying clicks-tech-api to Railway production..."
railway up --service clicks-tech-api -c
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Deploy complete. Watch: railway logs --service clicks-tech-api"
