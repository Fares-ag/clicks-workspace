import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/admin_notification_service.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;

    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) {
      _go(Routes.login);
      return;
    }

    try {
      final res = await DioHelper.getData(url: EndPoints.me);
      if (res.statusCode == 401 || res.statusCode == 403) {
        await CacheHelper.clear();
        if (!mounted) return;
        _go(Routes.login);
        return;
      }
      if (res.statusCode == 200 && res.data is Map) {
        final user = (res.data as Map)['user'];
        if (user is Map) {
          await CacheHelper.setUserProfile(
            user.map((k, v) => MapEntry(k.toString(), v)),
          );
        }
        await AdminNotificationService.instance.registerAfterLogin();
        if (!mounted) return;
        _go(Routes.dashboard);
        return;
      }
    } catch (_) {}

    if (!mounted) return;
    _go(Routes.dashboard);
  }

  void _go(String route) {
    Navigator.of(context).pushNamedAndRemoveUntil(route, (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(gradient: AppColors.earningsGradient),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SvgPicture.asset(
              'assets/logo/Logo.svg',
              height: 48,
              colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
            ),
            const SizedBox(height: 24),
            Text(
              'Dispatch Console',
              style: AdminTypography.body.copyWith(
                color: Colors.white70,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 32),
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
