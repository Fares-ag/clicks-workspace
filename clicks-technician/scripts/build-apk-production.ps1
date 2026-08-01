# Build production technician APK (reads Maps key from android/local.properties).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$props = Join-Path $root "android\local.properties"
$mapsKey = ""
Get-Content $props | ForEach-Object {
  if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
}
if (-not $mapsKey) { throw "GOOGLE_MAPS_API_KEY missing in android/local.properties" }

& "C:\Users\TS\flutter\bin\flutter.bat" build apk --release `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=$mapsKey

Write-Host "APK: build/app/outputs/flutter-apk/app-release.apk"
