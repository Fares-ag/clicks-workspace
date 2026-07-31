import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../config/app_config.dart';
import '../config/product_rules.dart';
import '../helper/cache_helper.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

/// WebSocket service for the technician's `/technician` namespace.
///
/// Event names match [clicks-customer-tech-api] `sosSocketService.js`.
/// Handoff docs that say `jobAssigned` are wrong for this backend — canonical
/// emit is [ProductRules.socketNewJobAssigned]; we also listen to the alias.
class TechnicianSocketService {
  static final TechnicianSocketService _instance =
      TechnicianSocketService._internal();
  factory TechnicianSocketService() => _instance;
  TechnicianSocketService._internal();

  sio.Socket? _socket;

  void Function(dynamic)? onNewJobAssigned;
  void Function(dynamic)? onEnRouteConfirmed;
  void Function(dynamic)? onArrivedConfirmed;
  void Function(dynamic)? onJobStartedConfirmed;
  void Function(dynamic)? onPaymentConfirmed;
  void Function(dynamic)? onJobCancelled;
  void Function(dynamic)? onJobReassigned;
  void Function(dynamic)? onError;
  void Function()? onConnected;
  void Function()? onDisconnected;

  bool get isConnected => _socket?.connected ?? false;

  void connect() {
    final token = CacheHelper.get("token")?.toString();

    _socket?.dispose();
    _socket = sio.io(
      '${AppConfig.socketUrl}/technician',
      sio.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token ?? ''})
          .enableForceNew()
          .disableAutoConnect()
          .build(),
    );

    _socket!.connect();

    _socket!.onConnect((_) {
      _log('✅ Technician WebSocket Connected');
      // Server takes technician id from JWT — no client payload required.
      _socket!.emit('register');
      onConnected?.call();
    });

    _socket!.onDisconnect((_) {
      _log('❌ Technician WebSocket Disconnected');
      onDisconnected?.call();
    });

    _socket!.onConnectError((err) {
      _log('❌ Technician socket connect error: $err');
      onError?.call({'message': 'Socket connection failed'});
    });

    _setupEventListeners();
  }

  void _setupEventListeners() {
    void handleAssigned(dynamic data) {
      final jobId = data is Map
          ? (data['job_id'] ?? data['_id'])?.toString()
          : null;
      _log('🆕 New Job Assigned${jobId != null ? ' id=$jobId' : ''}');
      onNewJobAssigned?.call(data);
    }

    void logJobEvent(String label, dynamic data) {
      final jobId = data is Map
          ? (data['job_id'] ?? data['_id'])?.toString()
          : null;
      _log('$label${jobId != null ? ' id=$jobId' : ''}');
    }

    _socket!.on(ProductRules.socketNewJobAssigned, handleAssigned);
    // Handoff alias — tech-api currently emits newJobAssigned only.
    _socket!.on(ProductRules.socketNewJobAssignedAlias, handleAssigned);

    _socket!.on('enRouteConfirmed', (data) {
      logJobEvent('🚗 En Route Confirmed', data);
      onEnRouteConfirmed?.call(data);
    });

    _socket!.on('arrivedConfirmed', (data) {
      logJobEvent('🎉 Arrived Confirmed', data);
      onArrivedConfirmed?.call(data);
    });

    _socket!.on('jobStartedConfirmed', (data) {
      logJobEvent('🔧 Job Started Confirmed', data);
      onJobStartedConfirmed?.call(data);
    });

    _socket!.on('paymentConfirmed', (data) {
      logJobEvent('💰 Payment Confirmed', data);
      onPaymentConfirmed?.call(data);
    });

    _socket!.on('jobCancelled', (data) {
      logJobEvent('❌ Job Cancelled', data);
      onJobCancelled?.call(data);
    });

    // Forward-compatible: not emitted by current tech-api, but handoff expects it.
    _socket!.on('jobReassigned', (data) {
      logJobEvent('♻️ Job Reassigned', data);
      onJobReassigned?.call(data);
    });

    _socket!.on('error', (data) {
      final message =
          (data is Map ? data['message'] : null)?.toString() ?? 'Socket error';
      _log('❌ Socket Error: $message');
      onError?.call(data);
    });
  }

  void updateLocation({
    required String technicianId,
    required double latitude,
    required double longitude,
    String? jobId,
  }) {
    if (_socket == null || !isConnected) return;

    final payload = <String, dynamic>{
      'technician_id': technicianId,
      'latitude': latitude,
      'longitude': longitude,
    };
    if (jobId != null && jobId.isNotEmpty) {
      payload['job_id'] = jobId;
    }

    _socket!.emit('updateLocation', payload);
  }

  void startEnRoute(String jobId) {
    if (_socket == null || !isConnected) return;
    _socket!.emit('startEnRoute', {'job_id': jobId});
  }

  void markArrived(String jobId) {
    if (_socket == null || !isConnected) return;
    _socket!.emit('markArrived', {'job_id': jobId});
  }

  void startJob(String jobId) {
    if (_socket == null || !isConnected) return;
    _socket!.emit('startJob', {'job_id': jobId});
  }

  void paymentReceived(String jobId, {String? paymentMethod, String? notes}) {
    if (_socket == null || !isConnected) return;

    final payload = <String, dynamic>{'job_id': jobId};
    if (paymentMethod != null) payload['payment_method'] = paymentMethod;
    if (notes != null) payload['notes'] = notes;

    _socket!.emit('paymentReceived', payload);
  }

  void reconnect() {
    disconnect();
    connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _log('🔌 Technician socket disconnected');
  }

  void clearHandlers() {
    onNewJobAssigned = null;
    onEnRouteConfirmed = null;
    onArrivedConfirmed = null;
    onJobStartedConfirmed = null;
    onPaymentConfirmed = null;
    onJobCancelled = null;
    onJobReassigned = null;
    onError = null;
    onConnected = null;
    onDisconnected = null;
  }
}
