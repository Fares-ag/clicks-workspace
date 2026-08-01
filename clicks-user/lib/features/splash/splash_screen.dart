import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

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
import '../home/job_in_progress_screen.dart';
import '../home/technician_tracking_screen.dart';
import '../services/service_waiting_screen.dart';

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
    if (CacheHelper.get("token") == null) {
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
      final activeJob = session['active_job'];
      final activeServiceRequest = session['active_service_request'];
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

      // Prefer active SOS (pending / in_call) over job.
      if (activeSos is Map) {
        final status = activeSos['status']?.toString();
        if (status == 'pending') {
          context.offNamed(Routes.timerSos);
          return;
        }
        if (status == 'in_call') {
          context.offNamed(Routes.inCall);
          return;
        }
      }

      if (activeJob is Map) {
        final status = activeJob['job_status']?.toString();
        final jobId =
            activeJob['_id']?.toString() ?? activeJob['id']?.toString() ?? '';
        final tech = _techInfoFromJob(activeJob);
        final loc = _customerLatLng(activeJob, sosCubit);

        if (jobId.isNotEmpty &&
            loc != null &&
            (status == 'assigned' ||
                status == 'accepted' ||
                status == 'en_route' ||
                status == 'arrived')) {
          context.offNamed(
            Routes.technicianTracking,
            arguments: TrackingArgs(
              jobId: jobId,
              techInfo: tech,
              customerLat: loc.$1,
              customerLng: loc.$2,
              initialPhase: status == 'arrived' ? 'arrived' : 'en_route',
              techLat: _techLat(activeJob),
              techLng: _techLng(activeJob),
            ),
          );
          return;
        }

        if (jobId.isNotEmpty && status == 'in_progress') {
          context.offNamed(
            Routes.jobInProgress,
            arguments: JobProgressArgs(
              userName: '',
              bannerTitle: 'home.job_in_progress'.tr(),
              bannerBody: 'job_progress.banner_body'.tr(),
              jobId: jobId,
              statusPillText: 'tracking.in_progress'.tr(),
              technicianName: tech['name'] ?? '',
              technicianPhone: tech['phone'] ?? '',
              technicianAvatarUrl: tech['photo'] ?? '',
              vehicleName: _vehicleName(activeJob),
              vehicleCode: '',
              onCallDispatch: () async {
                const number = 'tel:+97444444444';
                final uri = Uri.parse(number);
                if (await canLaunchUrl(uri)) await launchUrl(uri);
              },
              onCallTechnician: () async {
                final phone = tech['phone'] ?? '';
                if (phone.isEmpty) return;
                final uri = Uri.parse('tel:$phone');
                if (await canLaunchUrl(uri)) await launchUrl(uri);
              },
            ),
          );
          return;
        }
      }

      // Restore pending / assigned service request (non-SOS)
      if (activeServiceRequest is Map && activeJob is! Map) {
        final srId = activeServiceRequest['_id']?.toString() ??
            activeServiceRequest['id']?.toString() ??
            '';
        final status = activeServiceRequest['status']?.toString() ?? '';
        if (srId.isNotEmpty &&
            (status == 'pending' || status == 'assigned')) {
          final coords = activeServiceRequest['location']?['coordinates'];
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
          DateTime? scheduledFor;
          final rawSched = activeServiceRequest['scheduled_for'];
          if (rawSched != null) {
            scheduledFor = DateTime.tryParse(rawSched.toString());
          }
          if (!mounted) return;
          context.offNamed(
            Routes.serviceWaiting,
            arguments: ServiceWaitingArgs(
              requestId: srId,
              serviceType:
                  activeServiceRequest['service_type']?.toString() ?? '',
              timing: activeServiceRequest['timing']?.toString() ?? 'immediate',
              scheduledFor: scheduledFor,
            ),
          );
          return;
        }
      }

      if (!mounted) return;
      context.offNamed(Routes.home);
    } catch (e) {
      _log('❌ Splash _initData error: $e');
      // Only clear session on auth failure; keep token on transient network errors.
      final msg = e.toString().toLowerCase();
      final isAuth = msg.contains('401') || msg.contains('unauthorized');
      if (isAuth) {
        await CacheHelper.remove('token');
        if (!mounted) return;
        context.offNamed(Routes.welcome);
      } else {
        if (!mounted) return;
        context.offNamed(Routes.home);
      }
    }
  }

  Map<String, dynamic> _techInfoFromJob(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) {
      return {'name': '', 'phone': '', 'photo': ''};
    }
    final first = t['firstName']?.toString() ?? '';
    final last = t['lastName']?.toString() ?? '';
    return {
      'name': '$first $last'.trim(),
      'phone': t['phone']?.toString() ?? '',
      'photo': t['profilePicture']?.toString() ?? '',
    };
  }

  (double, double)? _customerLatLng(Map job, SosCubit sosCubit) {
    final loc = job['location'];
    if (loc is Map) {
      if (loc['coordinates'] is List && (loc['coordinates'] as List).length >= 2) {
        final coords = loc['coordinates'] as List;
        final lng = (coords[0] as num).toDouble();
        final lat = (coords[1] as num).toDouble();
        return (lat, lng);
      }
      final lat = (loc['latitude'] as num?)?.toDouble();
      final lng = (loc['longitude'] as num?)?.toDouble();
      if (lat != null && lng != null) return (lat, lng);
    }
    final p = sosCubit.lastKnownPosition;
    if (p != null) return (p.latitude, p.longitude);
    return null;
  }

  double? _techLat(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[1] as num?)?.toDouble();
    }
    return null;
  }

  double? _techLng(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[0] as num?)?.toDouble();
    }
    return null;
  }

  String _vehicleName(Map job) {
    final vehicle = job['customer_vehicle_id'];
    if (vehicle is! Map) return '';
    final make = vehicle['vehicle_make'];
    final model = vehicle['vehicle_model'];
    final makeName = make is Map ? make['makeName'] ?? '' : '';
    final modelName = model is Map ? model['modelName'] ?? '' : '';
    return '$makeName $modelName ${vehicle['year'] ?? ''}'.trim();
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
