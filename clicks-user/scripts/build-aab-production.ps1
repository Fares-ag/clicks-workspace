# Build production AAB for Google Play (reads Maps key from android/local.properties).
param(
    [string]$MapsKey = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $env:JAVA_HOME) {
    $jbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
}

if (-not (Test-Path "android\key.properties")) {
    throw "android/key.properties missing - required for Play Store signing"
}
if (-not (Test-Path "android\clicks-release.jks")) {
    throw "android/clicks-release.jks missing"
}

if (-not $MapsKey) {
    $props = Join-Path $root "android\local.properties"
    Get-Content $props | ForEach-Object {
        if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $MapsKey = $matches[1].Trim() }
    }
}
if (-not $MapsKey) { throw "GOOGLE_MAPS_API_KEY missing in android/local.properties" }

& "C:\Users\TS\flutter\bin\flutter.bat" build appbundle --release `
    --dart-define=ENV=production `
    --dart-define=GOOGLE_MAPS_API_KEY=$MapsKey

Write-Host "AAB: build/app/outputs/bundle/release/app-release.aab"
