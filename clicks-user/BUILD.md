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

Or use `scripts/run-web-dev.ps1` (Chrome on port 8080, production API).

### Local membership checkout (real plan IDs)

1. Copy `clicks-api/clicks-customer-tech-api/.env.example` → `.env` and set `MONGODB_URI`, `JWT_SECRET`, `LAUNCH_CUSTOMER_MEMBERSHIP=true`.
2. Optional: set `SKIPCASH_*` sandbox keys in the same `.env` to complete payment (see `clicks-api/scripts/qa-skipcash-membership-sandbox.md`).
3. From `clicks-user`:

```powershell
.\scripts\run-web-local-membership.ps1 -SeedDemo
```

This starts the customer-tech API if needed, seeds Basic/Plus plans, opens Chrome on **8081** pointing at `http://127.0.0.1:5001`. Log in with **33333333** / **Customer123!** after `-SeedDemo`.

Without `-SeedDemo`, run `node clicks-api/scripts/seed-demo-data.js` yourself if the DB has no test customer.
