# DEPRECATED — use GitHub Actions .github/workflows/deploy-production.yml instead.
# Tag a commit on main (v*) or run workflow_dispatch; do not retry `railway up` from a laptop.
$ErrorActionPreference = "Continue"
$log = "C:\Users\TS\Downloads\clicks-api\ops\railway-tech-retry.log"
$root = "C:\Users\TS\Downloads\clicks-api"
Set-Location $root
$maxAttempts = 48
$delaySec = 900
for ($i = 1; $i -le $maxAttempts; $i++) {
  $ts = Get-Date -Format o
  Add-Content $log "[$ts] attempt $i/$maxAttempts"
  # Build config comes from railway.tech.toml (this service's config-as-code
  # path in Railway). Never rewrite a shared railway.toml: clicks-admin-api
  # builds from the same directory and would pick up the tech Dockerfile.
  $out = railway up --service clicks-tech-api --detach 2>&1 | Out-String
  $code = $LASTEXITCODE
  Add-Content $log $out
  Add-Content $log "exit=$code"
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
