# Run customer web against production API (reads Maps key from android/local.properties).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$props = Join-Path $root "android\local.properties"
$mapsKey = ""
Get-Content $props | ForEach-Object {
  if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
}
if (-not $mapsKey) {
  $techProps = Join-Path (Split-Path $root -Parent) "clicks-technician\android\local.properties"
  if (Test-Path $techProps) {
    Get-Content $techProps | ForEach-Object {
      if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
    }
  }
}
if (-not $mapsKey) { throw "GOOGLE_MAPS_API_KEY missing in android/local.properties" }

$procs = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $procs) {
  if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

& "C:\Users\TS\flutter\bin\flutter.bat" run -d chrome --web-port=8080 `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=$mapsKey
