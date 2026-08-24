import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_root.dart';
import 'core/api/dio_helper.dart';
import 'core/config/app_config.dart';
import 'core/helper/app_navigator.dart';
import 'core/helper/cache_helper.dart';
import 'core/routing/routes.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.validateReleaseConfig();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
    ),
  );

  await CacheHelper.init();
  DioHelper.init();
  DioHelper.onUnauthorized = () {
    final nav = navigatorKey.currentState;
    nav?.pushNamedAndRemoveUntil(Routes.login, (_) => false);
  };

  runApp(const AppRoot());
}
