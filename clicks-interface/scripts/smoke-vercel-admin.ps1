# Smoke checks for Vercel-hosted Admin UI against production APIs.
# Usage: .\scripts\smoke-vercel-admin.ps1
#        .\scripts\smoke-vercel-admin.ps1 -AdminUrl https://your-app.vercel.app
param(
  [string]$AdminUrl = "https://admin.clicks.qa",
  [string]$AdminApi = "https://admin-api.clicks.qa",
  [string]$TechApi = "https://tech-api.clicks.qa"
)

$ErrorActionPreference = "Continue"
$failed = 0

function Check([string]$Name, [scriptblock]$Block) {
  try {
    & $Block
    Write-Host "PASS  $Name"
  } catch {
    Write-Host "FAIL  $Name - $($_.Exception.Message)"
    $script:failed++
  }
}

Check "Admin UI loads ($AdminUrl)" {
  $r = Invoke-WebRequest -Uri $AdminUrl -UseBasicParsing -TimeoutSec 20
  if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
  if ($r.Content -notmatch "root|Clicks|vite|script") { throw "unexpected HTML" }
}

Check "Admin SPA deep link rewrite (/jobs)" {
  $r = Invoke-WebRequest -Uri "$AdminUrl/jobs" -UseBasicParsing -TimeoutSec 20
  if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Check "Admin API health" {
  $r = Invoke-WebRequest -Uri "$AdminApi/api/health" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Check "Tech API health (sockets / Live Map)" {
  $r = Invoke-WebRequest -Uri "$TechApi/api/health" -UseBasicParsing -TimeoutSec 15
  if ($r.StatusCode -ne 200) { throw "status $($r.StatusCode)" }
}

Check "Admin API CORS allows Admin UI origin" {
  $headers = @{
    Origin = $AdminUrl.TrimEnd('/')
    "Access-Control-Request-Method" = "GET"
  }
  $r = Invoke-WebRequest -Uri "$AdminApi/api/health" -Method OPTIONS -Headers $headers -UseBasicParsing -TimeoutSec 15
  $allow = $r.Headers["Access-Control-Allow-Origin"]
  if (-not $allow) { throw "no Access-Control-Allow-Origin (set CORS_ORIGINS on VPS)" }
  Write-Host "      Allow-Origin: $allow"
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "Smoke finished with $failed failure(s)."
  exit 1
}
Write-Host "Automated smoke OK. Manually verify: login, jobs list, Live Map markers."
exit 0
