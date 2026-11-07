import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/sos_services/sos_support_contact.dart';
import 'package:clicks_user/features/activity/models/job_history_response.dart';
import 'package:clicks_user/features/home/finding_technician_screen.dart';
import 'package:clicks_user/features/home/job_in_progress_screen.dart';
import 'package:clicks_user/features/home/payment_hold_screen.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

class SessionResume {
  SessionResume._();

  static const _dohaLat = 25.2854;
  static const _dohaLng = 51.531;

  static Future<void> go(
    BuildContext context,
    Map<String, dynamic> session, {
    String? preferredEvent,
    bool replace = true,
  }) async {
    final activeSos = session['active_sos'];
    final activeJob = session['active_job'];
    final liveJob = session['live_job'] is Map
        ? session['live_job']
        : activeJob;
    final unpaidJob = session['unpaid_job'];
    final activeServiceRequest = session['active_service_request'];
    final kind = session['session_kind']?.toString();

    void open(String route, {Object? arguments}) {
      if (!context.mounted) return;
      if (replace) {
        context.offNamed(route, arguments: arguments);
      } else {
        context.toNamed(route, arguments: arguments);
      }
    }

    if (activeSos is Map) {
      final status = activeSos['status']?.toString();
      if (status == 'pending') {
        open(Routes.timerSos);
        return;
      }
      if (status == 'in_call' || preferredEvent == 'sosInCall') {
        open(Routes.inCall);
        return;
      }
    }

    if (liveJob is Map) {
      final status = liveJob['job_status']?.toString() ?? '';
      final jobId =
          liveJob['_id']?.toString() ?? liveJob['id']?.toString() ?? '';
      final tech = techInfoFromJob(liveJob);
      final loc = customerLatLng(liveJob, context) ?? (_dohaLat, _dohaLng);
      final garagePhase = resolveGaragePhase(liveJob, sessionKind: kind);

      // A job with no technician yet (dispatch created it without one, or
      // the technician handed it back): show "Finding a technician" instead
      // of Home, so the customer doesn't raise a second SOS (scenario 45).
      if (jobId.isNotEmpty && status == 'pending') {
        open(
          Routes.findingTechnician,
          arguments: FindingTechnicianArgs(
            jobId: jobId,
            jobReference: liveJob['job_reference']?.toString() ?? '',
          ),
        );
        return;
      }

      if (jobId.isNotEmpty && shouldOpenTrackingForLiveJob(status, garagePhase)) {
        open(
          Routes.technicianTracking,
          arguments: TrackingArgs(
            jobId: jobId,
            techInfo: tech,
            customerLat: loc.$1,
            customerLng: loc.$2,
            initialPhase: trackingInitialPhase(status, garagePhase),
            techLat: techLat(liveJob),
            techLng: techLng(liveJob),
          ),
        );
        return;
      }

      if (jobId.isNotEmpty &&
          (garagePhase == 'at_garage' || status == 'on_hold')) {
        open(Routes.activityDetails, arguments: jobDtoFromSession(liveJob));
        return;
      }

      if (jobId.isNotEmpty &&
          (status == 'in_progress' || preferredEvent == 'jobStarted')) {
        open(
          Routes.jobInProgress,
          arguments: JobProgressArgs(
            userName: '',
            bannerTitle: 'home.job_in_progress'.tr(),
            bannerBody: 'job_progress.banner_body'.tr(),
            jobId: jobId,
            jobReference: liveJob['job_reference']?.toString() ?? '',
            statusPillText: JobStatusLabels.labelFor('in_progress'),
            technicianName: tech['name'] ?? '',
            technicianPhone: tech['phone'] ?? '',
            technicianAvatarUrl: tech['photo'] ?? '',
            vehicleName: vehicleName(liveJob),
            vehicleCode: '',
            price: _priceOf(liveJob),
            paymentStatus: liveJob['payment_status']?.toString(),
            paymentMethod: liveJob['payment_method']?.toString(),
            onCallDispatch: () async {
              await SosSupportContact.call();
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

    if (kind == 'unpaid' ||
        (unpaidJob is Map && liveJob is! Map && activeSos is! Map)) {
      final job = unpaidJob is Map
          ? unpaidJob
          : activeJob is Map
              ? activeJob
              : <String, dynamic>{};
      open(
        Routes.paymentHold,
        arguments: PaymentHoldArgs.fromJob(Map<String, dynamic>.from(job)),
      );
      return;
    }

    if (activeServiceRequest is Map) {
      final srId = activeServiceRequest['_id']?.toString() ??
          activeServiceRequest['id']?.toString() ??
          '';
      final status = activeServiceRequest['status']?.toString() ?? '';
      if (srId.isNotEmpty && (status == 'pending' || status == 'assigned')) {
        open(
          Routes.serviceWaiting,
          arguments: ServiceWaitingArgs.fromBooking(
            Map<String, dynamic>.from(activeServiceRequest),
          ),
        );
        return;
      }
    }

    open(Routes.home);
  }

  static Map<String, dynamic> techInfoFromJob(Map job) {
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
      'rating': t['rating'],
    };
  }

  static (double, double)? customerLatLng(Map job, BuildContext context) {
    final geo = job['locationCoordinates'];
    if (geo is Map) {
      final coords = geo['coordinates'];
      if (coords is List && coords.length >= 2) {
        final lng = double.tryParse(coords[0].toString());
        final lat = double.tryParse(coords[1].toString());
        if (lat != null && lng != null) return (lat, lng);
      }
    }
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
    if (loc is String) {
      final parts = loc.split(',');
      if (parts.length == 2) {
        final lat = double.tryParse(parts[0].trim());
        final lng = double.tryParse(parts[1].trim());
        if (lat != null && lng != null) return (lat, lng);
      }
    }
    try {
      final p = context.read<SosCubit>().lastKnownPosition;
      if (p != null) return (p.latitude, p.longitude);
    } catch (_) {}
    return null;
  }

  static double? techLat(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[1] as num?)?.toDouble();
    }
    return null;
  }

  static double? techLng(Map job) {
    final t = job['assignedTechnician'];
    if (t is! Map) return null;
    final coords = t['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      return (coords[0] as num?)?.toDouble();
    }
    return null;
  }

  static String vehicleName(Map job) {
    final vehicle = job['customer_vehicle_id'];
    if (vehicle is! Map) {
      return [
        job['vehicleMake'],
        job['vehicleModel'],
        job['vehicleYear'],
      ].where((e) => e != null && e.toString().isNotEmpty).join(' ');
    }
    final make = vehicle['vehicle_make'];
    final model = vehicle['vehicle_model'];
    final makeName = make is Map ? make['makeName'] ?? '' : '';
    final modelName = model is Map ? model['modelName'] ?? '' : '';
    return '$makeName $modelName ${vehicle['year'] ?? ''}'.trim();
  }

  static int? _priceOf(Map job) {
    final raw = job['price'] ?? job['estimate'];
    if (raw is num) return raw.toInt();
    return int.tryParse(raw?.toString() ?? '');
  }

  /// `at_garage` | `returning`, or null when the vehicle is not in garage flow.
  static String? resolveGaragePhase(Map job, {String? sessionKind}) {
    final kind = sessionKind?.toString();
    if (kind == 'at_garage' || kind == 'returning') return kind;
    final garage = job['garage'];
    if (garage is Map) {
      final phase = garage['phase']?.toString();
      if (phase == 'at_garage' || phase == 'returning') return phase;
    }
    return null;
  }

  static bool shouldOpenTrackingForLiveJob(String status, String? garagePhase) {
    if (garagePhase == 'at_garage') return false;
    if (garagePhase == 'returning') return true;
    if (status == 'on_hold') return false;
    return const {
      'assigned',
      'accepted',
      'en_route',
      'arrived',
    }.contains(status);
  }

  static String trackingInitialPhase(String status, String? garagePhase) {
    if (garagePhase == 'returning' || status == 'on_hold') return 'on_hold';
    if (status == 'arrived') return 'arrived';
    return 'en_route';
  }

  static JobDto jobDtoFromSession(Map job) {
    final json = Map<String, dynamic>.from(job);
    json['_id'] ??= json['id'];
    json['dateTime'] ??= json['createdAt'];
    return JobDto.fromJson(json);
  }
}
