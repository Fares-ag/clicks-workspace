# Building clicks-business

## Production release (required flags)

Release builds **fail at launch** unless `ENV` is set explicitly. Without it, the app would default to the Android-emulator URL `http://10.0.2.2:5000`.

```powershell
cd clicks-business
flutter pub get
flutter build apk --release --dart-define=ENV=production
```

APK output: `build/app/outputs/flutter-apk/app-release.apk`

Production API: `https://clicks-admin-api-production.up.railway.app`

### Optional override

Point at another HTTPS admin-api host (still requires `ENV=production`):

```powershell
flutter build apk --release `
  --dart-define=ENV=production `
  --dart-define=API_BASE_URL=https://your-admin-api.example
```

## Local development (debug / profile)

No `--dart-define` needed — defaults to staging emulator URL:

```powershell
flutter run
# API: http://10.0.2.2:5000
```

Run against production from a debug build:

```powershell
flutter run --dart-define=ENV=production
```
