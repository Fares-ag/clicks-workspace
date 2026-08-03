# Build production AAB and upload to Google Play via the Play Developer API.
param(
    [ValidateSet("internal", "alpha", "beta", "production")]
    [string]$Track = "internal",
    [switch]$BuildOnly,
    [switch]$UploadOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$env:PLAY_STORE_TRACK = $Track

$creds = Join-Path $root "play-store\service-account.json"
$keyProps = Join-Path $root "android\key.properties"
$keystore = Join-Path $root "android\upload-keystore.jks"
$aab = Join-Path $root "build\app\outputs\bundle\release\app-release.aab"

if (-not $UploadOnly) {
    & (Join-Path $PSScriptRoot "build-aab-production.ps1")
}

if ($BuildOnly) {
    Write-Host "BuildOnly: skipping Play Store upload."
    exit 0
}

if (-not (Test-Path $creds)) {
    throw "Missing play-store/service-account.json — see PLAY_STORE.md"
}
if (-not (Test-Path $keyProps)) {
    throw "Missing android/key.properties — copy from key.properties.example"
}
if (-not (Test-Path $keystore)) {
    throw "Missing android/upload-keystore.jks — generate upload keystore (PLAY_STORE.md)"
}
if (-not (Test-Path $aab)) {
    throw "Missing AAB at build/app/outputs/bundle/release/app-release.aab — run build first"
}

$env:PLAY_STORE_JSON = $creds

Push-Location (Join-Path $root "android")
try {
    if (-not (Test-Path ".\gradlew.bat")) {
        throw "gradlew.bat not found in android/ — open android/ in Android Studio once to generate wrappers"
    }
    Write-Host "Uploading to Play Store track: $Track"
    & .\gradlew.bat publishReleaseBundle --no-daemon
    Write-Host "Upload complete."
}
finally {
    Pop-Location
}
