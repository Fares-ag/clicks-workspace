# App Store / Play Store readiness for clicks-user

Workspace snapshot: `c:\Users\TS\Downloads\clicks-workspace`, customer app `clicks-user` at version `1.1.6+16`. Notes answer what would fail review, fail upload, or ship dangerously if this working tree were submitted tomorrow. Local facts are cited to workspace files; store-policy facts are cited to official Google/Apple pages. Policy numbers are used only when they appear on those official pages.

## Android: google-services.json missing vs .broken; applicationId; signing; permissions; 16KB / target SDK; privacy policy; Data safety

### Takeaway
A Play upload of tomorrow’s tree is blocked first by missing release signing files, then by a missing real `google-services.json`. The package id is stable (`com.roya.clicks_user`). The customer app does **not** declare background location. Data safety must disclose precise location, phone number, and (if SkipCash is on) payment info; the hosted privacy policy exists as static HTML but is Android-worded.

### Cited Findings
- `clicks-user/android/app/google-services.json` is **not present**. Only `google-services.json.example` (placeholder project number / API key) and `google-services.json.broken` exist. The `.broken` file is two bytes (a blank line). — [google-services.json.example](clicks-user/android/app/google-services.json.example); [google-services.json.broken](clicks-user/android/app/google-services.json.broken); glob of `clicks-user/android/app/`
- Root `.gitignore` ignores `**/google-services.json` (and `**/GoogleService-Info.plist`). The Google Services Gradle plugin is applied **only if** `google-services.json` exists. — [.gitignore](.gitignore); [build.gradle.kts](clicks-user/android/app/build.gradle.kts)
- `applicationId` and `namespace` are `com.roya.clicks_user`. The example Firebase client uses the same package name. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts); [google-services.json.example](clicks-user/android/app/google-services.json.example)
- Release signing is fail-closed: Gradle throws if `android/key.properties` is missing on any Release task; `scripts/build-aab-production.ps1` throws if `android/key.properties` or `android/clicks-release.jks` is missing. Both files are gitignored (`**/key.properties`, `**/*.jks`) and were **not found** in the working tree. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts); [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1); [android/.gitignore](clicks-user/android/.gitignore)
- Play Publisher is wired to `play-service-account.json` (also gitignored, not in tree) and `track.set("alpha")`. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts); [.gitignore](.gitignore)
- Main manifest permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`, `CAMERA`. There is **no** `ACCESS_BACKGROUND_LOCATION`. `android:allowBackup="false"`, `android:usesCleartextTraffic="false"`. No App Links `intent-filter` besides `MAIN`/`LAUNCHER`. — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml)
- Location is requested at runtime via `Geolocator.requestPermission()` / `getCurrentPosition()` (when-in-use). No `requestAlwaysPermission` / `LocationPermission.always` call in `clicks-user`. — [welcome_service.dart](clicks-user/lib/features/welcome/logic/services/welcome_service.dart)
- Hosted privacy policy states the customer app requests **foreground / while-in-use location** and does **not** request background location. — [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- `CAMERA` is declared and `image_picker` is in `pubspec.yaml`, but there is **no** `ImagePicker` / `pickImage` usage in `clicks-user/lib`. Edit profile updates name/email only. — [pubspec.yaml](clicks-user/pubspec.yaml); [edit_profile_screen.dart](clicks-user/lib/features/settings/ui/view/edit_profile_screen.dart)
- 16 KB page size: Gradle already pins `androidx.datastore` to `1.2.1` because `libdatastore_shared_counter.so` in 1.1.7 failed Play’s 16 KB check. Flutter itself ships native `.so` files. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts)
- Official Play rule: apps targeting Android 15+ (API 35) that contain native code must support 16 KB page sizes on 64-bit devices; from **1 Feb 2027** non-compliant updates cannot be released. Original Play blog deadline was 1 Nov 2025. — [Android Developers Blog](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html); [Support 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes)
- `compileSdk = maxOf(flutter.compileSdkVersion, 37)`; `targetSdk = flutter.targetSdkVersion` (delegated to the installed Flutter SDK, not pinned in-repo). — [build.gradle.kts](clicks-user/android/app/build.gradle.kts)
- Official Play target API (as of the 2026 cycle): **from 31 Aug 2026**, new apps and updates must target **Android 16 (API 36)**; existing apps must target API 35+ to remain available to new users on newer OS versions. — [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk); [Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878)
- Play User Data policy: every app needs a public, non-geofenced, non-PDF privacy-policy URL in Play Console **and** a policy link or text in the app. Account-creating apps must also offer in-app deletion **and** an external web deletion URL; freezing an account is not deletion. — [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311); [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- Canonical hosted policy URL used by the repo’s Play compliance script: `https://admin.clicks.qa/privacy-policy.html`. The SPA route `/privacy-policy` is flagged as not crawlable. — [qa-play-store-compliance.js](clicks-api/scripts/qa-play-store-compliance.js); [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- In-app policy/terms load HTML from the tech API (`GET /api/content/privacy-policy`, `GET /api/content/terms-and-conditions`), not from that static URL. — [end_points.dart](clicks-user/lib/core/api/end_points.dart); [privacy_policy_screen.dart](clicks-user/lib/features/settings/ui/view/privacy_policy_screen.dart)
- Data safety implications from this binary’s actual collection: precise location (SOS/service pin), phone number (account), name/email, vehicle details, FCM token, job/payment records, optional SkipCash card checkout (`webview_flutter`), Sentry crash telemetry **if** DSN is compiled in. Location is shared with ops and the assigned technician during a job (policy text). — [privacy-policy.html](clicks-interface/public/privacy-policy.html); [skipcash_checkout_screen.dart](clicks-user/lib/features/home/skipcash_checkout_screen.dart); [sentry_config.dart](clicks-user/lib/core/monitoring/sentry_config.dart)
- Production QA (2026-11-13) recorded `flags.skipcash=false` and `customerMembership=false`. Card payment was still offered in the UI until a same-day unpushed fix. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

### Inferences
- Tomorrow’s working tree **cannot produce a Play-signed AAB** unless `key.properties` + `clicks-release.jks` exist on the build machine outside git. That is an upload blocker, not a review-policy blocker.
- A signed AAB built without restoring a real `google-services.json` **and** without `--dart-define=FIREBASE_ANDROID_API_KEY=...` will initialise Firebase with an empty Dart API key (`String.fromEnvironment` default). The technician app already shipped this class of bug (no FCM token). Customer `main.dart` swallows Firebase init failure, so the store binary would still launch — push would be dead.
- Unused `CAMERA` + `image_picker` is a Play “declare only what you use” / Data safety Photos risk: the permission is in the merged manifest even if the UI never opens the camera.
- 16 KB is **partially mitigated** (datastore pin) but **not proven**. Play App Bundle Explorer is the authority; native Flutter/Maps/Firebase `.so` files were not inspected in this pass.
- Target SDK compliance for a **13 Nov 2026** submission depends on the Flutter SDK on the build machine targeting API 36. The Gradle file does not pin 36; if the local Flutter still emits 35, Play can refuse the update under the 31 Aug 2026 rule.
- Data safety form: declare Approximate + Precise location (app functionality, shared with technicians/ops, collected while in use — not background); Phone number; Name; Email; User IDs; Device IDs (FCM); Crash logs (Sentry, if DSN present); Photos **only if** camera is actually used (today: do not claim Photos, and ideally drop the unused permission); Financial info / Purchases if SkipCash or membership is enabled in the shipped binary.

### Gaps
- Whether `key.properties` / `clicks-release.jks` exist on disk outside the repo (glob of the clicks-user tree found none).
- Whether production Play Console already has an app for `com.roya.clicks_user`, and whether the upload keystore matches it.
- Exact `flutter.targetSdkVersion` on this machine (not read; Flutter SDK not queried).
- Whether a 16 KB-aligned AAB was ever uploaded to Play’s App Bundle Explorer.
- Whether `https://admin.clicks.qa/privacy-policy.html` currently serves the same HTML as `clicks-interface/public/privacy-policy.html` (compliance script fetches it live; this pass did not).
- Whether production `GET /api/content/privacy-policy` matches the static HTML (in-app vs Play Console URL can diverge).

## iOS: bundle id, ATS, location strings, background modes, Push, SKAdNetwork, privacy manifest, account deletion, encryption export

### Takeaway
Bundle id is `com.roya.clicksUser` (team `TVSQU4RKRZ`), which does not match Android’s underscore id — expected, but Firebase/App Store records must use this exact string. There is no `PrivacyInfo.xcprivacy`, no `GoogleService-Info.plist` on disk, no entitlements file (`aps-environment`), no `ITSAppUsesNonExemptEncryption`, and Always-location usage strings without Always/background location use. In-app account deletion exists but the server **deactivates** first and anonymises after 30 days; the hosted policy does not state that delay and is written as covering Android apps only.

### Cited Findings
- `PRODUCT_BUNDLE_IDENTIFIER = com.roya.clicksUser` (Debug/Profile/Release). `DEVELOPMENT_TEAM = TVSQU4RKRZ`. `CODE_SIGN_STYLE = Automatic`. `IPHONEOS_DEPLOYMENT_TARGET = 16.6` on the Runner target (project-level default is 13.0). — [project.pbxproj](clicks-user/ios/Runner.xcodeproj/project.pbxproj)
- `DefaultFirebaseOptions.ios` uses `iosBundleId: 'com.roya.clicksUser'` and Firebase project `clicks-customer` / app id `1:405834083597:ios:71760a0df6eba119cd1444`. API key is `String.fromEnvironment('FIREBASE_IOS_API_KEY')` (empty unless dart-defined). — [firebase_options.dart](clicks-user/lib/firebase_options.dart)
- `ios/Runner/GoogleService-Info.plist` is **not on disk**. `project.pbxproj` still references it as a Resources build file. Root `.gitignore` ignores `**/GoogleService-Info.plist`. `CHANGES.md` claims a plist was added for a **different** Firebase project (`clicks-d2da9`, app id `1:1076454306293:ios:668dc0964f6913490a70bc`) — that contradicts current `firebase_options.dart`. — [ios/Runner listing](clicks-user/ios/Runner); [project.pbxproj](clicks-user/ios/Runner.xcodeproj/project.pbxproj); [CHANGES.md](clicks-user/CHANGES.md); [.gitignore](.gitignore)
- No `NSAppTransportSecurity` exception in `Info.plist` → default ATS (HTTPS only). Android similarly sets `usesCleartextTraffic=false`. Release `AppConfig` also refuses non-HTTPS API URLs. — [Info.plist](clicks-user/ios/Runner/Info.plist); [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml); [app_config.dart](clicks-user/lib/core/config/app_config.dart)
- Location usage strings: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, and `NSLocationAlwaysUsageDescription` all say “connect you with nearby roadside assistance providers.” Camera/photo strings are generic (“take photos” / “upload images”). — [Info.plist](clicks-user/ios/Runner/Info.plist)
- `UIBackgroundModes` contains only `remote-notification`. No `location` background mode. No `Runner.entitlements` / `aps-environment` file in `ios/Runner`. — [Info.plist](clicks-user/ios/Runner/Info.plist); glob of `clicks-user/ios`
- `AppDelegate.swift` provides the Maps key from Info.plist; it does not register for remote notifications beyond inheriting `FlutterAppDelegate`. — [AppDelegate.swift](clicks-user/ios/Runner/AppDelegate.swift)
- No `SKAdNetworkItems` anywhere in the workspace. Apple documents this key as needed when the app **displays ads** and shares install-validation with ad networks. — [SKAdNetworkItems](https://developer.apple.com/documentation/BundleResources/Information-Property-List/SKAdNetworkItems); workspace grep
- No `PrivacyInfo.xcprivacy` in `clicks-user`. Apple required approved reasons for required-reason APIs in the app’s privacy manifest from **1 May 2024**, and valid third-party SDK manifests (commonly used SDKs) from **12 Feb 2025**. Invalid manifests cause App Store Connect to reject the upload. — [Privacy updates for App Store submissions](https://developer.apple.com/news/?id=3d8a9yyh); [Adding a privacy manifest](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk.md)
- Account deletion: Settings → profile sheet → “Delete Account” calls `POST /api/customers/delete`. Server sets `status = "Inactive"`, `deleted_at`, clears `fcm_token`, bumps `token_version`, cancels memberships with `forfeit_no_refund`. PII is tombstoned only after `CUSTOMER_ANONYMISE_AFTER_DAYS` (default 30). Re-registering the same phone **restores** the account during that window. — [settings_cubit.dart](clicks-user/lib/features/settings/ui/cubit/settings_cubit.dart); [customerController.js](clicks-api/clicks-customer-tech-api/src/controllers/customerController.js); [anonymiseDeletedCustomers.js](clicks-api/clicks-shared/services/anonymiseDeletedCustomers.js); [customer-deletion-guards.integration.test.js](clicks-api/tests/integration/customer-deletion-guards.integration.test.js)
- Apple guideline **5.1.1(v)**: apps that support account creation must let users **initiate deletion in the app**; “only offering to temporarily deactivate or disable an account is insufficient.” Delayed completion is allowed if users are told timing and what is retained. — [5.1.1(v) offering account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/); [Account deletion requirement starts June 30](https://developer.apple.com/news/?id=12m75xbj)
- Hosted privacy policy lists **Android** packages only (“It applies to these Android applications”), names `com.roya.clicks_user`, and does **not** mention the 30-day anonymise delay. Contact: `support@sanad.qa`. — [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- Web deletion page `clicks-interface/src/pages/AccountDeletionPage.jsx` is titled “Delete your **Sanad Technician** account” and posts `appName: "Sanad Technician"`. Privacy policy still links `https://admin.clicks.qa/account-deletion`. — [AccountDeletionPage.jsx](clicks-interface/src/pages/AccountDeletionPage.jsx); [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- No `ITSAppUsesNonExemptEncryption` key in `Info.plist`. App Store Connect will ask export-compliance questions on every upload until it is set. HTTPS/TLS via OS networking is typically exempt; Apple documents setting the Info.plist key to skip the questionnaire when no extra documentation is required. — [Info.plist](clicks-user/ios/Runner/Info.plist); [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
- No in-app StoreKit / IAP. SkipCash membership/job card pay is a WebView to an external PSP. Production flags currently have membership and SkipCash **off**. Enabling iOS membership as a digital subscription via SkipCash would collide with Apple’s paid-digital-content rules (not numbered here; not fetched in full). — [skipcash_checkout_screen.dart](clicks-user/lib/features/home/skipcash_checkout_screen.dart); [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)

### Inferences
- iOS review is more likely to **accept the binary** than Android is to **accept an unsigned/mis-signed AAB**, but iOS **push will not work** without a real plist or dart-defined iOS Firebase key **plus** an APNs key in Firebase **plus** the Push Notifications entitlement (`aps-environment`).
- Always-location usage strings without requesting Always or declaring the location background mode are leftover. They can confuse App Review (“why do you need Always?”) but are not themselves a 16 KB / upload hard fail. Safer to drop Always keys if when-in-use is all that is used.
- Generic camera/photo usage strings + unused `image_picker` are a 5.1.1 purpose-string / unused-API review niggle. Either use them (profile photos) or remove the plugin and strings.
- Privacy manifest: Flutter plugins (`geolocator`, `shared_preferences`, `firebase_*`, `sentry_flutter`, `flutter_secure_storage`) usually ship their own `PrivacyInfo.xcprivacy`. Missing **app-level** file is not automatically fatal, but an archive that pulls an SDK on Apple’s “commonly used” list **without** a valid manifest **will** fail upload. This tree has not been archived to verify.
- Account deletion: the in-app entry point satisfies the “initiate in-app” bar. The 30-day restore/anonymise window can still fail 5.1.1(v) / Play User Data if reviewers treat `status=Inactive` as a freeze **and** the privacy policy never discloses the delay or retained job/receipt records.
- Play’s required **web** deletion URL cannot be the current technician-branded `/account-deletion` page as-is.

### Gaps
- Whether team `TVSQU4RKRZ` owns an App Store Connect app with bundle `com.roya.clicksUser`, Push capability, and a Distribution certificate.
- Whether an APNs auth key is uploaded to Firebase project `clicks-customer`.
- Whether CocoaPods/Flutter plugins in this tree already embed valid privacy manifests (would only show in an `flutter build ipa` / privacy report).
- Legal view on whether 30-day restore + accounting retention of jobs/receipts meets Apple/Play “delete associated personal data.”
- Full text of App Store Review Guideline 3.1.1 (IAP) was not fetched; membership-via-SkipCash on iOS is flagged only as a future risk while flags are off.

## Forced update / min_app_version null on production public config

### Takeaway
The forced-update **mechanism is in the first store build** (splash + 426 gate), which is what scenario 19 required. Production currently serves `min_app_version` and `store_url` as **null for both platforms**, so a bad build that reaches the store **cannot be recalled** from the server until those env vars are set — and `store_url` must be the real listing URLs, which do not exist until after first submission.

### Cited Findings
- Scenario 19 (launch blocker in the failure-scenario doc): there used to be no minimum-version check; the correct behaviour is `X-App-Version` on every request, a public min-version, and a blocking update screen, **in the first store build**, because it cannot be added afterwards. The scenario file still labels the original bug “NOT HANDLED” even though the header is marked fixed. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §19
- Client: splash calls `PublicConfig.load()` first; `updateRequired` is true only when server min version is non-empty **and** `compareVersions(appVersionName, min) < 0`. Empty/null min → **no block**. 426 from the API also opens the same screen. “Update now” is hidden when `store_url` is null. — [public_config.dart](clicks-user/lib/core/config/public_config.dart); [splash_screen.dart](clicks-user/lib/features/splash/splash_screen.dart); [force_update_screen.dart](clicks-user/lib/features/splash/force_update_screen.dart); [dio_helper.dart](clicks-user/lib/core/api/dio_helper.dart)
- Server: `min_app_version` / `store_url` come from `MIN_APP_VERSION_IOS`, `MIN_APP_VERSION_ANDROID`, `APP_STORE_URL_IOS`, `APP_STORE_URL_ANDROID`. Unset → `null`. Requests **without** `X-App-Version`/`X-Platform` are never gated. — [appVersion.js](clicks-api/clicks-customer-tech-api/src/utils/appVersion.js); [configRoutes.js](clicks-api/clicks-customer-tech-api/src/routes/configRoutes.js)
- Production QA 2026-11-13: `/api/config/public` is live, but `min_app_version` and `store_url` are **null for both platforms**, “so a forced update cannot be triggered yet.” Listed as unfixed. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- App version constant is `1.1.6+16`, aligned with `pubspec.yaml`. Dio sends `X-App-Version: 1.1.6` and `X-Platform`. — [app_config.dart](clicks-user/lib/core/config/app_config.dart); [pubspec.yaml](clicks-user/pubspec.yaml); [dio_helper.dart](clicks-user/lib/core/api/dio_helper.dart)

### Inferences
- Submitting tomorrow does **not** fail review because min version is null. It **ships dangerously**: after users install `1.1.6+16`, the only kill-switch is setting `MIN_APP_VERSION_*` **above** 1.1.6 **and** `APP_STORE_URL_*` to real store links. Until the listing exists, `store_url` cannot point anywhere useful, so even a 426 screen would show “call support” without an Update button.
- Setting min version **equal** to 1.1.6 does nothing (`compareVersions` is strict `<`). To brick a bad `1.1.6` you must ship `1.1.7` (or higher) to the store first, then set min to that. A bad first build has no successor to send people to.
- Scenario 19’s original launch-blocker intent is met **in code**, unmet **in production config**. That matches the user’s recollection.

### Gaps
- Live `GET https://clicks-tech-api-production.up.railway.app/api/config/public` was not re-fetched in this pass; the 2026-11-13 QA note is the latest production observation.
- Whether App Store / Play listing URLs already exist from a prior closed test.

## Crash reporting: Sentry DSN required for production builds per BUILD.md

### Takeaway
`BUILD.md` tells you to pass `SENTRY_DSN` for production; omitting it is a silent no-op. The Play AAB script **does not pass SENTRY_DSN**. Shipping tomorrow via that script means **zero client crash reports** in production.

### Cited Findings
- `BUILD.md` production command includes `--dart-define=SENTRY_DSN=...` and says to omit it for local/staging (crash reporting stays disabled). It also says `scripts/build-aab-production.ps1` should “add `SENTRY_DSN` to the `--dart-define` list for production.” — [BUILD.md](clicks-user/BUILD.md)
- `build-aab-production.ps1` passes only `ENV=production` and `GOOGLE_MAPS_API_KEY`. No `SENTRY_DSN`, no `FIREBASE_*`. — [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1)
- `AppConfig.sentryDsn` defaults to empty; `isSentryEnabled` is false then; `SentryConfig.initIfEnabled()` returns immediately. PII scrubbing exists (Bearer tokens, `+974` phones, lat/lng) for when it **is** enabled. — [app_config.dart](clicks-user/lib/core/config/app_config.dart); [sentry_config.dart](clicks-user/lib/core/monitoring/sentry_config.dart)
- `README.md` calls Sentry “optional.” — [README.md](clicks-user/README.md)
- API-side `SENTRY_DSN` unset is a **warning**, not a boot failure. — [assertProductionConfig.js](clicks-api/clicks-shared/utils/assertProductionConfig.js)

### Inferences
- This is not a store-rejection item. It is an operational “ship dangerously”: a crashing production binary is invisible. The technician app learned an analogous lesson with a missing `FIREBASE_ANDROID_API_KEY` dart-define.
- If they follow `BUILD.md` (apk) they get Sentry; if they follow the AAB script they do not. The two docs disagree in practice.

### Gaps
- Whether a Sentry project/DSN for `clicks_user` actually exists (no DSN in repo, by design).
- Whether Railway APIs have `SENTRY_DSN` set (out of this app’s tree).

## Deep links / universal links / app links

### Takeaway
There are **none**. No custom URL scheme, no Associated Domains, no Android App Links `intent-filter` with a host, no `apple-app-site-association` / `assetlinks.json` in this workspace. Job deep-linking is FCM notification tap routing only. That does not fail store review by itself; it means store listing / SkipCash return URLs / password-reset links cannot open the app.

### Cited Findings
- Android `MAIN`/`LAUNCHER` is the only activity intent-filter. `<queries>` allows https/http/tel for `url_launcher`, which is not App Links. — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml)
- iOS `Info.plist` has no `CFBundleURLTypes` and no associated-domains entitlements file. — [Info.plist](clicks-user/ios/Runner/Info.plist)
- Workspace glob found no `apple-app-site-association`, `assetlinks.json`, or `.entitlements` under `clicks-user`.
- Notification taps are handled in `FCMNotificationService` / `CustomerNotificationRouter` (cold start included). — [fcm_notification_service.dart](clicks-user/lib/core/services/fcm_notification_service.dart); [main.dart](clicks-user/lib/main.dart)
- SkipCash checkout uses `url_launcher` / `webview_flutter` with a `returnUrl` argument, not a registered app link. — [skipcash_checkout_screen.dart](clicks-user/lib/features/home/skipcash_checkout_screen.dart)

### Inferences
- Reviewers do not require Universal Links for a roadside app. The danger is product: email/SMS “open this job”, SkipCash 3-D Secure return, and future marketing links will land in the browser, not the session screen.
- Force-update “Update now” depends on `store_url` http(s) launched externally — that path does not need App Links.

### Gaps
- Whether SkipCash’s `returnUrl` is an https page that the WebView can intercept (code exists; production SkipCash is off, so untested on device per QA).

## Firebase / FCM: web vs device; is push required for the job lifecycle?

### Takeaway
Push is **not required** for an in-foreground / socket-connected job (QA ran the full SOS lifecycle in headless Chrome with no FCM). Push **is required** for lock-screen / killed-app updates, which is the iPhone-majority case (scenario 69). Tomorrow’s device build, as configured, is very likely to ship **without working FCM**. Web Firebase is explicitly unsupported.

### Cited Findings
- `DefaultFirebaseOptions.currentPlatform` **throws** on web (“have not been configured for web”). `main.dart` catches Firebase init failure and continues. — [firebase_options.dart](clicks-user/lib/firebase_options.dart); [main.dart](clicks-user/lib/main.dart)
- Android google-services plugin is skipped without `google-services.json`. Dart still passes `FirebaseOptions` with empty `apiKey` unless `FIREBASE_ANDROID_API_KEY` / `FIREBASE_IOS_API_KEY` are dart-defined. Customer `BUILD.md` and `build-aab-production.ps1` do **not** pass those defines (technician `BUILD.md` / `build-apk-production.ps1` do, after a 2026-09-04 P0). — [build.gradle.kts](clicks-user/android/app/build.gradle.kts); [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1); [clicks-technician/BUILD.md](clicks-technician/BUILD.md); [qa-tech-intensive-report-2026-09-04.md](clicks-api/scripts/qa-tech-intensive-report-2026-09-04.md)
- QA 2026-11-13: push “not testable”; `google-services.json` missing; logout on web hung because `FCMNotificationService.deleteToken()` threw when Firebase was not initialised; author warned Android without `google-services.json` is “very likely affected too.” Logout path still `await`s `deleteToken()` with **no timeout** (account-inactive screen has a 5s timeout; logout does not). — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [settings_screen.dart](clicks-user/lib/features/settings/ui/view/settings_screen.dart); [account_inactive_screen.dart](clicks-user/lib/features/splash/account_inactive_screen.dart)
- Job lifecycle on web (no FCM): SOS create → dispatch → track → cash pay → complete → rate **passed**. Session API matched the screen. Device-only GPS prompts and push were not exercised. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Scenario 69: iOS does not show data-only FCM while backgrounded/killed. Server `buildCustomerPushMessage` now sends `notification` + `apns` alert + Android channel `clicks_customer_channel`. Still “needs a real-iPhone check.” Launch blocker in the scenario doc. — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §69; [fcmService.js](clicks-api/clicks-customer-tech-api/src/services/fcmService.js)
- Server customer push is a no-op unless `FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON` is set (`initCustomerFirebase`). Separate from the technician JSON. No token → `[fcm] no fcm_token for customer — skip push`. — [fcmService.js](clicks-api/clicks-customer-tech-api/src/services/fcmService.js)
- One `fcm_token` field per customer; last device wins (scenario 15). — [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §15

### Inferences
- Store review does not require working FCM. **Shipping without it is dangerous** for SOS: a customer who backgrounds the app will not see “technician assigned / arrived” unless the socket is still alive. QA’s passing lifecycle does not contradict that.
- The customer app has the same dart-define footgun the technician app already hit, **plus** a missing `google-services.json`, **plus** a missing iOS plist. Using the AAB script as-is reproduces the technician P0.
- Logout/delete-token without timeout is a device risk if Firebase hangs (iOS `flutter_local_notifications` already hung `initialize()` once; that is why FCM init was moved off the `runApp` path).

### Gaps
- Whether Railway has `FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON` set (server can be healthy and still skip every customer push).
- Real-device FCM on iOS/Android for this working tree: explicitly untested as of 2026-11-13.

## Legal pages in-app vs hosted (privacy, terms, support phone)

### Takeaway
Privacy and terms exist **in-app** (API-fetched HTML) and **hosted** (static HTML + SPA). Play Console must use the static `.html` URL, not the SPA. Support phone on production public config is **null**; the app falls back to a hardcoded `+97470919191` copied from a receipt PDF. The hosted deletion page is technician-only. Register does not require accepting terms.

### Cited Findings
- Settings Legal section opens `PrivacyPolicyScreen` / `TermsAndConditionsScreen`, which render `HtmlWidget` of API content. Empty content → `settings.no_content`. Offline/error → retry, not a bundled fallback. — [settings_screen.dart](clicks-user/lib/features/settings/ui/view/settings_screen.dart); [privacy_policy_screen.dart](clicks-user/lib/features/settings/ui/view/privacy_policy_screen.dart); [terms_conditions_screen.dart](clicks-user/lib/features/settings/ui/view/terms_conditions_screen.dart)
- Hosted: `clicks-interface/public/privacy-policy.html` (static, crawlable) and SPA `PrivacyPolicyPage.jsx` fetching admin `GET /privacy-policy/active`. Compliance script: use `/privacy-policy.html` in Play Console. — [privacy-policy.html](clicks-interface/public/privacy-policy.html); [PrivacyPolicyPage.jsx](clicks-interface/src/pages/PrivacyPolicyPage.jsx); [qa-play-store-compliance.js](clicks-api/scripts/qa-play-store-compliance.js)
- Static policy effective **4 Aug 2026**, version 2.2, entity **Sanad RSA**, covers technician `com.clicks.tech` and customer `com.roya.clicks_user`, discloses location (background for technician only), HTTPS/TLS, “do not sell,” contact `support@sanad.qa`. Does not mention iOS / `com.roya.clicksUser`. Does not mention 30-day anonymisation. Mentions “profile photo” collection; customer edit-profile does not pick photos. — [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- Play requires the Play listing’s developer/app name to appear in the policy. The policy names Sanad RSA / Clicks / the Android package. — [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- `PublicConfig.fallbackSupportPhone = '+97470919191'` with comment “confirm with ops before launch.” Production QA: `support_phone` is null; app uses the built-in number. — [public_config.dart](clicks-user/lib/core/config/public_config.dart); [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Register step two is email only; no terms checkbox in that widget. — [register_step_two_view.dart](clicks-user/lib/features/auth/register/ui/view/widgets/register_step_two_view.dart)
- Account deletion web form is technician-branded (see iOS section).

### Inferences
- Play review can pass if Console is pointed at `https://admin.clicks.qa/privacy-policy.html` **and** that URL is up. Pointing at `/privacy-policy` (SPA shell) is a known fail in their own QA script.
- App Store privacy policy URL pointing at an “Android applications” document is a review/metadata mismatch for iOS.
- A hardcoded support number on a first public build is not a reject; a **wrong** number (unconfirmed receipt PDF) is an operational incident during SOS.
- Missing in-register terms acceptance is a legal/UX gap, not a documented Apple/Google automatic reject (stores require the policy to be reachable, not a checkbox).

### Gaps
- Live content of production `GET /api/content/privacy-policy` and `/api/content/terms-and-conditions` vs the static HTML.
- Whether `SUPPORT_PHONE` / admin ops setting has been filled since 2026-11-13.
- Whether register later screens include a terms link (step two does not).

## What BUILD.md and build-aab-production.ps1 actually require

### Takeaway
Two different production recipes. `BUILD.md` is an APK command with `ENV`, Maps key, and Sentry. The AAB script is the Play path: it fail-closes on signing + Maps key, points at production API, and **omits Sentry and Firebase keys**. Neither restores `google-services.json`. Release Dart code additionally throws if `ENV` is missing or the API URL is non-HTTPS/local.

### Cited Findings
- `BUILD.md` required flags for production APK: `flutter pub get`; `flutter build apk --release --dart-define=ENV=production --dart-define=GOOGLE_MAPS_API_KEY=YOUR_KEY --dart-define=SENTRY_DSN=...`. Output `build/app/outputs/flutter-apk/app-release.apk`. Production API `https://clicks-tech-api-production.up.railway.app`. Sentry may be omitted for staging. Points at `scripts/build-aab-production.ps1` “add SENTRY_DSN … for production.” — [BUILD.md](clicks-user/BUILD.md)
- `build-aab-production.ps1` requires: `android/key.properties`, `android/clicks-release.jks`, `GOOGLE_MAPS_API_KEY` (param or `android/local.properties`), `JAVA_HOME` (falls back to Android Studio JBR), Flutter at `C:\Users\TS\flutter\bin\flutter.bat`. Invokes `flutter build appbundle --release --dart-define=ENV=production --dart-define=GOOGLE_MAPS_API_KEY=$MapsKey`. Output `build/app/outputs/bundle/release/app-release.aab`. — [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1)
- `local.properties` is gitignored. Maps key is also a manifest placeholder `${GOOGLE_MAPS_API_KEY}`. Empty key → maps blank at runtime, not a Gradle failure (script throws if missing). — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml); [build.gradle.kts](clicks-user/android/app/build.gradle.kts); [.gitignore](.gitignore)
- `AppConfig.validateReleaseConfig()`: release builds throw if `ENV` dart-define is empty, if API host is localhost/emulator, or if scheme is not https. Default production URL is the Railway host (comment: `tech-api.clicks.qa` is not DNS-configured yet). — [app_config.dart](clicks-user/lib/core/config/app_config.dart)
- Version: `pubspec.yaml` `1.1.6+16` = versionName 1.1.6 / versionCode 16. — [pubspec.yaml](clicks-user/pubspec.yaml)
- Play publisher plugin present but credentials file missing from tree; track `alpha`. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts)

### Inferences
- Running the AAB script tomorrow **fails immediately** on missing keystore (good fail-closed).
- If someone copies a keystore in and runs the script as written, Play gets a production-API, Maps-keyed, **Sentry-off**, **Firebase-empty** appbundle. That is the dangerous-success path.
- `BUILD.md`’s APK recipe is not what Play wants (Play wants AAB) and still omits Firebase dart-defines.
- `validateReleaseConfig` prevents the old “release APK talking to staging” footgun **only if** they pass `ENV=production`. The script does pass it.

### Gaps
- Absolute Flutter path `C:\Users\TS\flutter\bin\flutter.bat` is machine-specific; not verified to exist in this pass.
- Whether `android/local.properties` on this machine already contains a Maps key (file gitignored, not opened).

## Scenario cross-check (#12, #19, #27, #31) vs store submission

### Takeaway
These four are **runtime / config** issues, not Info.plist/manifest rejects. #12 is fixed in production. #19 is code-ready, config-null (cannot recall). #27 public SOS is on. #31 GPS confirm-pin is implemented and QA-passed. None of them block a Console upload; #19 is the post-ship kill-switch hole.

### Cited Findings
- #12 token expiry: QA 2026-11-13 **FIXED** on production (7-day token + `POST /api/customers/token/refresh` 200). Client refreshes on 401 before logout. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [dio_helper.dart](clicks-user/lib/core/api/dio_helper.dart); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §12
- #19 forced update: see section above. QA **PARTIAL**. Failure-scenario text still describes the pre-fix world. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §19
- #27 `LAUNCH_PUBLIC_SOS`: QA **PASS**, `publicSos=true`. App reads `flags.public_sos` from public config. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [public_config.dart](clicks-user/lib/core/config/public_config.dart); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §27
- #31 GPS denied/slow: original bug was silent `lastKnownPosition`. QA **PASS**: “Confirm your location” required when the fix is unreliable. `sos_cubit.dart` still calls `getLastKnownPosition` as a hint. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md); [sos_cubit.dart](clicks-user/lib/core/sos_services/sos_cubit.dart); [CLICKS_CUSTOMER_FAILURE_SCENARIOS.md](CLICKS_CUSTOMER_FAILURE_SCENARIOS.md) §31

### Inferences
- Submitting tomorrow with these four as of 13 Nov 2026: reviewers will not see #12/#19/#27/#31. Users will: if a bad binary goes out, #19 cannot pull it back; if GPS permission is denied, #31’s pin-confirm is the store-relevant location justification (when-in-use, user-confirmed).

### Gaps
- Whether the 13 Nov unpushed branch `fix/customer-qa-2026-11-13` (logout/Firebase throw, card button, stuck in-progress) is in **this** working tree. QA said those fixes were in a worktree, “not pushed, not merged.” Store submission of the wrong tree could reintroduce High bugs 1–3, which are product-quality rejects more than policy rejects.

## Checklist: fail / reject / ship dangerously (if submitted tomorrow)

### Takeaway
Do not submit this tree tomorrow as a public production store binary. Android cannot even sign. iOS can archive in principle but would ship without push, without a privacy manifest of its own, without export-compliance plist, and with an Android-only hosted policy. Several items are Console form work (Data safety, privacy URL, deletion URL) rather than code.

### Cited Findings
Aggregated from sections above; each row’s evidence is already cited there.

**Would fail to build / upload (technical)**
- Missing `android/key.properties` + `clicks-release.jks` → AAB script/Gradle refuse release. — [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1)
- Missing `play-service-account.json` if they use the Triplet Play Publisher `play` block. — [build.gradle.kts](clicks-user/android/app/build.gradle.kts)
- iOS `GoogleService-Info.plist` referenced in Xcode but absent (gitignore). Archive may warn/fail resource copy depending on Xcode settings. — [project.pbxproj](clicks-user/ios/Runner.xcodeproj/project.pbxproj)
- Target SDK: if Flutter emits `targetSdk` 35 after 31 Aug 2026, Play rejects new app/update until 36. — [target API requirement](https://developer.android.com/google/play/requirements/target-sdk)
- 16 KB: possible Play Console warning/block on native `.so` alignment; datastore pin is only one library. — [16 KB page sizes](https://developer.android.com/guide/practices/page-sizes); [build.gradle.kts](clicks-user/android/app/build.gradle.kts)
- Missing/invalid privacy manifests on a commonly used SDK → App Store Connect email + reject. No app-level `PrivacyInfo.xcprivacy`. — [Apple privacy manifests](https://developer.apple.com/news/?id=3d8a9yyh)

**Would likely fail policy / review (if the binary uploaded)**
- Play: no privacy URL in Console, or SPA URL instead of `.html`. — [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311); [qa-play-store-compliance.js](clicks-api/scripts/qa-play-store-compliance.js)
- Play: Data safety form incomplete or contradicting location/phone/FCM/Sentry/SkipCash. — [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- Play: account-deletion web URL missing or technician-only page. In-app delete exists. — [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111); [AccountDeletionPage.jsx](clicks-interface/src/pages/AccountDeletionPage.jsx)
- Apple 5.1.1(v) + Play User Data: deletion is deactivate + 30-day restore, not disclosed in the hosted policy. — [5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/); [anonymiseDeletedCustomers.js](clicks-api/clicks-shared/services/anonymiseDeletedCustomers.js); [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- Apple: hosted policy says it applies to Android applications only. — [privacy-policy.html](clicks-interface/public/privacy-policy.html)
- Unused CAMERA / generic camera and photo usage strings. — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml); [Info.plist](clicks-user/ios/Runner/Info.plist)
- Always-location usage strings without Always use / background location. — [Info.plist](clicks-user/ios/Runner/Info.plist)
- Export compliance questionnaire every iOS upload (`ITSAppUsesNonExemptEncryption` absent). Not necessarily a reject if answered correctly. — [export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)

**Would ship (review might pass) but is dangerous**
- No working FCM on the AAB/IPA produced by current scripts + missing google-services / plist / Firebase dart-defines. Job lifecycle still works in-foreground via sockets (QA). Background/killed iPhone users get silence (scenario 69). — [BUILD.md](clicks-user/BUILD.md); [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1); [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- `min_app_version` / `store_url` null → cannot recall a bad first store build. — [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Sentry DSN omitted by AAB script → crashes are invisible. — [build-aab-production.ps1](clicks-user/scripts/build-aab-production.ps1)
- Logout can stick if Firebase `deleteToken()` throws/hangs. — [settings_screen.dart](clicks-user/lib/features/settings/ui/view/settings_screen.dart); [qa-customer-lifecycle-2026-11-13.md](clicks-api/scripts/qa-customer-lifecycle-2026-11-13.md)
- Production `support_phone` null; fallback number unconfirmed with ops. — [public_config.dart](clicks-user/lib/core/config/public_config.dart)
- No Universal Links / App Links. — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml)
- SKAdNetwork: **not required** (no ads). Missing IDs are not a reject. — [SKAdNetworkItems](https://developer.apple.com/documentation/BundleResources/Information-Property-List/SKAdNetworkItems)
- Background location: **not declared, not used** on the customer app. Do **not** fill Play’s background-location declaration for this package. Technician app is a different listing (`com.clicks.tech`). — [AndroidManifest.xml](clicks-user/android/app/src/main/AndroidManifest.xml); [privacy-policy.html](clicks-interface/public/privacy-policy.html)

### Inferences
- Highest-severity store blockers if they force an upload anyway: Android signing; Play target 36; Play privacy + Data safety + web deletion URL; Apple deletion disclosure; iOS policy covering Android-only; unused camera.
- Highest-severity **user** blockers after a successful review: FCM off, no forced-update recall, no Sentry, unconfirmed support number.
- Do not confuse technician Play compliance (`ACCESS_BACKGROUND_LOCATION`, background disclosure) with this customer app.

### Gaps
- Live Play Console / App Store Connect listing state (privacy URL already filled? closed testing?).
- Whether the 13 Nov customer QA fixes are in the tree that would actually be archived.
- Flutter SDK `targetSdkVersion` on the build machine.
- Device IPA/AAB 16 KB report and App Privacy nutrition-label answers (must be filled in Console; not in this repo).
