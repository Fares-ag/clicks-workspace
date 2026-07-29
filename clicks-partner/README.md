# Clicks Partner

Standalone Flutter app for acquisition partners to track investment, period cap, and attributed job earnings.

This is its own project (same layout as `clicks-business`), not part of the business portal.

## API

Talks to **Admin API** (`/api/partner/*`):

- Production: `https://clicks-admin-api-production.up.railway.app`
- Staging default: `https://stg-admin-api.clicks.qa`
- Override: `--dart-define=API_BASE_URL=...`

Create partners in Admin → Partner Management. Partner **name** becomes the Google sub-source used for attribution.

## Run / build

```powershell
cd C:\Users\TS\Downloads\clicks-partner
flutter pub get
flutter run --dart-define=ENV=production

flutter build apk --release --dart-define=ENV=production
```

APK: `build\app\outputs\flutter-apk\app-release.apk`

## Identity

| | |
|--|--|
| Package / applicationId | `com.roya.clicks_partner` |
| iOS bundle | `com.roya.clicksPartner` |
| Dart package | `clicks_partner` |
