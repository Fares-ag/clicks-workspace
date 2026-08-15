# Build production release APKs for all Clicks mobile apps.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$flutter = "C:\Users\TS\flutter\bin\flutter.bat"
$outDir = Join-Path $root "release-apks"

if (-not (Test-Path $flutter)) { throw "Flutter not found at $flutter" }
if (-not $env:JAVA_HOME) {
    $jbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }
}

# Maps key for technician + customer (from technician local.properties)
$mapsKey = ""
$techProps = Join-Path $root "clicks-technician\android\local.properties"
if (Test-Path $techProps) {
    Get-Content $techProps | ForEach-Object {
        if ($_ -match '^GOOGLE_MAPS_API_KEY=(.+)$') { $mapsKey = $matches[1].Trim() }
    }
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Build-Apk {
    param(
        [string]$AppDir,
        [string]$OutName,
        [string[]]$ExtraArgs = @()
    )
    Write-Host "`n========== Building $OutName ==========" -ForegroundColor Cyan
    Push-Location (Join-Path $root $AppDir)
    try {
        & $flutter pub get
        $args = @("build", "apk", "--release", "--dart-define=ENV=production") + $ExtraArgs
        & $flutter @args
        if ($LASTEXITCODE -ne 0) { throw "flutter build failed for $AppDir" }
        $apk = Join-Path (Get-Location) "build\app\outputs\flutter-apk\app-release.apk"
        if (-not (Test-Path $apk)) { throw "APK not found: $apk" }
        Copy-Item $apk (Join-Path $outDir $OutName) -Force
        Write-Host "OK -> release-apks\$OutName" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

if (-not $mapsKey) { throw "GOOGLE_MAPS_API_KEY missing in clicks-technician/android/local.properties" }

Build-Apk "clicks-technician" "clicks-technician-production.apk" @(
    "--dart-define=GOOGLE_MAPS_API_KEY=$mapsKey"
)
Build-Apk "clicks-user" "clicks-customer-production.apk" @(
    "--dart-define=GOOGLE_MAPS_API_KEY=$mapsKey"
)
Build-Apk "clicks-business" "clicks-business-production.apk"
Build-Apk "clicks-partner" "clicks-partner-production.apk"

Write-Host "`nAll APKs written to: $outDir" -ForegroundColor Green
Get-ChildItem $outDir -Filter *.apk | Format-Table Name, Length, LastWriteTime
