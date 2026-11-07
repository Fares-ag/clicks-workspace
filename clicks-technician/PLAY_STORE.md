# Play Store — automated publishing setup

Publish technician app updates to Google Play using the **Play Developer API** (via [Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher)).

**Package:** `com.clicks.tech` (Sanad Technician on Play Store)

---

## One-time Play Console setup

### 1. Create the app (if not already in Play Console)

1. Open [Google Play Console](https://play.google.com/console)
2. **Create app** → name e.g. *Clicks Technician*
3. Package name must match Play and Gradle: **`com.clicks.tech`** (`android/app/build.gradle.kts` → `applicationId`)

Complete required store listing items (description, screenshots, content rating, privacy policy) before promoting beyond internal testing.

### 2. Enable the Play Developer API (Google Cloud)

1. [Google Cloud Console](https://console.cloud.google.com) → create or select a project
2. **APIs & Services → Library** → enable **Google Play Android Developer API**
3. **IAM & Admin → Service accounts** → **Create service account** (e.g. `play-publisher`)
4. Open the account → **Keys → Add key → JSON** → download the file
5. Save as:

   ```
   clicks-technician/play-store/service-account.json
   ```

(Google removed the old Play Console **Setup → API access** page.)

### 3. Grant the service account access in Play Console

1. Play Console → **Settings** (gear) → **Users and permissions**
2. **Invite new users** → paste the service account email (`client_email` from the JSON)
3. Limit to **Sanad Technician** (`com.clicks.tech`) and grant:
   - **Release to testing tracks** (internal/alpha/beta), and/or
   - **Release to production** (when ready)
   - **View app information**

   Service accounts become **Active** without accepting an email invite.

### 4. Create an upload keystore

Run once (save passwords securely):

```powershell
cd clicks-technician/android
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Create `android/key.properties` from the example:

```powershell
Copy-Item key.properties.example key.properties
# Edit storePassword, keyPassword, keyAlias, storeFile
```

**Important:** Back up `upload-keystore.jks` and passwords. Loss blocks future updates.

Enable [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756) in Play Console — Google re-signs with the app signing key; you only need the upload key.

---

## Publish an update

### Bump version

In `pubspec.yaml`, increment the build number (required every upload):

```yaml
version: 1.2.3+16   # name+versionCode (versionCode must exceed Play production; prod was 15 / 1.2.2)
```

See [`play-store/RELEASE-1.2.3.md`](play-store/RELEASE-1.2.3.md) for release notes and rollout checklist.

### Build + upload

```powershell
cd clicks-technician
.\scripts\publish-play-store.ps1 -Track internal
```

Tracks:

| Track | Flag | Use |
|-------|------|-----|
| Internal testing | `-Track internal` | Fast QA (up to 100 testers) |
| Closed testing | `-Track alpha` or `beta` | Wider QA |
| Production | `-Track production` | Live users |

Build only (no upload):

```powershell
.\scripts\publish-play-store.ps1 -BuildOnly
```

Upload existing AAB:

```powershell
.\scripts\publish-play-store.ps1 -UploadOnly -Track internal
```

---

## Environment variables (CI / agent)

| Variable | Purpose |
|----------|---------|
| `PLAY_STORE_JSON` | Absolute path to service account JSON |
| `PLAY_STORE_TRACK` | `internal`, `alpha`, `beta`, or `production` |

For CI, store secrets outside git:

- Base64-encoded `service-account.json`
- Base64-encoded `upload-keystore.jks`
- `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS`

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `403 The caller does not have permission` | Invite service account under **Settings → Users and permissions** |
| `Version code X has already been used` | Bump `+N` in `pubspec.yaml` |
| `You need to use a different package name` | Listing must stay **`com.clicks.tech`** (Sanad Technician) |
| `App not found` | Create app in Play Console with matching package name first |
| Debug-signed release | Add `key.properties` + `upload-keystore.jks` |

---

## Files (gitignored secrets)

```
clicks-technician/
  play-store/service-account.json    ← Play API key
  android/key.properties             ← keystore config
  android/clicks-release.jks           ← upload signing key (path from key.properties)
```

After you place `service-account.json` and the upload keystore, say when ready and we can run the first internal upload.
