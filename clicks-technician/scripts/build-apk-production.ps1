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

# Firebase Android API key: lib/firebase_options.dart reads FIREBASE_ANDROID_API_KEY
# from --dart-define. Without it Firebase.initializeApp() gets an empty apiKey,
# the notification service disables itself and no FCM token is ever registered
# (no background job alerts). Same key as google-services.json "current_key".
$gs = Join-Path $root "android\app\google-services.json"
$fbKey = ""
if (Test-Path $gs) {
  $m = [regex]::Match((Get-Content $gs -Raw), '"current_key"\s*:\s*"([^"]+)"')
  if ($m.Success) { $fbKey = $m.Groups[1].Value.Trim() }
}
if (-not $fbKey) { throw "FIREBASE_ANDROID_API_KEY not found (android/app/google-services.json current_key)" }

& "C:\Users\TS\flutter\bin\flutter.bat" build apk --release `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=$mapsKey `
  --dart-define=FIREBASE_ANDROID_API_KEY=$fbKey

Write-Host "APK: build/app/outputs/flutter-apk/app-release.apk"
