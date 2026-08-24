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
$aab = Join-Path $root "build\app\outputs\bundle\release\app-release.aab"

# Validate credentials and signing config BEFORE building: checking them after
# the build leaves an improperly signed app-release.aab sitting in the exact
# directory the gradle play block uploads from, which a later -UploadOnly run
# would happily ship.
if (-not $BuildOnly) {
    if (-not (Test-Path $creds)) {
        throw "Missing play-store/service-account.json — see PLAY_STORE.md"
    }
}
if (-not (Test-Path $keyProps)) {
    throw "Missing android/key.properties — copy from key.properties.example"
}
$storeFile = ""
Get-Content $keyProps | ForEach-Object {
    if ($_ -match '^storeFile=(.+)$') { $storeFile = $matches[1].Trim() }
}
if (-not $storeFile) { throw "storeFile missing from android/key.properties" }
# gradle resolves storeFile relative to android/app (see app/build.gradle.kts).
$keystore = if ([System.IO.Path]::IsPathRooted($storeFile)) {
    $storeFile
} else {
    Join-Path $root "android\app\$storeFile"
}
if (-not (Test-Path $keystore)) {
    throw "Missing signing keystore at $keystore - generate upload keystore (PLAY_STORE.md)"
}

if (-not $UploadOnly) {
    # Never let a previous run's bundle survive into this one's upload.
    if (Test-Path $aab) { Remove-Item $aab -Force }
    & (Join-Path $PSScriptRoot "build-aab-production.ps1")
}

if ($BuildOnly) {
    Write-Host "BuildOnly: skipping Play Store upload."
    exit 0
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
