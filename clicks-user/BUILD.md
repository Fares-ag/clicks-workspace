# Building clicks-user

## Production release (required flags)

```powershell
cd clicks-user
flutter pub get
flutter build apk --release `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=YOUR_KEY `
  --dart-define=SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
```

Replace `SENTRY_DSN` with your project DSN from [sentry.io](https://sentry.io). Omit `--dart-define=SENTRY_DSN=...` entirely for local/staging builds — crash reporting stays disabled (no-op).

APK output: `build/app/outputs/flutter-apk/app-release.apk`

Production API: `https://clicks-tech-api-production.up.railway.app`

See also: `scripts/build-aab-production.ps1` (add `SENTRY_DSN` to the `--dart-define` list for production).

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
