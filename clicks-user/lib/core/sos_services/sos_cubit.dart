// lib/cubits/sos_cubit.dart
import 'dart:math' as math;

import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kDebugMode, visibleForTesting;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../features/welcome/logic/services/welcome_service.dart';
import '../helper/booking_errors.dart';
import '../monitoring/sentry_config.dart';
import 'customer_socket_service.dart';
import 'sos_support_contact.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

abstract class SosState {}

class SosInitial extends SosState {}

class SosLoading extends SosState {}

class SosCreated extends SosState {
  final String sosId;
  final DateTime? expiresAt;
  SosCreated(this.sosId, {this.expiresAt});
}

class SosInCall extends SosState {
  final String sosId;
  SosInCall(this.sosId);
}

class TechnicianAssigned extends SosState {
  final Map<String, dynamic> technicianInfo;
  final String jobId;
  final String sosId;
  TechnicianAssigned(this.technicianInfo, this.jobId, {this.sosId = ''});
}

class TechnicianAccepted extends SosState {
  final Map<String, dynamic> technicianInfo;
  final String jobId;
  final String acceptedAt;
  TechnicianAccepted(this.technicianInfo, this.jobId, this.acceptedAt);
}

class TechnicianEnRoute extends SosState {
  final String jobId;
  final String enRouteAt;
  final Map<String, dynamic> technicianInfo;
  TechnicianEnRoute(this.jobId, this.enRouteAt, this.technicianInfo);
}

class LocationUpdated extends SosState {
  final double latitude;
  final double longitude;
  final double heading;
  final String jobId;
  /// When the technician's phone reported this fix (server time), if sent.
  final DateTime? at;
  LocationUpdated(this.latitude, this.longitude, this.heading, this.jobId, {this.at});
}

class TechnicianArrived extends SosState {
  final String jobId;
  final String arrivedAt;
  TechnicianArrived(this.jobId, this.arrivedAt);
}

class JobStarted extends SosState {
  final String jobId;
  final String startedAt;
  final String issue;
  final String? dateTime;
  final int? estimateTimeMinutes;
  JobStarted(this.jobId, this.startedAt, {this.issue = '', this.dateTime, this.estimateTimeMinutes});
}

class JobCompleted extends SosState {
  final String jobId;
  final double totalAmount;
  final Map<String, dynamic>? receipt;
  final Map<String, dynamic>? technician;
  /// `paid` (incl. membership-covered) → ask for a rating; otherwise pay first.
  final String paymentStatus;
  JobCompleted(this.jobId, this.totalAmount, this.receipt, this.technician,
      {this.paymentStatus = ''});
}

class PaymentConfirmed extends SosState {
  final String jobId;
  final String paymentStatus;
  PaymentConfirmed(this.jobId, this.paymentStatus);
}

class SosExpired extends SosState {
  final String sosId;
  SosExpired({this.sosId = ''});
}

class SosCancelled extends SosState {
  final String sosId;
  SosCancelled({this.sosId = ''});
}

class JobCancelled extends SosState {
  final String jobId;
  final String sosId;
  /// customer | technician | admin (any actor, scenario 50).
  final String cancelledBy;
  JobCancelled(this.jobId, {this.sosId = '', this.cancelledBy = ''});
}

/// The technician handed the job back / rejected it: dispatch is finding
/// another one (scenario 46).
class JobReassigning extends SosState {
  final String jobId;
  final String sosId;
  JobReassigning(this.jobId, {this.sosId = ''});
}

/// Dispatch paused the job (parts, garage closed) — scenario 49.
class JobOnHold extends SosState {
  final String jobId;
  final String reason;
  JobOnHold(this.jobId, this.reason);
}

class JobResumed extends SosState {
  final String jobId;
  final String jobStatus;
  JobResumed(this.jobId, this.jobStatus);
}

/// No operator yet after the escalation ladder: show the call card (S38/40).
class SosStillConnecting extends SosState {
  final String sosId;
  final String message;
  SosStillConnecting(this.sosId, this.message);
}

class JobAtGarage extends SosState {
  final String jobId;
  JobAtGarage(this.jobId);
}

class JobGarageReady extends SosState {
  final String jobId;
  JobGarageReady(this.jobId);
}

class SosScheduled extends SosState {
  final String sosId;
  SosScheduled(this.sosId);
}

class SosClosed extends SosState {
  final String sosId;
  SosClosed(this.sosId);
}

class SosError extends SosState {
  final String message;
  SosError(this.message);
}

/// A fix was taken; the customer must confirm (and may drag) the pin before
/// the SOS is sent. [reliable] is false when the fix was missing, older than
/// [SosCubit.maxFixAge] or less accurate than [SosCubit.maxAccuracyMeters] —
/// the pin must then be placed by hand (scenario 31).
class SosConfirmLocation extends SosState {
  final double latitude;
  final double longitude;
  final double? accuracyM;
  final DateTime? fixTime;
  final bool reliable;
  SosConfirmLocation({
    required this.latitude,
    required this.longitude,
    required this.reliable,
    this.accuracyM,
    this.fixTime,
  });
}

class SosCubit extends Cubit<SosState> {
  final CustomerSocketService socketService;

  /// Customer-facing “we’ll call you” countdown — not the admin broadcast window.
  static const int contactCountdownSeconds = 60;

  SosCubit(this.socketService) : super(SosInitial()) {
    _setupSocketListeners();
  }

  /// Fixes older than this, or less accurate than [maxAccuracyMeters], are
  /// not trusted for dispatch (scenario 31).
  static const Duration maxFixAge = Duration(minutes: 2);
  static const double maxAccuracyMeters = 200;

  /// How long to wait for the server's createSOS acknowledgement.
  static const Duration createAckTimeout = Duration(seconds: 10);

  String? sosId;
  DateTime? expiresAt;
  Position? lastKnownPosition;

  /// What the customer still owes on earlier jobs (never blocks the SOS).
  double outstandingBalance = 0;

  /// Server said pending volume is over SOS_BUSY_PENDING — show call-us now.
  bool highDemand = false;

  /// Idempotency key for this SOS attempt — a retry after a timeout sends
  /// the same key, so the server returns the SOS it already saved.
  String? _clientRequestId;
  bool _awaitingCreateAck = false;
  String? _pendingVehicleId;
  String? _pendingServiceType;
  bool _pendingSkipVehicle = false;

  /// Reset cubit to initial state so a new SOS flow can start cleanly.
  void reset() {
    sosId = null;
    expiresAt = null;
    outstandingBalance = 0;
    highDemand = false;
    _clientRequestId = null;
    _awaitingCreateAck = false;
    emit(SosInitial());
  }

  static String _newClientRequestId() {
    final rnd = math.Random.secure();
    final bytes = List<int>.generate(12, (_) => rnd.nextInt(256));
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return 'sos-${DateTime.now().millisecondsSinceEpoch}-$hex';
  }

  static bool isReliableFix(Position p, {DateTime? now}) {
    final age = (now ?? DateTime.now()).difference(p.timestamp.toLocal());
    return !age.isNegative
        ? age <= maxFixAge && p.accuracy <= maxAccuracyMeters
        : p.accuracy <= maxAccuracyMeters;
  }

  void _applyHighDemand(Map<String, dynamic>? data) {
    if (data == null) return;
    if (data.containsKey('high_demand')) {
      highDemand = data['high_demand'] == true;
    }
    final sos = data['active_sos'];
    if (sos is Map && sos.containsKey('high_demand')) {
      highDemand = sos['high_demand'] == true;
    }
  }

  void _applyCreated(Map<String, dynamic> data) {
    sosId = data['sos_id']?.toString();
    final balance = data['outstanding_balance'];
    if (balance is num) outstandingBalance = balance.toDouble();
    _applyHighDemand(data);
    expiresAt = DateTime.now().add(
      const Duration(seconds: contactCountdownSeconds),
    );
  }

  @visibleForTesting
  void applyCreatedForTest(Map<String, dynamic> data) {
    _applyCreated(data);
    if (!isClosed && sosId != null && sosId!.isNotEmpty) {
      emit(SosCreated(sosId!, expiresAt: expiresAt));
    }
  }

  DateTime? _parseExpiresAt(dynamic raw) {
    if (raw == null) return null;
    if (raw is DateTime) return raw;
    return DateTime.tryParse(raw.toString());
  }

  Map<String, dynamic>? _asMap(dynamic raw) =>
      raw is Map ? Map<String, dynamic>.from(raw) : null;

  static String _str(dynamic data, String key) {
    if (data is! Map) return '';
    final v = data[key];
    return v == null ? '' : v.toString();
  }

  void _setupSocketListeners() {
    socketService.onSosCreated = (data) {
      _log('📱 SOS Created: ${data['sos_id']}');
      // The ack path below owns the transition while it is waiting; the room
      // event matters when the ack was lost (reconnect) or for a second device.
      if (_awaitingCreateAck) return;
      final map = data is Map ? Map<String, dynamic>.from(data) : null;
      final id = map?['sos_id']?.toString();
      if (id == null || id.isEmpty) return;
      if (sosId == id && state is SosCreated) return;
      if (map != null) _applyCreated(map);
      if (isClosed) return;
      emit(SosCreated(sosId!, expiresAt: expiresAt));
    };

    socketService.onSosInCall = (data) {
      _log('📞 SOS In Call');
      if (isClosed) return;
      final id = _str(data, 'sos_id');
      if (sosId == null || sosId!.isEmpty) sosId = id;
      emit(SosInCall(id));
    };

    socketService.onTechnicianAssigned = (data) {
      _log('🔧 Technician Assigned');
      if (isClosed) return;
      emit(TechnicianAssigned(
        _asMap(data is Map ? data['technician'] : null) ?? <String, dynamic>{},
        _str(data, 'job_id'),
        sosId: _str(data, 'sos_id'),
      ));
    };

    socketService.onJobReassigning = (data) {
      if (isClosed) return;
      emit(JobReassigning(_str(data, 'job_id'), sosId: _str(data, 'sos_id')));
    };

    socketService.onJobOnHold = (data) {
      if (isClosed) return;
      emit(JobOnHold(_str(data, 'job_id'), _str(data, 'hold_reason')));
    };

    socketService.onJobResumed = (data) {
      if (isClosed) return;
      emit(JobResumed(
        _str(data, 'job_id'),
        _str(data, 'job_status').isNotEmpty ? _str(data, 'job_status') : _str(data, 'status'),
      ));
    };

    socketService.onSosStillConnecting = (data) {
      if (isClosed) return;
      final map = _asMap(data);
      SosSupportContact.updateFrom(map);
      emit(SosStillConnecting(_str(data, 'sos_id'), _str(data, 'message')));
    };

    socketService.onTechnicianAccepted = (data) {
      _log('✅ Technician Accepted');
      if (isClosed) return;
      emit(
        TechnicianAccepted(
          data['technician'],
          data['job_id'],
          data['accepted_at'],
        ),
      );
    };

    socketService.onTechnicianEnRoute = (data) {
      _log('🚗 Technician En Route');
      if (isClosed) return;
      emit(TechnicianEnRoute(
        data['job_id'],
        data['en_route_at'],
        data['technician'] ?? {},
      ));
    };

    socketService.onLocationUpdate = (data) {
      final lat = (data['latitude'] as num?)?.toDouble() ?? 0.0;
      final lng = (data['longitude'] as num?)?.toDouble() ?? 0.0;

      // Guard: (0, 0) is a GPS fallback emitted while the device is still
      // acquiring a real fix. Ignore it so the tracking map never shows
      // the technician in the ocean off west Africa.
      if (lat == 0.0 && lng == 0.0) {
        _log('📍 [SosCubit] Skipping invalid (0, 0) locationUpdate — GPS not yet acquired');
        return;
      }

      if (isClosed) return;
      emit(
        LocationUpdated(
          lat,
          lng,
          ((data['heading'] ?? 0) as num).toDouble(),
          _str(data, 'job_id'),
          at: DateTime.tryParse(_str(data, 'timestamp'))?.toLocal(),
        ),
      );
    };

    socketService.onTechnicianArrived = (data) {
      _log('🎉 Technician Arrived');
      if (isClosed) return;
      emit(TechnicianArrived(data['job_id'], data['arrived_at']));
    };

    socketService.onJobStarted = (data) {
      _log('🔧 Job Started');
      if (isClosed) return;
      emit(JobStarted(
        data['job_id'],
        data['started_at'],
        issue: data['issue'] ?? '',
        dateTime: data['dateTime'],
        estimateTimeMinutes: data['technician_estimate_time'] ?? data['admin_estimate_time'],
      ));
    };

    socketService.onPaymentConfirmed = (data) {
      _log('💳 Payment confirmed');
      if (isClosed) return;
      final map = data is Map ? data : const <dynamic, dynamic>{};
      emit(
        PaymentConfirmed(
          map['job_id']?.toString() ?? '',
          map['payment_status']?.toString() ?? 'paid',
        ),
      );
    };

    socketService.onJobCompleted = (data) {
      _log('💰 Job Completed');
      if (isClosed) return;
      // Server sends only { job_id, job_status, payment_status }. Amount,
      // receipt and technician are optional — parsing them strictly used to
      // throw here and the customer never reached the rating flow.
      final map = data is Map ? data : const <dynamic, dynamic>{};
      emit(
        JobCompleted(
          map['job_id']?.toString() ?? '',
          double.tryParse('${map['total_amount'] ?? ''}') ?? 0,
          _asMap(map['receipt']),
          _asMap(map['technician']),
          paymentStatus: map['payment_status']?.toString() ?? '',
        ),
      );
    };

    socketService.onSosExpired = (data) {
      // Auto-expiry disabled: 60s UI timer is a contact promise only.
      // Keep waiting until in_call / cancel / job assignment.
      _log('⏰ SOS expire event ignored (SOS stays open): $data');
    };

    socketService.onSosCancelled = (data) {
      _log('❌ SOS Cancelled');
      if (isClosed) return;
      emit(SosCancelled(sosId: _str(data, 'sos_id')));
    };

    socketService.onError = (data) {
      _log('❌ Error: $data');
      // createSOS failures arrive on the ack; the parallel `error` /
      // `sosError` events would otherwise show the same message twice.
      if (_awaitingCreateAck) return;
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : null;
      final code = map?['code']?.toString();
      if (isClosed) return;
      emit(SosError(bookingErrorMessage(code, map?['message']?.toString())));
    };

    socketService.onJobCancelled = (data) {
      _log('❌ Job Cancelled');
      if (isClosed) return;
      emit(JobCancelled(
        _str(data, 'job_id'),
        sosId: _str(data, 'sos_id'),
        cancelledBy: _str(data, 'cancelled_by'),
      ));
    };

    socketService.onJobAtGarage = (data) {
      if (isClosed) return;
      final map = data is Map ? Map<String, dynamic>.from(data) : null;
      emit(JobAtGarage(map?['job_id']?.toString() ?? ''));
    };

    socketService.onJobGarageReady = (data) {
      if (isClosed) return;
      final map = data is Map ? Map<String, dynamic>.from(data) : null;
      emit(JobGarageReady(map?['job_id']?.toString() ?? ''));
    };

    socketService.onSosScheduled = (data) {
      if (isClosed) return;
      final map = data is Map ? Map<String, dynamic>.from(data) : null;
      emit(SosScheduled(map?['sos_id']?.toString() ?? ''));
    };

    socketService.onSosClosed = (data) {
      if (isClosed) return;
      final map = data is Map ? Map<String, dynamic>.from(data) : null;
      emit(SosClosed(map?['sos_id']?.toString() ?? ''));
    };
  }

  Future<bool> _ensureSocket() async {
    if (socketService.isConnected) return true;
    _log('⚠️ Socket disconnected, attempting reconnect...');
    socketService.reconnect();
    // Wait briefly for reconnection (up to 3 seconds)
    int attempts = 0;
    while (!socketService.isConnected && attempts < 6) {
      await Future.delayed(const Duration(milliseconds: 500));
      attempts++;
    }
    return socketService.isConnected;
  }

  /// Step 1 of an SOS: take a location fix and ask the customer to confirm
  /// the pin. The SOS itself is sent by [submitSOS].
  Future<void> createSOS({
    String? customerVehicleId,
    String? serviceType,
    bool skipVehicle = false,
  }) async {
    emit(SosLoading());
    _pendingVehicleId = customerVehicleId;
    _pendingServiceType = serviceType;
    _pendingSkipVehicle = skipVehicle;
    _clientRequestId ??= _newClientRequestId();

    Position? fix;
    try {
      fix = await WelcomeService.determinePosition().timeout(
        const Duration(seconds: 12),
      );
    } catch (e, st) {
      SentryConfig.captureException(
        StateError('SOS GPS read failed'),
        stackTrace: st,
        tags: const {'component': 'sos_cubit'},
      );
    }

    if (fix != null && isReliableFix(fix)) {
      lastKnownPosition = fix;
      if (isClosed) return;
      emit(SosConfirmLocation(
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        fixTime: fix.timestamp,
        reliable: true,
      ));
      return;
    }

    // No fix, a stale one, or a vague one: never send it silently. Start the
    // pin from the best guess and make the customer place it.
    Position? hint = fix;
    if (hint == null) {
      try {
        hint = await Geolocator.getLastKnownPosition();
      } catch (_) {}
    }
    hint ??= lastKnownPosition;
    if (isClosed) return;
    emit(SosConfirmLocation(
      latitude: hint?.latitude ?? 25.2854,
      longitude: hint?.longitude ?? 51.5310,
      accuracyM: hint?.accuracy,
      fixTime: hint?.timestamp,
      reliable: false,
    ));
  }

  /// The customer closed the confirm-location sheet without sending.
  void cancelLocationConfirm() {
    if (isClosed) return;
    emit(SosInitial());
  }

  /// Step 2: send the SOS with the confirmed pin and wait for the server's
  /// acknowledgement (10 s). On timeout or SOS_ALREADY_ACTIVE the session is
  /// fetched and the customer is routed to the SOS the server already has —
  /// never an endless spinner (scenario 30).
  Future<void> submitSOS({
    required double latitude,
    required double longitude,
    double? accuracyM,
    DateTime? fixTime,
    required bool pinMoved,
  }) async {
    emit(SosLoading());
    _clientRequestId ??= _newClientRequestId();

    if (!await _ensureSocket()) {
      _log('❌ Socket reconnect failed');
      // The SOS may still exist from an earlier attempt.
      if (await _recoverFromSession()) return;
      if (isClosed) return;
      emit(SosError('dispatch.connection_failed'.tr()));
      return;
    }

    Map<String, dynamic>? ack;
    _awaitingCreateAck = true;
    try {
      ack = await socketService.createSOS(
        customerVehicleId: _pendingVehicleId,
        latitude: latitude,
        longitude: longitude,
        serviceType: _pendingServiceType,
        skipVehicle: _pendingSkipVehicle,
        clientRequestId: _clientRequestId!,
        accuracyM: pinMoved ? null : accuracyM,
        fixTime: pinMoved ? null : fixTime,
        locationSource: pinMoved ? 'manual_pin' : 'gps',
        timeout: createAckTimeout,
      );
    } catch (e, st) {
      _log('❌ createSOS error: $e');
      SentryConfig.captureException(
        e,
        stackTrace: st,
        tags: const {'component': 'sos_cubit'},
      );
    } finally {
      _awaitingCreateAck = false;
    }

    if (isClosed) return;

    if (ack != null && ack['ok'] == true && ack['sos_id'] != null) {
      _applyCreated(ack);
      emit(SosCreated(sosId!, expiresAt: expiresAt));
      return;
    }

    final code = ack?['code']?.toString();
    if (ack == null || code == 'SOS_ALREADY_ACTIVE') {
      if (await _recoverFromSession(preferredSosId: ack?['sos_id']?.toString())) {
        return;
      }
      if (isClosed) return;
      emit(SosError(
        ack == null
            ? 'dispatch.sos_no_confirmation'.tr()
            : bookingErrorMessage(code, ack['message']?.toString()),
      ));
      return;
    }

    if (code == 'SOS_THROTTLED') {
      emit(SosError('dispatch.sos_throttled'.tr()));
      return;
    }
    emit(SosError(bookingErrorMessage(code, ack['message']?.toString())));
  }

  /// Route to whatever SOS the server holds for this customer. True when one
  /// was found and the matching state was emitted.
  Future<bool> _recoverFromSession({String? preferredSosId}) async {
    try {
      final session = await SessionService.getCustomerSession();
      SosSupportContact.updateFrom(session);
      _applyHighDemand(session);
      final balance = session['outstanding_balance'];
      if (balance is num) outstandingBalance = balance.toDouble();
      final sos = session['active_sos'];
      if (sos is! Map) return false;
      final id = sos['_id']?.toString() ?? sos['id']?.toString();
      if (id == null || id.isEmpty) return false;
      if (preferredSosId != null && preferredSosId.isNotEmpty && preferredSosId != id) {
        _log('ℹ️ session SOS $id differs from ack $preferredSosId — using session');
      }
      sosId = id;
      final sosBalance = sos['outstanding_balance'];
      if (sosBalance is num && sosBalance > 0) {
        outstandingBalance = sosBalance.toDouble();
      }
      expiresAt ??= DateTime.now().add(
        const Duration(seconds: contactCountdownSeconds),
      );
      if (isClosed) return true;
      if (sos['status']?.toString() == 'in_call') {
        emit(SosInCall(id));
      } else {
        emit(SosCreated(id, expiresAt: expiresAt));
      }
      return true;
    } catch (e) {
      _log('❌ session recovery failed: $e');
      return false;
    }
  }

  /// Refresh the outstanding balance / support number for the SOS screens.
  Future<void> refreshSessionExtras() async {
    try {
      final session = await SessionService.getCustomerSession();
      SosSupportContact.updateFrom(session);
      _applyHighDemand(session);
      final sos = session['active_sos'];
      final fromSos = sos is Map ? sos['outstanding_balance'] : null;
      final fromSession = session['outstanding_balance'];
      final value = fromSos is num && fromSos > 0 ? fromSos : fromSession;
      if (value is num) outstandingBalance = value.toDouble();
    } catch (_) {}
  }

  void connectSocket(String customerId) {
    socketService.connect(customerId);
    
  }

  /// Requests cancellation of the active SOS.
  ///
  /// Returns false when the request could not be sent at all (socket down or
  /// no known SOS id) — callers must then keep the user on the SOS screen
  /// instead of pretending the cancel succeeded. A true result only means the
  /// request left the device; the SOS is cancelled once the server replies
  /// with [SosCancelled].
  Future<bool> cancelSOS({String? reason}) async {
    // The app can be launched straight into the SOS flow from a push tap, in
    // which case sosId was never set locally — recover it from the server.
    if (sosId == null || sosId!.isEmpty) {
      final data = await SessionService.getCustomerActiveSos();
      final sos = data?['active_sos'];
      if (sos is Map) {
        sosId = sos['_id']?.toString();
      }
    }

    if (!socketService.isConnected) {
      _log('⚠️ Socket disconnected on cancel, attempting reconnect...');
      socketService.reconnect();
      int attempts = 0;
      while (!socketService.isConnected && attempts < 6) {
        await Future.delayed(const Duration(milliseconds: 500));
        attempts++;
      }
    }

    return socketService.cancelSOS(sosId, reason: reason);
  }

}
