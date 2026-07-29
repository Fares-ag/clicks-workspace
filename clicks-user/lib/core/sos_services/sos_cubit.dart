// lib/cubits/sos_cubit.dart
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import '../../features/welcome/logic/services/welcome_service.dart';
import 'customer_socket_service.dart';

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
  TechnicianAssigned(this.technicianInfo, this.jobId);
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
  LocationUpdated(this.latitude, this.longitude, this.heading, this.jobId);
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
  final Map<String, dynamic> technician;
  JobCompleted(this.jobId, this.totalAmount, this.receipt, this.technician);
}

class SosExpired extends SosState {}

class SosCancelled extends SosState {}

class JobCancelled extends SosState {
  final String jobId;
  JobCancelled(this.jobId);
}

class SosError extends SosState {
  final String message;
  SosError(this.message);
}

class SosCubit extends Cubit<SosState> {
  final CustomerSocketService socketService;

  SosCubit(this.socketService) : super(SosInitial()) {
    _setupSocketListeners();
  }

  String? sosId;
  DateTime? expiresAt;
  Position? lastKnownPosition;

  /// Reset cubit to initial state so a new SOS flow can start cleanly.
  void reset() {
    sosId = null;
    expiresAt = null;
    emit(SosInitial());
  }

  DateTime? _parseExpiresAt(dynamic raw) {
    if (raw == null) return null;
    if (raw is DateTime) return raw;
    return DateTime.tryParse(raw.toString());
  }

  void _setupSocketListeners() {
    socketService.onSosCreated = (data) {
      _log('📱 SOS Created: ${data['sos_id']}');
      sosId = data['sos_id']?.toString();
      expiresAt = _parseExpiresAt(data['expires_at']);
      emit(SosCreated(sosId!, expiresAt: expiresAt));
    };

    socketService.onSosInCall = (data) {
      _log('📞 SOS In Call');
      emit(SosInCall(data['sos_id']));
    };

    socketService.onTechnicianAssigned = (data) {
      _log('🔧 Technician Assigned');
      emit(TechnicianAssigned(data['technician'], data['job_id']));
    };

    socketService.onTechnicianAccepted = (data) {
      _log('✅ Technician Accepted');
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

      emit(
        LocationUpdated(
          lat,
          lng,
          (data['heading'] ?? 0).toDouble(),
          data['job_id'],
        ),
      );
    };

    socketService.onTechnicianArrived = (data) {
      _log('🎉 Technician Arrived');
      emit(TechnicianArrived(data['job_id'], data['arrived_at']));
    };

    socketService.onJobStarted = (data) {
      _log('🔧 Job Started');
      emit(JobStarted(
        data['job_id'],
        data['started_at'],
        issue: data['issue'] ?? '',
        dateTime: data['dateTime'],
        estimateTimeMinutes: data['technician_estimate_time'] ?? data['admin_estimate_time'],
      ));
    };

    socketService.onJobCompleted = (data) {
      _log('💰 Job Completed');
      emit(
        JobCompleted(
          data['job_id'],
          double.parse(data['total_amount'].toString()),
          data['receipt'],
          data['technician'],
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
      emit(SosCancelled());
    };

    socketService.onError = (data) {
      _log('❌ Error: $data');
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : null;
      final code = map?['code']?.toString();
      if (code == 'LAUNCH_PUBLIC_SOS_OFF') {
        emit(SosError(
          map?['message']?.toString() ??
              'SOS is temporarily unavailable. Please try again later.',
        ));
        return;
      }
      emit(SosError(map?['message']?.toString() ?? 'Unknown error'));
    };

    socketService.onJobCancelled = (data) {
      _log('❌ Job Cancelled');
      emit(JobCancelled(data['job_id']));
    };
  }

  Future<void> createSOS({
    String? customerVehicleId,
    String? serviceType,
    bool skipVehicle = false,
  }) async {
    emit(SosLoading());

    // Ensure socket is connected before attempting to create SOS
    if (!socketService.isConnected) {
      _log('⚠️ Socket disconnected, attempting reconnect...');
      socketService.reconnect();

      // Wait briefly for reconnection (up to 3 seconds)
      int attempts = 0;
      while (!socketService.isConnected && attempts < 6) {
        await Future.delayed(const Duration(milliseconds: 500));
        attempts++;
      }

      if (!socketService.isConnected) {
        _log('❌ Socket reconnect failed');
        emit(SosError('Connection failed. Please check your internet and try again.'));
        return;
      }
    }

    try {
      Position position;
      try {
        position = await WelcomeService.determinePosition().timeout(
          const Duration(seconds: 12),
        );
      } catch (_) {
        if (lastKnownPosition != null) {
          position = lastKnownPosition!;
        } else {
          emit(SosError(
            'Failed to get location. Allow location access and try again.',
          ));
          return;
        }
      }
      lastKnownPosition = position;
      socketService.createSOS(
        customerVehicleId: customerVehicleId,
        latitude: position.latitude,
        longitude: position.longitude,
        serviceType: serviceType,
        skipVehicle: skipVehicle,
      );
    } catch (e) {
      _log('❌ createSOS error: $e');
      emit(SosError('Failed to get location. Please enable GPS and try again.'));
    }
  }

  void connectSocket(String customerId) {
    socketService.connect(customerId);
    
  }

  void cancelSOS({String? reason}) {
    socketService.cancelSOS(sosId, reason: reason);
  }

}
