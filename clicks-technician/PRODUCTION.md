# Technician app — production release

## API dependency

Production APK/web talk to **`https://clicks-tech-api-production.up.railway.app`** when `ENV=production`.

Required on **clicks-tech-api** (Railway):

| Variable | Purpose |
|----------|---------|
| `GOOGLE_MAPS_API_KEY` | Server key with **Directions API** + **Geocoding API** (not browser-referrer restricted) |
| `JOB_START_MAX_METERS` | Start-job proximity (default `200`) |

Deploy latest customer-tech-api before shipping the app:

```powershell
cd clicks-api
.\ops\deploy-tech-api-production.ps1
```

Set missing Railway variables in the dashboard (Variables → `clicks-tech-api`), then verify:

```bash
node scripts/smoke-tech-production.js
# With technician JWT:
TECH_TOKEN=eyJ... node scripts/smoke-tech-production.js
```

## Release APK

From `clicks-technician/`:

```bash
flutter build apk --release \
  --dart-define=ENV=production \
  --dart-define=GOOGLE_MAPS_API_KEY=<android-maps-key>
```

- Android Maps SDK key: `android/local.properties` → `GOOGLE_MAPS_API_KEY=...`
- FCM: `android/app/google-services.json` (prod Firebase project)
- Output: `build/app/outputs/flutter-apk/app-release.apk`

## Release web (optional)

```bash
flutter run -d chrome --web-port=8081 \
  --dart-define=ENV=production \
  --dart-define=GOOGLE_MAPS_API_KEY=<browser-restricted-key>
```

Maps routing uses the **server proxy** (`/api/maps/*`); deploy tech-api with `GOOGLE_MAPS_API_KEY` first.

## Go-live checklist

- [ ] Deploy `clicks-tech-api` with maps + multi-job + activity-detail code
- [ ] Set `GOOGLE_MAPS_API_KEY` and `JOB_START_MAX_METERS` on Railway
- [ ] `node scripts/smoke-tech-production.js` passes (with `TECH_TOKEN`)
- [ ] Build APK with `ENV=production`
- [ ] Test: accept multiple jobs, start near location, Activity Details, Continue job
