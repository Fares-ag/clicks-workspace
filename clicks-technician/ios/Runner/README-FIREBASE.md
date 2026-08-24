# iOS Firebase setup (clicks-technician)

Push notifications on iOS require a real `GoogleService-Info.plist` from the **clicks-technician** Firebase project. Do not commit a placeholder or copy from another app.

## Steps

1. **Firebase Console** → Project **clicks-technician-qa** (or production equivalent) → Project settings → **Your apps** → iOS app with bundle ID `com.roya.clicksTechnician`.
2. Download **GoogleService-Info.plist** and place it at:
   ```
   ios/Runner/GoogleService-Info.plist
   ```
3. **Xcode** → open `ios/Runner.xcworkspace` → drag `GoogleService-Info.plist` into the **Runner** target (copy items if needed, ensure **Runner** is checked under Target Membership).
4. **Signing & Capabilities** → add **Push Notifications** and confirm **Background Modes** includes **Remote notifications** (also declared in `Info.plist`).
5. **Firebase Console** → Project settings → **Cloud Messaging** → upload your **APNs Authentication Key** (.p8) or certificates for this iOS app.
6. Build and run on a **physical device** (simulator does not receive remote push).

Dart initializes Firebase on iOS via `Firebase.initializeApp()` (no fabricated options); the native SDK reads this plist from the app bundle.

Optional CI override: pass `--dart-define=FIREBASE_IOS_API_KEY=...` and `--dart-define=FIREBASE_IOS_APP_ID=...` if you use `DefaultFirebaseOptions.ios` instead of the plist.
