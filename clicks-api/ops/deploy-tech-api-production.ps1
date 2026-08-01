# Deploy customer-tech-api to Railway production (clicks-tech-api service).
# Run from repo root: clicks-api/
#
# Prerequisites: railway CLI logged in, project linked to melodious-achievement.
#
# Before first deploy with maps/multi-job features, set on Railway:
#   GOOGLE_MAPS_API_KEY  — server key (Directions + Geocoding APIs)
#   JOB_START_MAX_METERS — default 200

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$techToml = @"
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.tech-api"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
"@

$adminToml = @"
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.admin-api"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
"@

Write-Host "Deploying clicks-tech-api to Railway production..."
Set-Content -Path "$root\railway.toml" -Value $techToml -Encoding utf8
try {
  railway up --service clicks-tech-api --detach
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Deploy triggered. Watch: railway logs --service clicks-tech-api"
} finally {
  Set-Content -Path "$root\railway.toml" -Value $adminToml -Encoding utf8
  Write-Host "Restored railway.toml to admin-api default."
}
