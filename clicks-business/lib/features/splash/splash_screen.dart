import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/assets_manager.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/routing/routes.dart';
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
    await Future.delayed(const Duration(milliseconds: 600));
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
        final data = res.data as Map;
        final user = data['user'];
        final business = data['business'];
        if (user is Map) {
          await CacheHelper.set('user_name', user['name']?.toString() ?? '');
          await CacheHelper.set('user_id', user['id']?.toString() ?? '');
        }
        if (business is Map) {
          await CacheHelper.set(
            'business_name',
            business['name']?.toString() ?? '',
          );
          await CacheHelper.set(
            'business_id',
            business['id']?.toString() ?? '',
          );
          await CacheHelper.set(
            'cut_type',
            business['cutType']?.toString() ?? 'revenue',
          );
          await CacheHelper.set(
            'cut_percent',
            business['cutPercent']?.toString() ?? '',
          );
        }
        if (!mounted) return;
        _go(Routes.home);
        return;
      }
    } catch (_) {
      // Offline / timeout / server error — keep the session and use cached data.
    }

    // Only an explicit auth rejection clears credentials (handled above).
    if (!mounted) return;
    _go(Routes.home);
  }

  void _go(String route) {
    Navigator.of(context).pushNamedAndRemoveUntil(route, (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              AssetsManager.loginIconSvg,
              height: 36,
            ),
          ],
        ),
      ),
    );
  }
}
