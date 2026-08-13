import 'package:clicks_user/core/helper/app_context.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/features/home/job_in_progress_screen.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[CustomerNotif] $msg');
  }
}

/// Routes the user to the correct screen after tapping a push notification.
class CustomerNotificationRouter {
  CustomerNotificationRouter._();

  static Future<void> handleTap(Map<String, dynamic> data) async {
    final event =
        data['event']?.toString() ?? data['type']?.toString() ?? '';
    _log('handleTap event=$event job=${data['job_id']}');

    if (CacheHelper.get('token') == null) {
      _log('no auth token — skip navigation');
      return;
    }

    final context = AppContext.navigatorKey.currentContext;
    if (context == null || !context.mounted) {
      _log('navigator not ready');
      return;
    }

    if (event == 'sosInCall') {
      context.offNamed(Routes.inCall);
      return;
    }

    try {
      final session = await SessionService.getCustomerSession();
      if (!context.mounted) return;
      await _navigateFromSession(context, session, preferredEvent: event);
    } catch (e) {
      _log('session resume failed: $e');
      if (context.mounted) {
        context.offNamed(Routes.home);
      }
    }
  }

  static Future<void> _navigateFromSession(
    BuildContext context,
    Map<String, dynamic> session, {
    String? preferredEvent,
  }) async {
    final activeSos = session['active_sos'];
    final activeJob = session['active_job'];
    final activeServiceRequest = session['active_service_request'];

    if (activeSos is Map) {
      final status = activeSos['status']?.toString();
      if (status == 'pending') {
        context.offNamed(Routes.timerSos);
        return;
      }
      if (status == 'in_call' || preferredEvent == 'sosInCall') {
        context.offNamed(Routes.inCall);
        return;
      }
    }

    if (activeJob is Map) {
      final status = activeJob['job_status']?.toString();
      final jobId =
          activeJob['_id']?.toString() ?? activeJob['id']?.toString() ?? '';
      final tech = _techInfoFromJob(activeJob);
      final loc = _customerLatLng(activeJob);

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

      if (jobId.isNotEmpty &&
          (status == 'in_progress' || preferredEvent == 'jobStarted')) {
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

    if (activeServiceRequest is Map && activeJob is! Map) {
      final srId = activeServiceRequest['_id']?.toString() ??
          activeServiceRequest['id']?.toString() ??
          '';
      final status = activeServiceRequest['status']?.toString() ?? '';
      if (srId.isNotEmpty && (status == 'pending' || status == 'assigned')) {
        DateTime? scheduledFor;
        final raw = activeServiceRequest['scheduled_for'];
        if (raw != null) {
          scheduledFor = DateTime.tryParse(raw.toString());
        }
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

    context.offNamed(Routes.home);
  }

  static Map<String, dynamic> _techInfoFromJob(Map job) {
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

  static (double, double)? _customerLatLng(Map job) {
    final loc = job['location'];
    if (loc is Map) {
      if (loc['coordinates'] is List &&
          (loc['coordinates'] as List).length >= 2) {
        final coords = loc['coordinates'] as List;
        final lng = (coords[0] as num).toDouble();
        final lat = (coords[1] as num).toDouble();
        return (lat, lng);
      }
      final lat = (loc['latitude'] as num?)?.toDouble();
      final lng = (loc['longitude'] as num?)?.toDouble();
      if (lat != null && lng != null) return (lat, lng);
    }
    return null;
  }

  static double? _techLat(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[1] as num?)?.toDouble();
    }
    return null;
  }

  static double? _techLng(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[0] as num?)?.toDouble();
    }
    return null;
  }

  static String _vehicleName(Map job) {
    final vehicle = job['customer_vehicle_id'];
    if (vehicle is! Map) return '';
    final make = vehicle['vehicle_make'];
    final model = vehicle['vehicle_model'];
    final makeName = make is Map ? make['makeName'] ?? '' : '';
    final modelName = model is Map ? model['modelName'] ?? '' : '';
    return '$makeName $modelName ${vehicle['year'] ?? ''}'.trim();
  }
}
