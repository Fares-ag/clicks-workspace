import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_root.dart';
import 'core/api/dio_helper.dart';
import 'core/config/app_config.dart';
import 'core/helper/app_navigator.dart';
import 'core/helper/cache_helper.dart';
import 'core/notifications/admin_notification_service.dart';
import 'core/routing/routes.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.validateReleaseConfig();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);

  await CacheHelper.init();
  DioHelper.init();
  DioHelper.onUnauthorized = () {
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      Routes.login,
      (_) => false,
    );
  };

  FirebaseMessaging.onBackgroundMessage(adminFirebaseBackgroundHandler);
  await AdminNotificationService.instance.init();

  runApp(const AppRoot());
}
