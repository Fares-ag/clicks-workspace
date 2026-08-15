import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_root.dart';
import 'core/api/dio_helper.dart';
import 'core/helper/app_navigator.dart';
import 'core/helper/cache_helper.dart';
import 'core/notifications/partner_notification_service.dart';
import 'core/routing/routes.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = false;
  await EasyLocalization.ensureInitialized();

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
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      Routes.login,
      (_) => false,
    );
  };

  await PartnerNotificationService.instance.init();
  await PartnerNotificationService.instance.requestPermissions();

  final savedLang = CacheHelper.get('app_language');
  final startLocale =
      savedLang == 'ar' ? const Locale('ar') : const Locale('en');

  runApp(
    EasyLocalization(
      supportedLocales: const [Locale('en'), Locale('ar')],
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      startLocale: startLocale,
      child: const AppRoot(),
    ),
  );
}
