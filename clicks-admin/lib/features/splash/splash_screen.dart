import 'package:flutter/material.dart';
import '../../core/api/dio_helper.dart';
import '../../core/helper/assets_manager.dart';
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
      backgroundColor: AppColors.surface,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset(
                AssetsManager.brandLogo,
                height: 148,
                fit: BoxFit.contain,
              ),
              const SizedBox(height: 28),
              Text(
                'Dispatch Console',
                style: AdminTypography.body.copyWith(
                  color: AppColors.muted,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 32),
              const SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
