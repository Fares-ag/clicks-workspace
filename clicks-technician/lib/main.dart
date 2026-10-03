import 'package:easy_localization/easy_localization.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_root.dart';

import 'core/api/dio_helper.dart';
import 'core/config/app_config.dart';
import 'core/config/device_capability.dart';
import 'core/di/di.dart';
import 'core/helper/app_context.dart';
import 'core/helper/cache_helper.dart';
import 'core/helper/google_maps_loader.dart';
import 'core/helper/maps_api_key.dart';
import 'core/monitoring/sentry_config.dart';
import 'core/notifications/job_notification_service.dart';
import 'core/routing/routes.dart';

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

  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  // status bar color
  SystemChrome.setSystemUIOverlayStyle(
    SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  await CacheHelper.init();
  await DeviceCapability.ensureLoaded();
  DioHelper.init();
  DioHelper.onUnauthorized = () {
    final nav = AppContext.navigatorKey.currentState;
    if (nav != null) {
      nav.pushNamedAndRemoveUntil(Routes.login, (_) => false);
    }
  };

  await JobNotificationService.instance.init();
  // Full permission wizard runs after login (MainShell) and before going Online.

  // Prefer dart-define; on Android fall back to Manifest Maps key.
  final mapsKey = await MapsApiKey.resolve();
  // Flutter web: inject Maps JS with the same key as admin Live Map.
  await ensureGoogleMapsLoaded(mapsKey);

  setupGetIt();
  runApp(
    EasyLocalization(
      supportedLocales: const [Locale('en'), Locale('ar')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      child: const AppRoot(),
    ),
  );
}
