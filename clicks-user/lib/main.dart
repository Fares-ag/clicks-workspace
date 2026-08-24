import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:clicks_user/core/config/app_config.dart';
import 'package:clicks_user/core/helper/app_context.dart';
import 'package:clicks_user/core/helper/google_maps_loader.dart';
import 'package:clicks_user/core/monitoring/sentry_config.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/customer_notification_router.dart';
import 'package:clicks_user/core/services/fcm_notification_service.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'app_root.dart';

import 'core/helper/cache_helper.dart';
import 'firebase_options.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Fail closed: a release build without --dart-define=ENV=production would
  // otherwise silently ship pointing at the staging backend.
  AppConfig.validateReleaseConfig();
  await SentryConfig.initIfEnabled();
  await _bootstrap();
}

Future<void> _bootstrap() async {
  // Must register synchronously before any await — required for background FCM.
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  await EasyLocalization.ensureInitialized();
  await ScreenUtil.ensureScreenSize();

  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  await CacheHelper.init();
  DioHelper.init();
  DioHelper.onUnauthorized = () {
    final nav = AppContext.navigatorKey.currentState;
    if (nav != null) {
      nav.pushNamedAndRemoveUntil(Routes.login, (_) => false);
    }
  };

  // Flutter web: inject Maps JS (same key as admin / tech apps).
  await ensureGoogleMapsLoaded(AppConfig.googleMapsApiKey);

  // Initialize Firebase (required before runApp)
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    _log('✅ Firebase initialized successfully');
  } catch (e) {
    _log('⚠️ Firebase initialization failed: $e');
  }

  // Initialize FCM AFTER runApp — do NOT await it.
  // flutter_local_notifications plugin's initialize() can hang on iOS,
  // which would block runApp() and cause a white screen.
  _initializeFCMInBackground();

  runApp(
    EasyLocalization(
      supportedLocales: const [Locale('en'), Locale('ar')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      child: const AppRoot(),
    ),
  );
}

/// Initialize FCM in the background without blocking the app launch
void _initializeFCMInBackground() {
  Future(() async {
    try {
      await FCMNotificationService.instance.initialize();
      _log('✅ FCM initialized (background)');

      final fcmService = FCMNotificationService.instance;
      fcmService.onNotificationReceived = (data) {
        _log('📱 Notification received: ${data['event'] ?? data['type']}');
      };
      fcmService.onNotificationTapped = (data) {
        CustomerNotificationRouter.handleTap(data);
      };
      fcmService.onTokenRefresh = (token) async {
        // Never register a refreshed token while signed out — the refresh
        // fired by logout's deleteToken() would otherwise re-attach this
        // device to the account we just left.
        if (token != null && CacheHelper.getAuthToken() != null) {
          try {
            await DioHelper.postData(
              url: EndPoints.fcmToken,
              data: {'fcm_token': token},
              auth: true,
            );
          } catch (e) {
            _log('⚠️ Failed to update FCM token: $e');
          }
        }
      };
    } catch (e) {
      _log('⚠️ FCM initialization failed: $e');
    }
  });
}
