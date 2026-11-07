import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/assets_manager.dart';
import '../../core/helper/extensions.dart';
import '../../core/services/fcm_notification_service.dart';
import '../../core/sos_services/customer_socket_service.dart';
import '../../core/sos_services/sos_cubit.dart';
import '../../core/theme/colors_manager.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter/material.dart';

import '../../core/routing/routes.dart';
import '../../core/services/session_resume.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _initData();
  }

  Future<void> _initData() async {
    if (CacheHelper.getAuthToken() == null) {
      _log('🔓 No token found → navigating to welcome');
      await Future.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      context.offNamed(Routes.welcome);
      return;
    }

    try {
      await _registerFcmToken();

      final session = await SessionService.getCustomerSession();
      _log('📦 Session: $session');

      if (!mounted) return;

      final activeSos = session['active_sos'];
      final sosCubit = context.read<SosCubit>();

      // Restore SOS cubit + last known location so tracking/in-call work.
      if (activeSos is Map) {
        final id = activeSos['_id']?.toString() ?? activeSos['id']?.toString();
        if (id != null && id.isNotEmpty) {
          sosCubit.sosId = id;
        }
        final coords = activeSos['location']?['coordinates'];
        if (coords is List && coords.length >= 2) {
          final lng = (coords[0] as num).toDouble();
          final lat = (coords[1] as num).toDouble();
          sosCubit.lastKnownPosition = Position(
            latitude: lat,
            longitude: lng,
            timestamp: DateTime.now(),
            accuracy: 0,
            altitude: 0,
            altitudeAccuracy: 0,
            heading: 0,
            headingAccuracy: 0,
            speed: 0,
            speedAccuracy: 0,
          );
        }
      }

      if (!mounted) return;
      await SessionResume.go(context, session);
    } catch (e) {
      _log('❌ Splash _initData error: $e');
      // Only clear session on auth failure; keep token on transient network errors.
      final msg = e.toString().toLowerCase();
      final isAuth = msg.contains('401') || msg.contains('unauthorized');
      if (isAuth) {
        await CacheHelper.secureDelete(CacheHelper.authTokenKey);
        // The FCM token is still on the expired account server-side; drop it
        // with the session so the next account signing in on this device does
        // not inherit the previous one's pushes.
        try {
          await FCMNotificationService.instance
              .deleteToken()
              .timeout(const Duration(seconds: 5));
        } catch (_) {}
        if (!mounted) return;
        context.offNamed(Routes.welcome);
      } else {
        if (!mounted) return;
        context.offNamed(Routes.home);
      }
    }
  }

  Future<void> _registerFcmToken() async {
    try {
      final fcmToken = await FCMNotificationService.instance.getToken();
      if (fcmToken != null) {
        await DioHelper.postData(
          url: EndPoints.fcmToken,
          data: {'fcm_token': fcmToken},
          auth: true,
        );
        _log('🔔 FCM token registered with backend (returning user)');
      }
    } catch (e) {
      _log('⚠️ Failed to register FCM token: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.mainColor,
      body: Center(
        child: SvgPicture.asset(
          AssetsManager.loginIconSvg,
          width: 160,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}
