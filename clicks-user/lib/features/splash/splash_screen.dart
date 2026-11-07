import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/api/auth_session.dart';
import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/config/public_config.dart';
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
  /// Set when the session could not be loaded: we show "retrying" instead of
  /// guessing — routing to Home on an error hid live jobs (scenario 67).
  bool _sessionFailed = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _initData();
  }

  Future<void> _initData() async {
    setState(() {
      _loading = true;
      _sessionFailed = false;
    });

    // Forced update first (scenario 19): an outdated build must not reach
    // flows whose API it no longer matches.
    await PublicConfig.load();
    if (!mounted) return;
    if (PublicConfig.updateRequired) {
      AuthSession.openForceUpdate();
      return;
    }

    if (CacheHelper.getAuthToken() == null) {
      _log('🔓 No token found → navigating to welcome');
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;
      context.offNamed(Routes.welcome);
      return;
    }

    // Sliding session: renew a token that is close to expiry before using it.
    await AuthSession.refreshIfNeeded();

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
    } on SessionFetchException catch (e) {
      _log('❌ Splash session fetch failed: $e');
      if (!mounted) return;
      // DioHelper already handled these: 401 → one refresh, then Login
      // (and login returns here, so a live job is resumed); 403 inactive →
      // "contact support"; 426 → forced update.
      if (e.isAccountInactive || e.isUnauthorized || e.statusCode == 426) {
        return;
      }
      setState(() {
        _sessionFailed = true;
        _loading = false;
      });
    } catch (e) {
      // Network error / timeout: keep the token, offer a retry. Never route
      // to Home on an error — the customer may have a technician on the way.
      _log('❌ Splash _initData error: $e');
      if (!mounted) return;
      setState(() {
        _sessionFailed = true;
        _loading = false;
      });
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
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SvgPicture.asset(
                AssetsManager.loginIconSvg,
                width: 160,
                fit: BoxFit.contain,
              ),
              if (_sessionFailed) ...[
                const SizedBox(height: 32),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    'errors.session_load_failed'.tr(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, fontSize: 15),
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: ColorsManager.mainColor,
                  ),
                  onPressed: _loading ? null : _initData,
                  child: Text('common.retry'.tr()),
                ),
                TextButton(
                  onPressed: PublicConfig.callSupport,
                  child: Text(
                    'errors.call_support'.tr(),
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
