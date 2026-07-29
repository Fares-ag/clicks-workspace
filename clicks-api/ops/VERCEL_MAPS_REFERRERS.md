# Google Maps referrers for Vercel Admin UI

Update the **browser** Maps API key (same key used as `VITE_GOOGLE_MAPS_API_KEY`).

## Steps

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Select the browser key used by Admin Live Map
3. Under **Application restrictions** → **HTTP referrers**, add:

```
https://admin.clicks.qa
https://admin.clicks.qa/*
https://*.vercel.app/*
```

(`*.vercel.app` is only needed for preview/deploy URLs before DNS cutover; you can remove it later.)

4. Under **API restrictions**, allow at least:
   - Maps JavaScript API

5. Save. Wait 1–5 minutes, then hard-refresh Live Map on https://admin.clicks.qa

## Do not

- Put this browser key in mobile apps without Android/iOS restrictions (technician APK uses the same key value today via dart-define / `local.properties` — prefer a separate Android-restricted key for production apps when you harden further).
