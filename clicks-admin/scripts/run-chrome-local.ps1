# Enable Google Maps for local Chrome dev and run clicks-admin.
param(
  [int]$Port = 8085,
  [string]$ApiBase = "http://localhost:5000",
  [string]$SocketUrl = "http://localhost:5001"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

& (Join-Path $PSScriptRoot "enable-maps-web.ps1") -Quiet | Out-Null

# Read key without printing (from generated loader or local.properties)
$key = $env:GOOGLE_MAPS_API_KEY
if (-not $key) {
  $props = Join-Path $root "..\clicks-user\android\local.properties"
  if (Test-Path $props) {
    $line = Get-Content $props | Where-Object { $_ -match '^GOOGLE_MAPS_API_KEY=' } | Select-Object -First 1
    if ($line) { $key = ($line -replace '^GOOGLE_MAPS_API_KEY=', '').Trim() }
  }
}
if (-not $key) {
  $envFile = Join-Path $root "..\clicks-interface\.env"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*VITE_GOOGLE_MAPS_API_KEY\s*=' } | Select-Object -First 1
    if ($line) { $key = ($line -replace '^\s*VITE_GOOGLE_MAPS_API_KEY\s*=\s*', '').Trim().Trim('"').Trim("'") }
  }
}
if (-not $key) {
  Write-Error "Could not resolve Google Maps API key"
  exit 1
}

Set-Location $root
$flutter = "C:\Users\TS\flutter\bin\flutter.bat"
& $flutter pub get | Out-Null
& $flutter run -d chrome --web-port=$Port `
  --dart-define=API_BASE_URL=$ApiBase `
  --dart-define=SOCKET_URL=$SocketUrl `
  --dart-define=GOOGLE_MAPS_API_KEY=$key
