# Customer web on Chrome → local customer-tech API (real plan IDs, membership flags).
# Prerequisites: clicks-customer-tech-api/.env with MONGODB_URI (+ SkipCash keys to complete pay).
#
# Usage:
#   .\scripts\run-web-local-membership.ps1
#   .\scripts\run-web-local-membership.ps1 -SeedDemo    # also seed customer + vehicles
#   .\scripts\run-web-local-membership.ps1 -SkipApiStart  # API already running
param(
  [int]$WebPort = 8081,
  [int]$ApiPort = 5001,
  [switch]$SkipSeed,
  [switch]$SkipApiStart,
  [switch]$SeedDemo
)

$ErrorActionPreference = "Stop"
$userRoot = Split-Path $PSScriptRoot -Parent
$workspace = Split-Path $userRoot -Parent
$apiRoot = Join-Path $workspace "clicks-api"
$techApi = Join-Path $apiRoot "clicks-customer-tech-api"
$localApi = "http://127.0.0.1:$ApiPort"

function Test-TechApiUp {
  try {
    $r = Invoke-WebRequest -Uri "$localApi/api/health/live" -UseBasicParsing -TimeoutSec 4
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

$envFile = Join-Path $techApi ".env"
$sharedModules = Join-Path $apiRoot "clicks-shared\node_modules\axios"
if (-not (Test-Path $sharedModules)) {
  Write-Host "Installing clicks-shared dependencies (axios for outbox worker)..."
  Push-Location (Join-Path $apiRoot "clicks-shared")
  npm install | Out-Null
  Pop-Location
}

if (-not (Test-Path $envFile)) {
  Write-Host ""
  Write-Host "Missing: $envFile" -ForegroundColor Red
  Write-Host "Copy clicks-customer-tech-api\.env.example → .env and set MONGODB_URI (same DB as admin-api is fine)."
  Write-Host "Set LAUNCH_CUSTOMER_MEMBERSHIP=true and SkipCash vars to test payment."
  exit 1
}

if (-not $SkipApiStart -and -not (Test-TechApiUp)) {
  Write-Host "Starting customer-tech API on port $ApiPort (new window)..."
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$techApi'; npm run dev"
  ) | Out-Null
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    if (Test-TechApiUp) { break }
    Start-Sleep -Seconds 2
  }
  if (-not (Test-TechApiUp)) {
    throw "API did not respond at $localApi/api/health/live within 60s."
  }
  Write-Host "API is up at $localApi" -ForegroundColor Green
} elseif (Test-TechApiUp) {
  Write-Host "Using API at $localApi" -ForegroundColor Green
}

if (-not $SkipSeed) {
  Push-Location $apiRoot
  try {
    Write-Host "Seeding membership plans..."
    node scripts/seed-membership-plans.js
    if ($SeedDemo) {
      Write-Host "Seeding demo customer (33333333 / Customer123!)..."
      node scripts/seed-demo-data.js
    }
  } finally {
    Pop-Location
  }
}

$mapsKey = ""
$props = Join-Path $userRoot "android\local.properties"
if (Test-Path $props) {
  Get-Content $props | ForEach-Object {
    if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
  }
}

$procs = Get-NetTCPConnection -LocalPort $WebPort -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $procs) {
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

Set-Location $userRoot
$flutterArgs = @(
  "run", "-d", "chrome", "--web-port=$WebPort",
  "--dart-define=ENV=staging",
  "--dart-define=API_BASE_URL=$localApi",
  "--dart-define=SOCKET_URL=$localApi"
)
if ($mapsKey) {
  $flutterArgs += "--dart-define=GOOGLE_MAPS_API_KEY=$mapsKey"
}

Write-Host ""
Write-Host "Flutter → http://localhost:$WebPort" -ForegroundColor Cyan
Write-Host "API      → $localApi" -ForegroundColor Cyan
if (-not $SeedDemo) {
  Write-Host "Login: seed demo with -SeedDemo, or use your DB customer. Example: 33333333 / Customer123!" -ForegroundColor DarkGray
}
Write-Host ""

& "C:\Users\TS\flutter\bin\flutter.bat" @flutterArgs
