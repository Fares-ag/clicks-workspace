# Customer web on Chrome — uses production API when staging DNS is unavailable.
# Staging (default flutter run) hits https://stg-tech-api.clicks.qa which may not resolve locally.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$mapsKey = ""
$props = Join-Path $root "android\local.properties"
if (Test-Path $props) {
  Get-Content $props | ForEach-Object {
    if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
  }
}

$procs = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $procs) {
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

$args = @(
  "run", "-d", "chrome", "--web-port=8080",
  "--dart-define=ENV=production"
)
if ($mapsKey) {
  $args += "--dart-define=GOOGLE_MAPS_API_KEY=$mapsKey"
}

& "C:\Users\TS\flutter\bin\flutter.bat" @args
