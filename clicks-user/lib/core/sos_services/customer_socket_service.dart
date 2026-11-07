import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../api/auth_session.dart';
import '../api/dio_helper.dart';
import '../config/app_config.dart';
import '../helper/cache_helper.dart';
import '../monitoring/sentry_config.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class CustomerSocketService {
  static final CustomerSocketService _instance =
      CustomerSocketService._internal();
  factory CustomerSocketService() => _instance;
  CustomerSocketService._internal();

  sio.Socket? _socket;
  String? _customerId;

  void Function(dynamic)? onSosCreated;
  void Function(dynamic)? onSosInCall;
  void Function(dynamic)? onTechnicianAssigned;
  void Function(dynamic)? onTechnicianAccepted;
  void Function(dynamic)? onTechnicianEnRoute;
  void Function(dynamic)? onLocationUpdate;
  void Function(dynamic)? onTechnicianArrived;
  void Function(dynamic)? onJobStarted;
  void Function(dynamic)? onJobCompleted;
  void Function(dynamic)? onPaymentConfirmed;
  void Function(dynamic)? onJobAtGarage;
  void Function(dynamic)? onJobGarageReady;
  void Function(dynamic)? onSosExpired;
  void Function(dynamic)? onSosCancelled;
  void Function(dynamic)? onSosScheduled;
  void Function(dynamic)? onSosClosed;
  void Function(dynamic)? onJobCancelled;
  void Function(dynamic)? onError;

  bool get isConnected => _socket?.connected ?? false;

  void connect(String customerId) {
    // Avoid thrashing: rebuilds must not tear down a healthy socket.
    if (_socket != null &&
        isConnected &&
        _customerId == customerId) {
      return;
    }

    _customerId = customerId;
    _authRetries = 0;

    _socket?.dispose();
    _socket = sio.io(
      '${AppConfig.socketUrl}/customer',
      sio.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          // Callback-style auth: evaluated on EVERY (re)connect, so a token
          // refreshed after this socket was built is picked up instead of
          // retrying forever with the stale one (scenario 12).
          .setAuthFn((callback) {
            callback({'token': CacheHelper.getAuthToken() ?? ''});
          })
          .enableForceNew()
          .enableReconnection()
          .setReconnectionAttempts(999)
          .setReconnectionDelay(2000)
          .disableAutoConnect()
          .build(),
    );

    _socket!.connect();

    _socket!.onConnect((_) {
      _log('✅ Customer WebSocket Connected');
      _authRetries = 0;
      _socket!.emit('register');
    });

    _socket!.onDisconnect((reason) {
      _log('❌ Customer WebSocket Disconnected: $reason');
    });
    _socket!.onConnectError((err) {
      _log('❌ Customer socket connect error: $err');
      final message = err is Map ? err['message']?.toString() : err?.toString();
      if (message == 'ACCOUNT_INACTIVE') {
        // Blocked or deleted: stop reconnecting and show "contact support".
        _handleAccountInactive();
        return;
      }
      if (message == 'TOKEN_REVOKED' || message == 'Unauthorized') {
        // The server refused the handshake token. Refresh once and retry;
        // a middleware rejection does not auto-reconnect.
        _retryWithRefreshedToken();
        return;
      }
      SentryConfig.captureException(
        StateError('Customer socket connect error'),
        tags: const {'component': 'customer_socket'},
      );
    });
    _socket!.on('accountInactive', (_) => _handleAccountInactive());
    _socket!.onReconnect((_) {
      _log('🔄 Customer WebSocket reconnected');
      _socket!.emit('register');
    });

    _setupEventListeners();
  }

  int _authRetries = 0;

  void _handleAccountInactive() {
    disconnect();
    _customerId = null;
    AuthSession.openAccountInactive();
  }

  Future<void> _retryWithRefreshedToken() async {
    if (_authRetries >= 2) return;
    _authRetries++;
    final ok = await AuthSession.refreshIfNeeded(force: true);
    if (ok && _socket != null && !isConnected) {
      _socket!.connect();
    }
  }

  /// Call when app returns to foreground to ensure socket is alive.
  void ensureConnected() {
    if (_customerId == null) return;
    if (!isConnected) {
      reconnect();
    }
  }

  void _setupEventListeners() {
    _socket!.on('sosCreated', (data) {
      _log('📱 SOS Created: $data');
      onSosCreated?.call(data);
    });

    _socket!.on('sosInCall', (data) {
      _log('📞 SOS In Call: $data');
      onSosInCall?.call(data);
    });

    _socket!.on('technicianAssigned', (data) {
      _log('🔧 Technician Assigned: $data');
      onTechnicianAssigned?.call(data);
    });

    _socket!.on('technicianAccepted', (data) {
      _log('✅ Technician Accepted: $data');
      onTechnicianAccepted?.call(data);
    });

    _socket!.on('technicianEnRoute', (data) {
      _log('🚗 Technician En Route: $data');
      onTechnicianEnRoute?.call(data);
    });

    _socket!.on('locationUpdate', (data) {
      _log('📍 Location Update: $data');
      onLocationUpdate?.call(data);
    });

    _socket!.on('technicianArrived', (data) {
      _log('🎉 Technician Arrived: $data');
      onTechnicianArrived?.call(data);
    });

    _socket!.on('jobStarted', (data) {
      _log('🔧 Job Started: $data');
      onJobStarted?.call(data);
    });

    _socket!.on('jobAtGarage', (data) {
      _log('Garage Car at garage: $data');
      onJobAtGarage?.call(data);
    });

    _socket!.on('jobGarageReady', (data) {
      _log('Garage Ready for drop-off: $data');
      onJobGarageReady?.call(data);
    });

    _socket!.on('jobCompleted', (data) {
      _log('💰 Job Completed & Paid: $data');
      onJobCompleted?.call(data);
    });

    _socket!.on('paymentConfirmed', (data) {
      _log('💳 Payment Confirmed: $data');
      onPaymentConfirmed?.call(data);
    });

    _socket!.on('sosExpired', (data) {
      _log('⏰ SOS Expired: $data');
      onSosExpired?.call(data);
    });

    _socket!.on('sosCancelled', (data) {
      _log('❌ SOS Cancelled: $data');
      onSosCancelled?.call(data);
    });

    _socket!.on('sosScheduled', (data) {
      _log('📅 SOS Scheduled: $data');
      onSosScheduled?.call(data);
    });

    _socket!.on('sosClosed', (data) {
      _log('🗂️ SOS Closed: $data');
      onSosClosed?.call(data);
    });

    _socket!.on('jobCancelled', (data) {
      _log('❌ Job Cancelled by Admin: $data');
      onJobCancelled?.call(data);
    });

    _socket!.on('error', (data) {
      _log('❌ Socket Error: $data');
      SentryConfig.captureException(
        StateError('Customer socket error'),
        tags: const {'component': 'customer_socket'},
      );
      onError?.call(data);
    });
    _socket!.on('sosError', (data) {
      _log('❌ SOS Error: $data');
      SentryConfig.captureException(
        StateError('Customer SOS socket error'),
        tags: const {'component': 'customer_socket'},
      );
      onError?.call(data);
    });
  }

  void createSOS({
    String? customerVehicleId,
    required double latitude,
    required double longitude,
    String? serviceType,
    bool skipVehicle = false,
  }) {
    if (_socket == null || !isConnected) {
      _log('❌ Socket not connected — cannot send createSOS');
      onError?.call({'message': 'Socket not connected'});
      return;
    }

    final payload = <String, dynamic>{
      'customer_id': _customerId,
      'latitude': latitude,
      'longitude': longitude,
      'skip_vehicle': skipVehicle,
    };

    if (!skipVehicle &&
        customerVehicleId != null &&
        customerVehicleId.trim().isNotEmpty) {
      payload['customer_vehicle_id'] = customerVehicleId.trim();
    }

    if (serviceType != null && serviceType.trim().isNotEmpty) {
      payload['service_type'] = serviceType.trim();
    }

    _socket!.emit('createSOS', payload);
    _log('🚨 createSOS emitted with service type: $serviceType');
  }

  void reconnect() {
    if (_customerId == null) {
      _log('❌ Cannot reconnect: no customer ID');
      return;
    }
    _log('🔄 Reconnecting socket for customer $_customerId');
    disconnect();
    connect(_customerId!);
  }

  /// Emits `cancelSOS`. Returns false when the request could not be sent
  /// (socket down, unknown SOS id, missing reason) — the caller must NOT
  /// treat the SOS as cancelled in that case.
  bool cancelSOS(String? sosId, {String? reason}) {
    if (_socket == null || !isConnected || sosId == null || sosId.isEmpty) {
      _log('❌ cancelSOS not sent — connected=$isConnected sos_id=$sosId');
      return false;
    }
    final trimmed = reason?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      _log('❌ cancelSOS not sent — reason is required');
      return false;
    }
    _socket!.emit('cancelSOS', {
      'sos_id': sosId,
      'reason': trimmed,
    });
    _log('❌ cancelSOS emitted: $sosId reason=$trimmed');
    return true;
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _log('🔌 Socket disconnected');
  }
}

/// The session endpoint answered with a non-2xx status.
class SessionFetchException implements Exception {
  final int statusCode;
  final String? code;
  const SessionFetchException(this.statusCode, this.code);

  bool get isUnauthorized => statusCode == 401;
  bool get isAccountInactive => statusCode == 403 && code == 'ACCOUNT_INACTIVE';

  @override
  String toString() => 'SessionFetchException($statusCode, $code)';
}

class SessionService {
  /// Throws [SessionFetchException] on any non-2xx answer (scenario 67): a
  /// `{error: "buffering timed out"}` body used to be returned as if it were
  /// an empty session, so splash routed a customer with a technician on the
  /// way to an empty Home and they raised a second SOS.
  static Future<Map<String, dynamic>> getCustomerSession() async {
    try {
      final response = await DioHelper.getData(
        url: '/api/jobs/customer/session',
      );
      final status = response.statusCode ?? 0;
      final data = response.data;
      if (status < 200 || status >= 300 || data is! Map) {
        throw SessionFetchException(status, DioHelper.errorCode(response));
      }
      final session = Map<String, dynamic>.from(data);
      await AuthSession.rememberSession(session);
      return session;
    } catch (e, st) {
      _log('❌ SessionService.getCustomerSession error: $e');
      SentryConfig.captureException(
        e,
        stackTrace: st,
        tags: const {'component': 'customer_session'},
      );
      rethrow;
    }
  }

  static Future<Map<String, dynamic>?> getCustomerActiveJob() async {
    try {
      final response = await DioHelper.getData(
        url: '/api/jobs/customer/active',
      );
      return response.data;
    } catch (e, st) {
      _log('❌ SessionService.getCustomerActiveJob error: $e');
      SentryConfig.captureException(
        e,
        stackTrace: st,
        tags: const {'component': 'customer_session'},
      );
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getCustomerActiveSos() async {
    try {
      final response = await DioHelper.getData(
        url: '/api/jobs/customer/active-sos',
      );
      return response.data;
    } catch (e, st) {
      _log('❌ SessionService.getCustomerActiveSos error: $e');
      SentryConfig.captureException(
        e,
        stackTrace: st,
        tags: const {'component': 'customer_session'},
      );
      return null;
    }
  }
}
