import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:socket_io_client/socket_io_client.dart' as sio;

import '../config/app_config.dart';
import '../helper/cache_helper.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[AdminSocket] $msg');
  }
}

enum AdminNotificationType {
  sos,
  serviceRequest,
  businessLead,
  businessJob,
  technicianJob,
}

class AdminSocketEvent {
  AdminSocketEvent({
    required this.type,
    required this.data,
    required this.id,
  });

  final AdminNotificationType type;
  final Map<String, dynamic> data;
  final String id;
}

/// Socket.IO client for `/admin` namespace — mirrors AdminLayout.jsx.
class AdminSocketService {
  AdminSocketService._();
  static final AdminSocketService instance = AdminSocketService._();

  sio.Socket? _socket;
  String? _boundToken;
  String? _adminId;
  bool _listenersBound = false;

  void Function(AdminSocketEvent event)? onNotification;
  void Function()? onSosInvalidated;
  void Function()? onServiceRequestInvalidated;
  void Function()? onLeadInvalidated;
  void Function()? onJobInvalidated;
  void Function(String message)? onInfo;
  void Function(String message)? onError;

  // Live map socket handlers
  void Function(dynamic raw)? onLiveMapBatch;
  void Function(dynamic raw)? onLiveMapUpdate;
  void Function(dynamic raw)? onLiveMapStale;
  void Function(dynamic raw)? onLiveMapOnline;
  void Function(dynamic raw)? onLiveMapOffline;
  bool _liveMapJoined = false;

  bool get isConnected => _socket?.connected ?? false;

  static String notificationId(AdminNotificationType type, Map data) {
    switch (type) {
      case AdminNotificationType.sos:
        return _str(data['sos_id'] ?? data['id'] ?? data['_id']);
      case AdminNotificationType.businessLead:
        return _str(data['lead_id'] ?? data['id'] ?? data['_id']);
      case AdminNotificationType.businessJob:
      case AdminNotificationType.technicianJob:
        return _str(data['job_id'] ?? data['id'] ?? data['_id']);
      case AdminNotificationType.serviceRequest:
        return _str(
          data['service_request_id'] ?? data['id'] ?? data['_id'],
        );
    }
  }

  static String _str(dynamic v) => v?.toString() ?? '';

  void connect({required String adminId}) {
    final token = CacheHelper.getAuthToken() ?? '';
    _adminId = adminId;

    if (_socket != null && isConnected && _boundToken == token) {
      return;
    }

    if (_socket != null && _boundToken != token) {
      disconnect();
    }

    if (_socket != null) {
      if (!isConnected) _socket!.connect();
      return;
    }

    _boundToken = token;
    _listenersBound = false;

    _socket = sio.io(
      '${AppConfig.socketUrl}/admin',
      sio.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableForceNew()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(1000)
          .disableAutoConnect()
          .build(),
    );

    _bindListeners();
    _socket!.connect();
  }

  void _bindListeners() {
    if (_socket == null || _listenersBound) return;
    _listenersBound = true;

    _socket!.onConnect((_) {
      _log('connected');
      final id = _adminId;
      if (id != null && id.isNotEmpty) {
        _socket!.emit('register', id);
      }
      if (_liveMapJoined) {
        _socket!.emit('joinLiveMap');
      }
    });

    _socket!.onConnectError((err) {
      _log('connect error: $err');
    });

    _socket!.on('newSOSRequest', (raw) {
      final data = _asMap(raw);
      _emitNotification(
        AdminNotificationType.sos,
        data,
      );
      onSosInvalidated?.call();
    });

    _socket!.on('newServiceRequest', (raw) {
      final data = _asMap(raw);
      _emitNotification(AdminNotificationType.serviceRequest, data);
      onServiceRequestInvalidated?.call();
    });

    _socket!.on('serviceRequestCancelled', (raw) {
      onServiceRequestInvalidated?.call();
    });

    _socket!.on('newBusinessLead', (raw) {
      final data = _asMap(raw);
      _emitNotification(AdminNotificationType.businessLead, data);
      onLeadInvalidated?.call();
    });

    _socket!.on('newBusinessJob', (raw) {
      final data = _asMap(raw);
      final type = data['lead_id'] != null
          ? AdminNotificationType.businessLead
          : AdminNotificationType.businessJob;
      _emitNotification(type, data);
      onLeadInvalidated?.call();
      onJobInvalidated?.call();
    });

    _socket!.on('newTechnicianJob', (raw) {
      final data = _asMap(raw);
      _emitNotification(AdminNotificationType.technicianJob, data);
      onJobInvalidated?.call();
    });

    _socket!.on('sosExpired', (_) => onSosInvalidated?.call());

    _socket!.on('sosClaimed', (raw) {
      final data = _asMap(raw);
      final myId = _adminId ?? '';
      if (myId.isNotEmpty && _str(data['admin_id']) != myId) {
        onInfo?.call('SOS claimed by another dispatcher');
      }
      onSosInvalidated?.call();
    });

    _socket!.on('sosCancelled', (_) => onSosInvalidated?.call());

    _socket!.on('error', (raw) {
      final data = _asMap(raw);
      final code = data['code']?.toString() ?? '';
      if (code == 'SOS_ALREADY_CLAIMED') {
        onError?.call('SOS already claimed by another dispatcher');
      } else if (code == 'SOS_UNAVAILABLE') {
        onError?.call('SOS is no longer available');
      }
      onSosInvalidated?.call();
    });

    _socket!.on('technicianLocationBatch', (raw) => onLiveMapBatch?.call(raw));
    _socket!.on('technicianLocationUpdate', (raw) => onLiveMapUpdate?.call(raw));
    _socket!.on('technicianLocationStale', (raw) => onLiveMapStale?.call(raw));
    _socket!.on('technicianOnline', (raw) => onLiveMapOnline?.call(raw));
    _socket!.on('technicianOffline', (raw) => onLiveMapOffline?.call(raw));
  }

  void joinLiveMap() {
    _liveMapJoined = true;
    _socket?.emit('joinLiveMap');
  }

  void leaveLiveMap() {
    _liveMapJoined = false;
  }

  void emitSosAccepted({required String sosId, required String customerId}) {
    _socket?.emit('sosAccepted', {
      'sos_id': sosId,
      'customer_id': customerId,
    });
  }

  void _emitNotification(AdminNotificationType type, Map<String, dynamic> data) {
    onNotification?.call(
      AdminSocketEvent(
        type: type,
        data: data,
        id: notificationId(type, data),
      ),
    );
  }

  Map<String, dynamic> _asMap(dynamic raw) {
    if (raw is Map) {
      return raw.map((k, v) => MapEntry(k.toString(), v));
    }
    return {};
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _boundToken = null;
    _listenersBound = false;
  }
}
