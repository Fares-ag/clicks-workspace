$ErrorActionPreference = "Continue"
$log = "C:\Users\TS\Downloads\clicks-api\ops\railway-tech-retry.log"
$root = "C:\Users\TS\Downloads\clicks-api"
Set-Location $root
$maxAttempts = 48
$delaySec = 900
for ($i = 1; $i -le $maxAttempts; $i++) {
  $ts = Get-Date -Format o
  Add-Content $log "[$ts] attempt $i/$maxAttempts"
  $toml = @"
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.tech-api"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
"@
  Set-Content -Path "$root\railway.toml" -Value $toml -Encoding utf8
  $out = railway up --service clicks-tech-api --detach 2>&1 | Out-String
  $code = $LASTEXITCODE
  Add-Content $log $out
  Add-Content $log "exit=$code"
  $adminToml = @"
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.admin-api"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
"@
  Set-Content -Path "$root\railway.toml" -Value $adminToml -Encoding utf8
  if ($code -eq 0 -and $out -notmatch "peak hours") {
    Add-Content $log "SUCCESS at $(Get-Date -Format o)"
    break
  }
  if ($i -lt $maxAttempts) {
    Add-Content $log "sleep ${delaySec}s..."
    Start-Sleep -Seconds $delaySec
  }
}
Add-Content $log "done at $(Get-Date -Format o)"
