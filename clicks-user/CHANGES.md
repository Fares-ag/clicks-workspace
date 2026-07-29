# Clicks User App — Changes Summary

## Session — March 20–22, 2026

### Fix: Signup Success Message Updated (`assets/translations/en.json`, `assets/translations/ar.json`)
- Changed the `app_submitted` translation key from `"Application submitted\nsuccessfully!"` to `"Thank you!\nYour account has been created."` (EN) and the Arabic equivalent.

### Version Bump: 1.0.3+7 (`pubspec.yaml`)
- Bumped from `1.0.3+6` to `1.0.3+7`.
- New AAB built at `build/app/outputs/bundle/release/app-release.aab`.

---

## Session — March 9, 2026

_No user-app changes this session. All work was in the technician app (i18n/RTL fixes, Arabic numbers, push notification localization, swipe button SVG)._

---

## Session — March 8, 2026

### Technician Tracking — Performance Optimization, Icon Fix & Real Route Polyline

**Modified:** `lib/features/home/technician_tracking_screen.dart`, `lib/core/config/app_config.dart`

#### 1. Location Update Throttling (20-second intervals)
- Incoming `LocationUpdated` socket events are now buffered and only processed every **20 seconds** instead of immediately on every event.
- Uses `DateTime`-based elapsed check: the first update is processed immediately, then subsequent updates are scheduled at 20s boundaries.
- `_pendingTechLocation` / `_pendingTechHeading` store the latest buffered values; `_pendingLocationTimer` fires when the 20s window expires.

#### 2. Lighter Marker Animation (~10fps instead of 60fps)
- Animation duration reduced from **4 500 ms → 2 000 ms**.
- Curve changed from `easeInOutCubic` → `easeOut` (simpler computation).
- Replaced `AnimationController.addListener` (fires every frame at 60fps) with a **`Timer.periodic(100 ms)`** that polls the animation value and calls `_updateMarkers()` at ~10fps — cutting map marker rebuilds by ~6×.
- A **500 ms delay** is added after receiving a throttled update before the animation starts, giving the map renderer time to settle.

#### 3. Van Icon Resized (96 → 48 px)
- `_loadVanIcon()` now decodes the van image at **48×48 px** instead of 96×96, so the marker is no longer oversized when zoomed out.

#### 4. Real Driving Route Polyline (Directions API)
- Added `flutter_polyline_points` import and new `_fetchRoute()` method that calls the **Google Directions API** to get the actual optimal driving path from the technician to the customer.
- Route is fetched on screen init (if en_route with known tech position) and again every 20-second location update.
- The decoded route points replace the old straight-line polyline.
- Falls back to a straight line if the API call fails or no points are returned.
- `AppConfig.googleMapsApiKey` added to `app_config.dart` (reads from `--dart-define=GOOGLE_MAPS_API_KEY=...`).

---

### Localization — Settings Screen & Bottom Navigation Converted to `.tr()` Keys

**Summary:** Key user-facing screens converted to use `easy_localization` `.tr()` calls so Arabic (and future languages) render correctly.

#### Translation Files (`assets/translations/en.json` & `ar.json`)
Expanded the `settings` section with new keys:
- `logout`, `confirm_logout`, `signed_out`, `account_deleted`, `delete_my_account`
- `vehicle_information`, `my_cars`, `general`, `help_support`, `legal`
- `provide_reason`, `no_longer_needed`, `switching_service`, `privacy_concerns`, `other`, `enter_reason`
- `faqs` updated to match display text `FAQ's`

#### Screens Converted

| File | Strings converted |
|---|---|
| `lib/features/settings/ui/view/settings_screen.dart` | Settings appbar title, Account Deleted snackbar, section headers (Vehicle Information, General, Help & Support, Legal), tile titles (My Cars, Language, Contact Us, FAQ's, Privacy Policy, Terms & Conditions), Logout button label, signed out snackbar, Edit profile / Change Password / Delete Account dialog items, Logout bottom sheet (Logout title, Are you sure you want to log out, Confirm Logout), Delete Account sheet (Delete My Account title, Please provide a reason, reason checkboxes, text field hint, Cancel/Submit buttons) |
| `lib/features/main/ui/view/main_screen.dart` | Bottom nav item labels: Home, Activity, My Cars, Settings |

#### `easy_localization` import added to all modified files

---

## Session — March 7, 2026

### Technician Tracking — Custom Van Marker with Heading & Smooth Animation

**Modified:** `lib/features/home/technician_tracking_screen.dart`, `lib/core/sos_services/sos_cubit.dart`

- **Custom Van Icon:** Replaced the default orange map marker with the `assets/images/map_icon.png` van image. Loaded via `rootBundle` and resized to 96×96px using `ui.instantiateImageCodec`. Displayed using `BitmapDescriptor.bytes()`.
- **Heading / Rotation:** The technician marker now rotates to face the direction of travel. `Marker.rotation` is set to the heading value received from the GPS update. `flat: true` and `anchor: Offset(0.5, 0.5)` ensure the icon rotates around its center.
- **Smooth Linear Interpolation:** Added `TickerProviderStateMixin` and an `AnimationController` (3 000 ms duration) that smoothly slides the van marker from the old coordinate to the new coordinate. Heading is also interpolated with 360° wrap-around handling. This eliminates the "teleporting" effect between GPS updates.
- **State Update (`LocationUpdated`):** Added a `heading` field (`double`) to the `LocationUpdated` state class and updated the cubit to extract `data['heading']` from socket payloads.

---

## 1. Google Maps Integration

Added full `google_maps_flutter` dependency and platform configuration to support live technician tracking.

### Dependencies Added (`pubspec.yaml`)
- `google_maps_flutter: ^2.6.1`
- `flutter_polyline_points: ^2.1.0`
- `geocoding: ^3.0.0`

### Android (`android/`)
- `app/src/main/AndroidManifest.xml` — added `com.google.android.geo.API_KEY` meta-data
- `app/build.gradle.kts` — injects `GOOGLE_MAPS_API_KEY` from `local.properties` via `manifestPlaceholders`
- `local.properties` — added placeholder `GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE`

### iOS (`ios/Runner/`)
- `Info.plist` — added `GOOGLE_MAPS_API_KEY` entry (reads from Xcode build variable)
- `AppDelegate.swift` — calls `GMSServices.provideAPIKey()` on launch

> **Before building**, replace `YOUR_GOOGLE_MAPS_API_KEY_HERE` in `android/local.properties` with your real key, and set `GOOGLE_MAPS_API_KEY` in the Xcode build settings.

---

## 2. Map Style Constant

**New file:** `lib/core/constants/map_style.dart`

Muted map style JSON matching the admin dashboard live-map: grey landscape, hidden POIs, white roads, orange highways.

---

## 3. Technician Tracking Screen

**New file:** `lib/features/home/technician_tracking_screen.dart`

Full-screen Google Map that shows the technician's live location en-route to the customer.

### Features
- Real-time technician marker updating from `LocationUpdated` socket events
- Customer location marker (red pin)
- Polyline between technician and customer while en-route (removed on arrival)
- Animated camera that fits both markers in view
- Draggable bottom sheet with:
  - Status label (en route / arrived)
  - Technician card (avatar, name, phone, star rating)
  - "Call dispatch" shortcut
  - Cancel SOS button (only visible while en route)
- Phase transitions: `en_route` → `arrived` → navigates to job-in-progress screen
- Handles `JobCompleted` → shows rating bottom sheet

### `TrackingArgs` — navigation arguments
```dart
TrackingArgs({
  required String jobId,
  required Map<String, dynamic> techInfo, // name, phone, photo, rating
  required double customerLat,
  required double customerLng,
  String initialPhase, // 'en_route' | 'arrived'
})
```

---

## 4. Rating Bottom Sheet

**New file:** `lib/features/home/rating_bottom_sheet.dart`

Modal bottom sheet shown after job completion asking the customer to rate the technician.

### Features
- Technician avatar + name in header
- 5-star `RatingBar` (from `flutter_rating_bar`)
- Free-text review field
- Submits to `POST /api/jobs/:id/rate` with `{ rating, rating_description }`
- Loading spinner during submission
- "Thank you for your review!" animated confirmation view
- Skip button navigates home without rating

---

## 5. SOS Cubit Updates

**Modified:** `lib/core/sos_services/sos_cubit.dart`

- `TechnicianEnRoute` state now carries `technicianInfo` (name, phone, photo) in addition to `jobId` and `enRouteAt`
- Added `lastKnownPosition` field (type `Position`) — saved when `createSOS()` is called, so the tracking screen can center on the customer's GPS coordinates
- Added `geolocator` import

---

## 6. In-Call Screen → Tracking Screen Navigation

**Modified:** `lib/features/home/in_call_screen.dart`

Added `TechnicianEnRoute` handler that navigates to `Routes.technicianTracking` instead of staying on the in-call screen. Also added `TechnicianArrived` fallback handler (navigates to tracking in arrived mode) in case the app misses the en-route event.

---

## 7. Job In Progress Screen — Rating on Completion

**Modified:** `lib/features/home/job_in_progress_screen.dart`

`JobCompleted` state now shows the `RatingBottomSheet` instead of silently navigating home. After rating (or skipping), the user is taken to the home screen.

---

## 8. API Endpoint Added

**Modified:** `lib/core/api/end_points.dart`

```dart
static const String jobs = "/api/jobs";
// Used as: POST /api/jobs/:id/rate
```

---

## 9. Routing

**Modified:** `lib/core/routing/routes.dart`
```dart
static const String technicianTracking = '/technicianTracking';
```

**Modified:** `lib/core/routing/router.dart`
- Added `technicianTracking` case → `TechnicianTrackingScreen(args: TrackingArgs)`
- Removed `WelcomeCubit` BlocProvider wrapper (no longer needed)

---

## 10. Welcome Screen — Location Permission Deferred

**Modified:** `lib/features/welcome/ui/welcome_screen.dart`

"Get Started" now navigates directly to the login screen without requesting location permission. Location is only requested when the user taps the SOS button (`SosCubit.createSOS()` calls `WelcomeService.determinePosition()` internally).

**Impact:** Users can sign up and use the full app without ever granting location permission until they actually trigger an SOS.

---

## 11. Logout Message Improved

**Modified:** `lib/features/settings/ui/view/settings_screen.dart`

After confirming logout, the app now shows:
> "You have been signed out successfully"

before navigating to the login screen.

---

---

## 12. Firebase iOS Configuration

**New file:** `ios/Runner/GoogleService-Info.plist`

Configured Firebase for iOS using `flutterfire configure --project=clicks-d2da9`. Replaced placeholder values in `lib/firebase_options.dart` with real project credentials.

- Firebase project: `clicks-d2da9`
- iOS bundle: `com.roya.clicksUser`
- iOS App ID: `1:1076454306293:ios:668dc0964f6913490a70bc`

---

## 13. White Screen Fix — FCM Non-Blocking Init

**Modified:** `lib/main.dart`

**Root cause:** `FCMNotificationService.instance.initialize()` was `await`-ed in `main()` before `runApp()`. On iOS, `flutter_local_notifications`' `initialize()` never completes, so `runApp()` was never called → permanent white screen.

**Fix:** FCM initialization moved to a non-blocking background `Future` so `runApp()` executes immediately.

```dart
void _initializeFCMInBackground() {
  Future(() async {
    await FCMNotificationService.instance.initialize();
  });
}
```

Also added `await ScreenUtil.ensureScreenSize()` before `runApp()` to prevent a `LateInitializationError` from `ScreenUtil._minTextAdapt`.

---

## 14. ScreenUtil Configuration Fix

**Modified:** `lib/app_root.dart`

Added `minTextAdapt: true` and `splitScreenMode: true` to `ScreenUtilInit` to prevent `LateInitializationError` crashes on devices with non-standard screen sizes.

```dart
ScreenUtilInit(
  designSize: const Size(375, 812),
  minTextAdapt: true,
  splitScreenMode: true,
  ...
)
```

---

## 15. iOS Location Permissions

**Modified:** `ios/Runner/Info.plist`

Added the three required iOS location permission description strings that were missing, causing "Error in getting location" on first launch:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`

---

## 16. App Name Changed to "Sanad RSA"

**Modified:** `ios/Runner/Info.plist` — `CFBundleDisplayName` and `CFBundleName`

**Modified:** `android/app/src/main/AndroidManifest.xml` — `android:label`

**Modified:** `lib/app_root.dart` — `MaterialApp(title: 'Sanad RSA')`

---

## 17. App Icon Updated

**Modified:** `pubspec.yaml` — `flutter_launcher_icons` config with `remove_alpha_ios: true`

Generated platform icons using `dart run flutter_launcher_icons`. The `remove_alpha_ios: true` flag is required by App Store validation (iOS icons must not have an alpha/transparency channel).

---

## 18. UI Text Improvements

**Modified:** `lib/features/welcome/cubit/welcome_cubit.dart`
- Location success toast changed from `"Got Location successfully"` → `"Location access granted"`
- Fixed async pattern from `.then().catchError()` to proper `async/await` with `try/catch`

**Modified:** `lib/features/settings/ui/view/settings_screen.dart`
- Logout confirmation button text changed from `"Yes logout"` → `"Confirm Logout"`

---

## 19. Google Maps API Key — Hardcoded in iOS

**Modified:** `ios/Runner/Info.plist`

The original `GOOGLE_MAPS_API_KEY` entry used the Xcode build variable `$(GOOGLE_MAPS_API_KEY)` which was never set in Xcode build settings, causing the Maps SDK to receive an empty key and crash with `GMSServicesException`.

**Fix:** Replaced the build variable reference with the actual API key directly in Info.plist.

**Modified:** `android/local.properties` — `GOOGLE_MAPS_API_KEY` set to real key.

---

## 20. AppDelegate — FlutterImplicitEngineDelegate

**Modified:** `ios/Runner/AppDelegate.swift`

Flutter auto-migrates to the scene-based lifecycle (`FlutterImplicitEngineDelegate`) on every build. The `AppDelegate` was updated to use this pattern while retaining the `GMSServices.provideAPIKey()` call that reads the key from `Info.plist`.

---

## 21. Production API URL

**Modified:** `lib/core/config/app_config.dart`

Switched default API and WebSocket URLs from staging to production:

```dart
// Before
defaultValue: 'https://stg-tech-api.clicks.qa'

// After
defaultValue: 'https://tech-api.clicks.qa'
```

---

## 22. Version History

| Version | Build | Notes |
|---------|-------|-------|
| 1.0.0 | 1 | Initial App Store submission |
| 1.0.1 | 2 | Google Maps integration, tracking screen, rating sheet |
| 1.0.2 | 3 | Production API URL, Maps API key fix |

---

## Session — March 6, 2026

### Technician on Map + ETA Distance Label

**Modified:** `lib/features/home/technician_tracking_screen.dart`

- Added `geolocator` import for distance calculation.
- Added `_etaMinutes` getter: calculates straight-line distance between the technician's live location and the customer's pinned location, converts to minutes at 40 km/h.
- **Green ETA pill** ("X min away") now displays below the status label in the bottom sheet while the technician is en-route and their location is known. Updates live as new `LocationUpdated` socket events arrive.

Note: The technician marker on the map (orange pin) was already wired via `LocationUpdated` state — it just required the technician app to begin emitting location updates (which it does once en-route starts).

---

### Coordinate Text Wrapping

**Modified:** `lib/features/home/technician_tracking_screen.dart`

N/A — coordinates on the customer side are not shown in the tracking screen UI (only map markers).

Both apps now share a common coordinate formatting pattern: numbers with 6+ decimal places are truncated to 5dp in all visible labels, with the full-precision values used only in map/API calls.

---

## Session — March 5–6, 2026

### ETA Display on Tracking Screen

**Modified:** `lib/features/home/technician_tracking_screen.dart`

Added `_etaMinutes` getter that calculates straight-line distance from the technician's live location to the customer using `Geolocator.distanceBetween()` at an assumed speed of 40 km/h.

A green pill **"X min away"** is now shown below the status label in the draggable bottom sheet while the phase is `en_route` and a technician location has been received. The pill updates automatically on every `LocationUpdated` socket event.

```dart
int get _etaMinutes {
  final distanceMeters = Geolocator.distanceBetween(techLat, techLng, custLat, custLng);
  return (distanceMeters / 1000 / 40 * 60).ceil().clamp(1, 999);
}
```

Added `package:geolocator/geolocator.dart` import (already a transitive dependency).

---

### API URL — Reverted to Staging

**Modified:** `lib/core/config/app_config.dart`

Default `apiBaseUrl` and `socketUrl` changed back from production to staging:

```dart
// Before
defaultValue: 'https://tech-api.clicks.qa'

// After
defaultValue: 'https://stg-tech-api.clicks.qa'
```

---

### Android Build — Gradle Import Fix

**Modified:** `android/app/build.gradle.kts`

Added `import java.util.Properties` at the top of the Kotlin DSL file. Gradle's Kotlin DSL requires explicit imports (unlike Groovy), causing a compilation failure when reading `local.properties` for the Maps API key.

**Modified:** `android/local.properties`

Replaced the `GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY_HERE` placeholder with the real API key so Android builds correctly inject it into `AndroidManifest.xml`.

---

### Activity Screen — "Continue" for Ongoing Jobs

**Modified:** `lib/features/activity/view/activity_screen.dart`

Job cards with an active/ongoing status (`pending`, `assigned`, `accepted`, `en_route`, `arrived`, `in_progress`) now show a **"Continue"** button instead of "View Details". Tapping it fetches the raw job data via `GET /api/jobs/:id` and routes to the appropriate screen:

| Job status | Navigates to |
|---|---|
| `en_route` | `TechnicianTrackingScreen` (live map, en_route phase) |
| `arrived` | `TechnicianTrackingScreen` (arrived phase) |
| `in_progress` | `JobInProgressScreen` |
| `pending` / `assigned` / `accepted` | `InCallWithDispatcherScreen` (waiting state) |

**Modified:** `lib/features/activity/data/activity_repository.dart`

Added `getJobRaw(String jobId)` method that calls `GET /api/jobs/:jobId` and returns the raw `Map<String, dynamic>` needed to reconstruct screen arguments.

```dart
static const List<String> _activeStatuses = [
  'pending', 'assigned', 'accepted', 'en_route', 'arrived', 'in_progress',
];

bool get isActiveJob => _activeStatuses.contains(status);
```

---

## Full SOS → Tracking Flow (Updated)

```
SOS Button pressed
  └─ SosCubit.createSOS()         ← location permission requested HERE
       └─ TimerSosScreen           (59s countdown, waiting for dispatcher)
            └─ SosInCall
                 └─ InCallWithDispatcherScreen
                      ├─ TechnicianAssigned  (banner turns green)
                      ├─ TechnicianAccepted  (snackbar)
                      └─ TechnicianEnRoute   ──→  TechnicianTrackingScreen (map)
                                                       ├─ LocationUpdated  (marker moves, ETA updates)
                                                       ├─ Green ETA pill   "X min away"
                                                       ├─ TechnicianArrived
                                                       └─ JobStarted ──→ JobInProgressScreen
                                                                              └─ JobCompleted
                                                                                   └─ RatingBottomSheet
                                                                                        └─ Home
```

