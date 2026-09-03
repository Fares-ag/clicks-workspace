# Play Store — clicks-admin

Package: `com.roya.clicks_admin`

## Internal testing track

1. Build signed release APK/AAB per [BUILD.md](./BUILD.md).
2. Upload to Google Play Console → **Internal testing**.
3. Add dispatch team emails as testers.
4. Verify FCM on a physical device (emulator FCM is unreliable).

## Required console setup

- App name: **Clicks Admin**
- Category: Business / Productivity
- Target audience: internal staff only (not public consumer app)
- Data safety: declare location (live map), account credentials, device identifiers (FCM)

## Signing

Uses the same `android/key.properties` upload keystore pattern as other Clicks Flutter apps. Release build fails closed without keystore — see `android/app/build.gradle.kts`.

## Permissions declared

- `INTERNET` — API + socket
- Optional location — not required for v1 (map uses technician coordinates only)

## Post-upload smoke test

Run [`../clicks-api/scripts/qa-admin-mobile-checklist.md`](../clicks-api/scripts/qa-admin-mobile-checklist.md) on the internal build before promoting to closed testing.
