# Building clicks-admin

## Google Maps key (shared with web admin)

Read the same key as `clicks-interface`:

```powershell
$mapsKey = & "$PSScriptRoot/scripts/read-maps-key.ps1"
flutter run -d chrome --web-port=8084 `
  --dart-define=GOOGLE_MAPS_API_KEY=$mapsKey `
  --dart-define=API_BASE_URL=http://localhost:5000 `
  --dart-define=SOCKET_URL=http://localhost:5001
```

Android native map SDK also reads `GOOGLE_MAPS_API_KEY` via Gradle `manifestPlaceholders` (env var or `-PGOOGLE_MAPS_API_KEY=...`).

Add Flutter web localhost ports (8082–8084) to Google Cloud HTTP referrer restrictions alongside `https://admin.clicks.qa/*`.

## Production release (required flags)

Release builds **fail at launch** unless `ENV` is set explicitly.

```powershell
cd clicks-admin
flutter pub get
flutter build apk --release `
  --dart-define=ENV=production `
  --dart-define=GOOGLE_MAPS_API_KEY=YOUR_KEY
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`

| Service | Production URL (same as web admin) |
|---------|----------------------------------|
| Admin REST API | `https://admin-api.clicks.qa` |
| Socket / tech API | `https://tech-api.clicks.qa` |

Staging (same as `clicks-interface` on staging):

| Service | Staging URL |
|---------|-------------|
| Admin REST API | `https://stg-admin-api.clicks.qa` |
| Socket / tech API | `https://stg-tech-api.clicks.qa` |

### Optional overrides

```powershell
flutter build apk --release `
  --dart-define=ENV=production `
  --dart-define=API_BASE_URL=https://your-admin-api.example `
  --dart-define=SOCKET_URL=https://your-tech-api.example `
  --dart-define=GOOGLE_MAPS_API_KEY=YOUR_KEY
```

## Firebase (FCM background alerts)

1. Create a Firebase Android/iOS app for package `com.roya.clicks_admin`.
2. Add `google-services.json` under `android/app/`.
3. Add `GoogleService-Info.plist` under `ios/Runner/`.
4. Run `flutterfire configure` or copy `firebase_options.dart` from another Clicks app and update project IDs.

FCM gracefully no-ops when Firebase config is missing (socket + in-app alerts still work).

## Flutter web (Chrome) + production API

The web admin at **https://admin.clicks.qa** works because the browser origin matches
`CORS_ORIGINS` on admin-api. **Flutter web on `http://localhost:8083` does not** — the
production API rejects that origin, so login shows a connection/CORS error (not bad credentials).

**Option A — local APIs** (recommended for dev):

```powershell
# Terminal 1: start admin-api locally (NODE_ENV=development allows localhost CORS)
cd clicks-api/clicks-admin-api
npm run dev

flutter run -d chrome --web-port=8083 `
  --dart-define=API_BASE_URL=http://localhost:5000 `
  --dart-define=SOCKET_URL=http://localhost:5001
```

**Option B — dev-only Chrome** (hit production API from localhost):

```powershell
flutter run -d chrome --web-port=8083 --dart-define=ENV=production `
  --web-browser-flag=--disable-web-security `
  --web-browser-flag=--user-data-dir=$env:TEMP\flutter_admin_chrome_dev
```

**Option C — use the web admin** at https://admin.clicks.qa (same credentials, same backend).

Native Android/iOS builds are not affected by browser CORS.

## Local development (debug)

Defaults:

- REST → `https://stg-admin-api.clicks.qa` (same as web admin staging)
- Socket → `https://stg-tech-api.clicks.qa`

Local backends (admin-api :5000, tech-api :5001):

```powershell
flutter run -d chrome --web-port=8082 `
  --dart-define=API_BASE_URL=http://localhost:5000 `
  --dart-define=SOCKET_URL=http://localhost:5001
```

Against production from debug:

```powershell
flutter run --dart-define=ENV=production
```

## Store release checklist

See [`PLAY_STORE.md`](PLAY_STORE.md) and [`../clicks-api/scripts/qa-admin-mobile-checklist.md`](../clicks-api/scripts/qa-admin-mobile-checklist.md).
