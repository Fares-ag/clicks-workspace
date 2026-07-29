# Clicks Business Portal

Flutter mobile app for dealership / partner staff to create and track roadside jobs.

## Login (demo)

| Field | Value |
|-------|--------|
| Email | `business@clicks.local` |
| Phone | `+97444440001` |
| Password | `Business123!` |
| Business | Al-Mana Showroom |

Seed the account (needs `MONGODB_URI` in `clicks-admin-api/.env`):

```powershell
cd C:\Users\TS\Downloads\clicks-api
node scripts/seed-business-portal.js
```

## API

Talks to **Admin API** (`/api/business/*`):

- Production: `https://clicks-admin-api-production.up.railway.app`
- Local emulator: `http://10.0.2.2:5000` (default when `ENV` is not `production`)

## Run / build

```powershell
cd C:\Users\TS\Downloads\clicks-business
flutter pub get
flutter run --dart-define=ENV=production

flutter build apk --release --dart-define=ENV=production
```

APK: `build\app\outputs\flutter-apk\app-release.apk`
