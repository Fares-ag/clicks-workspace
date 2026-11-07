# Release to production (APIs on Railway via GitHub Actions).
# Prereqs: gh auth login, git push access, RAILWAY_TOKEN in GitHub secrets.
#
# Usage (from repo root):
#   .\clicks-api\ops\release-production.ps1
#   .\clicks-api\ops\release-production.ps1 -Tag v2026.10.31.1 -SkipTests

param(
  [string]$Tag = "",
  [switch]$SkipTests,
  [switch]$DeployInterface
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root

Write-Host "Repo: $root"

if (-not $SkipTests) {
  Write-Host "Running API integration tests..."
  Push-Location clicks-api
  npm run test:ci
  if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
  Pop-Location
}

Write-Host "CI preflight scripts..."
node scripts/check-status-labels.mjs
node clicks-api/scripts/check-query-hygiene.js
node clicks-api/scripts/check-railway-deploy.js
node clicks-api/scripts/check-shared-deps.js

$status = git status --porcelain
if ($status) {
  Write-Host "Uncommitted changes remain. Commit on main before tagging."
  git status -sb
  exit 1
}

git fetch origin main
if (-not (git merge-base --is-ancestor HEAD origin/main)) {
  Write-Error "HEAD is not on origin/main. Push to main first."
}

if (-not $Tag) {
  $Tag = "v$(Get-Date -Format 'yyyy.MM.dd').1"
}
Write-Host "Creating tag $Tag on $(git rev-parse --short HEAD)"
git tag -a $Tag -m "Production release $Tag"
git push origin main
git push origin $Tag

Write-Host "Tagged push triggers Deploy Production workflow (CI + Railway)."
Write-Host "Track: gh run list --workflow=deploy-production.yml"

if ($DeployInterface) {
  Write-Host "Deploying admin web to Vercel..."
  Push-Location clicks-interface
  if (-not (Test-Path ".vercel\project.json")) {
    Write-Error "Run vercel link in clicks-interface first (see VERCEL.md)."
  }
  npx vercel --prod --yes
  Pop-Location
}

Write-Host "Done. Mobile apps (clicks-user, clicks-admin, clicks-technician) are separate store releases — see each BUILD.md."
