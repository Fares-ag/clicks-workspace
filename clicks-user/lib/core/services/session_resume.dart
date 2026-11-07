import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/sos_services/sos_support_contact.dart';
import 'package:clicks_user/features/activity/models/job_history_response.dart';
import 'package:clicks_user/features/home/finding_technician_screen.dart';
import 'package:clicks_user/features/home/job_in_progress_screen.dart';
import 'package:clicks_user/features/home/job_price.dart';
import 'package:clicks_user/features/home/payment_hold_screen.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

/// Where a session payload sends the customer — the pure routing decision of
/// [SessionResume.go], unit-tested over every status (WS-B 7).
class SessionTarget {
  const SessionTarget({
    required this.route,
    this.jobId = '',
    this.sosId = '',
    this.serviceRequestId = '',
    this.status = '',
    this.phase,
    this.garagePhase,
    this.ratingPromptJobId,
  });

  final String route;
  final String jobId;
  final String sosId;
  final String serviceRequestId;
  final String status;

  /// Tracking screen phase (`assigned` | `en_route` | `arrived` | `on_hold`).
  final String? phase;
  final String? garagePhase;

  /// Home only: a paid, unrated job to ask about once (scenario 76).
  final String? ratingPromptJobId;

  /// Identity of the screen this target opens — equal keys mean "the screen
  /// already shown is the right one", so a resync does not re-push it.
  String get key {
    final id = jobId.isNotEmpty
        ? jobId
        : sosId.isNotEmpty
            ? sosId
            : serviceRequestId;
    return id.isEmpty ? route : '$route|$id';
  }

  static String keyFor(String route, String? id) =>
      (id == null || id.isEmpty) ? route : '$route|$id';

  @override
  String toString() => 'SessionTarget($key, status=$status, phase=$phase)';
}

class SessionResume {
  SessionResume._();

  static String _idOf(Map m) => m['_id']?.toString() ?? m['id']?.toString() ?? '';

  /// The routing decision only — no navigation, no BuildContext.
  static SessionTarget resolve(
    Map<String, dynamic> session, {
    String? preferredEvent,
  }) {
    final activeSos = session['active_sos'];
    final activeJob = session['active_job'];
    final liveJob = session['live_job'] is Map
        ? session['live_job']
        : activeJob is Map && session['unpaid_job'] is! Map
            ? activeJob
            : null;
    final unpaidJob = session['unpaid_job'];
    final activeServiceRequest = session['active_service_request'];
    final kind = session['session_kind']?.toString();

    if (activeSos is Map) {
      final status = activeSos['status']?.toString();
      final sosId = _idOf(activeSos);
      if (status == 'pending') {
        return SessionTarget(route: Routes.timerSos, sosId: sosId, status: 'pending');
      }
      if (status == 'in_call' || preferredEvent == 'sosInCall') {
        return SessionTarget(route: Routes.inCall, sosId: sosId, status: status ?? 'in_call');
      }
    }

    if (liveJob is Map) {
      final status = liveJob['job_status']?.toString() ?? '';
      final jobId = _idOf(liveJob);
      final garagePhase = resolveGaragePhase(liveJob, sessionKind: kind);
      if (jobId.isNotEmpty && status == 'pending') {
        return SessionTarget(route: Routes.findingTechnician, jobId: jobId, status: status);
      }
      if (jobId.isNotEmpty && shouldOpenTrackingForLiveJob(status, garagePhase)) {
        return SessionTarget(
          route: Routes.technicianTracking,
          jobId: jobId,
          status: status,
          phase: trackingInitialPhase(status, garagePhase),
          garagePhase: garagePhase,
        );
      }
      if (jobId.isNotEmpty && (garagePhase == 'at_garage' || status == 'on_hold')) {
        return SessionTarget(
          route: Routes.activityDetails,
          jobId: jobId,
          status: status,
          garagePhase: garagePhase,
        );
      }
      if (jobId.isNotEmpty && (status == 'in_progress' || preferredEvent == 'jobStarted')) {
        return SessionTarget(route: Routes.jobInProgress, jobId: jobId, status: status);
      }
    }

    if (kind == 'unpaid' || (unpaidJob is Map && liveJob is! Map && activeSos is! Map)) {
      final job = unpaidJob is Map ? unpaidJob : activeJob is Map ? activeJob : const {};
      return SessionTarget(
        route: Routes.paymentHold,
        jobId: _idOf(job),
        status: job['job_status']?.toString() ?? 'completed',
      );
    }

    if (activeServiceRequest is Map) {
      final srId = _idOf(activeServiceRequest);
      final status = activeServiceRequest['status']?.toString() ?? '';
      if (srId.isNotEmpty && (status == 'pending' || status == 'assigned')) {
        return SessionTarget(
          route: Routes.serviceWaiting,
          serviceRequestId: srId,
          status: status,
        );
      }
    }

    final prompt = session['rating_prompt_job'];
    final promptId = prompt is Map ? _idOf(prompt) : '';
    return SessionTarget(
      route: Routes.home,
      ratingPromptJobId: promptId.isEmpty ? null : promptId,
    );
  }

  static Future<void> go(
    BuildContext context,
    Map<String, dynamic> session, {
    String? preferredEvent,
    bool replace = true,
  }) async {
    final target = resolve(session, preferredEvent: preferredEvent);
    final activeJob = session['active_job'];
    final liveJob = session['live_job'] is Map
        ? session['live_job']
        : activeJob;
    final unpaidJob = session['unpaid_job'];
    final activeServiceRequest = session['active_service_request'];
    SosSupportContact.updateFrom(session);

    void open(String route, {Object? arguments}) {
      if (!context.mounted) return;
      if (replace) {
        context.offNamed(route, arguments: arguments);
      } else {
        context.toNamed(route, arguments: arguments);
      }
    }

    switch (target.route) {
      case Routes.timerSos:
      case Routes.inCall:
        // The SOS screens scope their events by this id (scenario 62).
        try {
          final cubit = context.read<SosCubit>();
          if (target.sosId.isNotEmpty) cubit.sosId = target.sosId;
        } catch (_) {}
        open(target.route);
        return;
      case Routes.findingTechnician:
        open(
          Routes.findingTechnician,
          arguments: FindingTechnicianArgs(
            jobId: target.jobId,
            jobReference: (liveJob as Map)['job_reference']?.toString() ?? '',
          ),
        );
        return;
      case Routes.technicianTracking:
        final job = liveJob as Map;
        // The job's own coordinates, else this phone's last fix — never a
        // made-up Doha default (scenario 61): without one the ETA is hidden.
        final loc = customerLatLng(job, context);
        open(
          Routes.technicianTracking,
          arguments: TrackingArgs(
            jobId: target.jobId,
            techInfo: techInfoFromJob(job),
            customerLat: loc?.$1,
            customerLng: loc?.$2,
            initialPhase: target.phase ?? 'en_route',
            techLat: techLat(job),
            techLng: techLng(job),
            cancelPolicy: session['cancel_policy'] is Map
                ? Map<String, dynamic>.from(session['cancel_policy'] as Map)
                : null,
          ),
        );
        return;
      case Routes.activityDetails:
        open(Routes.activityDetails, arguments: jobDtoFromSession(liveJob as Map));
        return;
      case Routes.jobInProgress:
        final job = liveJob as Map;
        final tech = techInfoFromJob(job);
        open(
          Routes.jobInProgress,
          arguments: JobProgressArgs(
            userName: '',
            bannerTitle: 'home.job_in_progress'.tr(),
            bannerBody: 'job_progress.banner_body'.tr(),
            jobId: target.jobId,
            jobReference: job['job_reference']?.toString() ?? '',
            statusPillText: JobStatusLabels.labelFor('in_progress'),
            technicianName: tech['name'] ?? '',
            technicianPhone: tech['phone'] ?? '',
            technicianAvatarUrl: tech['photo'] ?? '',
            vehicleName: vehicleName(job),
            vehicleCode: '',
            price: _priceOf(job),
            paymentStatus: job['payment_status']?.toString(),
            paymentMethod: job['payment_method']?.toString(),
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
      case Routes.paymentHold:
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
      case Routes.serviceWaiting:
        open(
          Routes.serviceWaiting,
          arguments: ServiceWaitingArgs.fromBooking(
            Map<String, dynamic>.from(activeServiceRequest as Map),
          ),
        );
        return;
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

  // Server-priced total (pricing.total), not job.price — see job_price.dart.
  static num? _priceOf(Map job) => jobPayableTotal(job);

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

  /// `assigned` / `accepted` get their own phase (scenario 63): mapping them
  /// to `en_route` showed "Cancel (fee)" on a job the server cancels free.
  static String trackingInitialPhase(String status, String? garagePhase) {
    if (status == 'on_hold') return 'on_hold';
    // Car back from the garage: "returning" until the technician moves.
    if (garagePhase == 'returning' && (status == 'assigned' || status == 'accepted')) {
      return 'returning';
    }
    if (status == 'arrived') return 'arrived';
    if (status == 'assigned' || status == 'accepted') return 'assigned';
    return 'en_route';
  }

  static JobDto jobDtoFromSession(Map job) {
    final json = Map<String, dynamic>.from(job);
    json['_id'] ??= json['id'];
    json['dateTime'] ??= json['createdAt'];
    return JobDto.fromJson(json);
  }
}
