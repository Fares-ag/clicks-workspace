# Add finance portal origins to clicks-admin-api CORS_ORIGINS on Railway.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$baseOrigins = @(
  "https://admin.clicks.qa",
  "https://clicks-interface.vercel.app",
  "https://business.clicks.qa",
  "https://clicks-business-web.vercel.app",
  "https://clicks-business-web-fmahmoud-4980s-projects.vercel.app",
  "https://clicks-finance-web.vercel.app",
  "https://finance.clicks.qa"
)

$newCors = ($baseOrigins -join ",")
Write-Host "Updating CORS_ORIGINS on clicks-admin-api..."
railway variables set "CORS_ORIGINS=$newCors" --service clicks-admin-api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "CORS updated with finance portal origins."
