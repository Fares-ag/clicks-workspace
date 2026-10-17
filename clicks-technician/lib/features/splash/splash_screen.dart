import 'dart:async';

import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/helper/cache_helper.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/svg.dart';

import '../../core/routing/routes.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _route();
  }

  Future<void> _go(String route) async {
    if (!mounted) return;
    context.offNamed(route);
  }

  Future<void> _route() async {
    await Future.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;

    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) {
      await _go(Routes.welcome);
      return;
    }

    final cached = CacheHelper.get('application_status')?.toString() ?? '';
    if (cached == 'Approved') {
      await _go(Routes.home);
      return;
    }
    if (cached.isNotEmpty) {
      await _go(Routes.status);
      return;
    }

    // First launch after login: confirm approval, but never sit on splash
    // if the session endpoint is slow (it used to wait the full 30s Dio
    // timeout and look frozen).
    try {
      final session = await DioHelper.getData(
        url: EndPoints.technicianSession,
      ).timeout(const Duration(seconds: 5));
      if (!mounted) return;

      if (session.statusCode == 401) {
        await CacheHelper.clear();
        await _go(Routes.login);
        return;
      }

      if (session.statusCode == 200) {
        final tech = session.data['technician'];
        final status = tech is Map
            ? tech['applicationStatus']?.toString()
            : null;
        final phone =
            tech is Map ? tech['phone']?.toString() : null;
        if (status != null && status.isNotEmpty) {
          await CacheHelper.save('application_status', status);
        }
        if (phone != null && phone.isNotEmpty) {
          await CacheHelper.save('technician_phone', phone);
        }
        final resolved =
            status ?? CacheHelper.get('application_status')?.toString() ?? '';
        await _go(resolved == 'Approved' ? Routes.home : Routes.status);
        return;
      }
    } catch (_) {}

    if (!mounted) return;
    await _go(Routes.home);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.mainColor,
      body: Center(
        child: SvgPicture.asset(
          AssetsManager.loginIconSvg,
          width: 180,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}
