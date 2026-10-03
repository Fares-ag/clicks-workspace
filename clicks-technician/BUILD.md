# Building clicks-technician

## Production release (required flags)

```powershell
cd clicks-technician
flutter pub get
flutter build apk --release `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=YOUR_KEY `
  --dart-define=FIREBASE_ANDROID_API_KEY=YOUR_FIREBASE_ANDROID_KEY `
  --dart-define=SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
```

`FIREBASE_ANDROID_API_KEY` is **required**: `lib/firebase_options.dart` reads it via `--dart-define`. A build without it initializes Firebase with an empty API key, the notification service disables itself, and the app never registers an FCM token — no background job alerts (found in device QA on 2026-09-04). Use the `current_key` value from `android/app/google-services.json`; `scripts/build-apk-production.ps1` reads it automatically.

Replace `SENTRY_DSN` with your project DSN from [sentry.io](https://sentry.io). Omit `--dart-define=SENTRY_DSN=...` entirely for local/staging builds — crash reporting stays disabled (no-op).

APK output: `build/app/outputs/flutter-apk/app-release.apk`

Production API: `https://clicks-tech-api-production.up.railway.app`

See also: `scripts/build-apk-production.ps1` (add `SENTRY_DSN` to the `--dart-define` list for production).

## Local development (debug / profile)

No `--dart-define` needed — defaults to staging:

```powershell
flutter run
# API: https://stg-tech-api.clicks.qa
# Sentry: disabled (no DSN)
```

Run against production from a debug build:

```powershell
flutter run --dart-define=ENV=production
```
