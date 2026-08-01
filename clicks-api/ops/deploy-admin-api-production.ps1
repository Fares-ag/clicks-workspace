# Deploy admin-api to Railway production (clicks-admin-api service).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$adminToml = @"
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.admin-api"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
"@

Write-Host "Deploying clicks-admin-api to Railway production..."
Set-Content -Path "$root\railway.toml" -Value $adminToml -Encoding utf8
railway up --service clicks-admin-api --detach
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Deploy triggered. Watch: railway logs --service clicks-admin-api"
