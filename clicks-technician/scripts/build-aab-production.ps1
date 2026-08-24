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

# Release signing must be configured BEFORE the build. key.properties is gitignored,
# so it does not survive a fresh clone; without it the release build produces an
# unsignable/debug-signed AAB in the exact directory the Play upload reads from.
if (-not (Test-Path "android\key.properties")) {
    throw "android/key.properties missing - required for Play Store signing"
}
$storeFile = ""
Get-Content "android\key.properties" | ForEach-Object {
    if ($_ -match '^storeFile=(.+)$') { $storeFile = $matches[1].Trim() }
}
if (-not $storeFile) { throw "storeFile missing from android/key.properties" }
# gradle resolves storeFile relative to android/app (see app/build.gradle.kts).
$storePath = if ([System.IO.Path]::IsPathRooted($storeFile)) {
    $storeFile
} else {
    Join-Path $root "android\app\$storeFile"
}
if (-not (Test-Path $storePath)) {
    throw "Keystore not found at $storePath (storeFile in android/key.properties)"
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
