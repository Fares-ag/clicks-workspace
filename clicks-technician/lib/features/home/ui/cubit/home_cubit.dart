import 'dart:async';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:bloc/bloc.dart';
import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:geolocator/geolocator.dart';

import '../../../../core/config/job_fulfill_status.dart';
import '../../../../core/api/dio_helper.dart';
import '../../../../core/api/end_points/end_points.dart';
import '../../../../core/helper/cache_helper.dart';
import '../../../../core/notifications/job_notification_service.dart';
import '../../../../core/sos_services/technician_socket_service.dart';

part 'home_state.dart';

class HomeCubit extends Cubit<HomeState> {
  HomeCubit() : super(HomeInitial()) {
    _init();
  }

  final TechnicianSocketService _socketService = TechnicianSocketService();

  /// Background GPS stream (movement-based updates).
  StreamSubscription<Position>? _locationStream;

  /// Time-based heartbeat so a stationary tech still reports liveness and the
  /// admin Live Map + disconnect policy stay fresh (critical at fleet scale).
  Timer? _locationHeartbeat;

  Timer? _sessionPollTimer;
  int _revision = 0;

  /// How often to force-send a position even when the tech isn't moving.
  static const Duration _heartbeatInterval = Duration(seconds: 12);

  String get technicianId =>
      CacheHelper.get('technician_id')?.toString() ?? '';
  String get technicianName =>
      CacheHelper.get('technician_name')?.toString() ?? '';

  bool isOnline = false;
  bool isLoadingStatus = false;
  bool isLoadingAction = false;
  bool sessionLoadFailed = false;
  bool locationWarning = false;
  bool socketConnected = false;
  String? homeHeroUrl;
  bool signatureClearedBanner = false;
  String? lastActionError;

  /// Last GPS fix from location tracking (for live Active Job map).
  double? lastLatitude;
  double? lastLongitude;

  /// Dashboard balance for Home pill (totalEarnings).
  double? balanceQar;

  /// Unread notification count for bell badge.
  int unreadNotifications = 0;

  /// Raw job JSON — REST session or `newJobAssigned` socket payload.
  Map<String, dynamic>? activeJob;

  /// All fulfill-path / unpaid jobs from session (multi-job queue).
  List<Map<String, dynamic>> activeJobs = [];

  /// When true, [MainShell] should switch to the Home tab (Continue job).
  bool pendingNavigateHome = false;

  /// Client-side start proximity hint (meters). Server enforces the real limit.
  static const double startMaxMeters = 200;

  /// Recent completed jobs (read-only history).
  List<Map<String, dynamic>> jobHistory = [];

  void _emitLoaded() {
    if (isClosed) return;
    _revision++;
    emit(HomeLoaded(_revision));
  }

  Future<void> _init() async {
    emit(HomeLoading());
    _wireNotificationCallbacks();
    _connectSocket();
    await fetchSession();
    await _clearPendingJobNotificationKey();
    await Future.wait([fetchHistory(), fetchHomeMeta()]);
    // Register FCM after session so JWT is present.
    // ignore: discarded_futures
    JobNotificationService.instance.registerTokenWithBackend();
  }

  /// Clear pending notification job id after session has been loaded.
  Future<void> _clearPendingJobNotificationKey() async {
    final pendingId = CacheHelper.get(kPendingJobIdKey)?.toString();
    if (pendingId == null || pendingId.isEmpty) return;
    await CacheHelper.remove(kPendingJobIdKey);
  }

  /// On resume: refresh session when a notification left a pending job id.
  Future<void> _hydrateFromPendingNotification() async {
    final pendingId = CacheHelper.get(kPendingJobIdKey)?.toString();
    if (pendingId == null || pendingId.isEmpty) return;
    await fetchSession();
    await CacheHelper.remove(kPendingJobIdKey);
  }

  void _wireNotificationCallbacks() {
    final notif = JobNotificationService.instance;
    notif.onJobAcceptedFromNotification = (_) {
      fetchSession();
      fetchHistory();
      notif.cancelUrgentJobNotification();
    };
    notif.onNotificationOpened = (_) {
      fetchSession();
    };
    notif.onForegroundJobAssigned = (_) {
      fetchSession();
    };
    notif.onJobAcceptFromNotificationFailed = (_, message) {
      emit(HomeActionError(message ?? 'Could not accept job from notification'));
      _emitLoaded();
    };
  }

  /// Balance pill + notification unread (non-blocking for fulfill path).
  Future<void> fetchHomeMeta() async {
    try {
      final dash = await DioHelper.getData(url: EndPoints.dashboard);
      if (dash.statusCode == 200) {
        final perf = dash.data['performance'];
        if (perf is Map) {
          final v = perf['totalEarnings'] ?? perf['cashBalance'];
          if (v is num) {
            balanceQar = v.toDouble();
          } else {
            balanceQar = double.tryParse(v?.toString() ?? '');
          }
          final hero = perf['homeHeroUrl']?.toString();
          if (hero != null && hero.isNotEmpty) homeHeroUrl = hero;
        }
      }
    } catch (_) {}

    try {
      final profile = await DioHelper.getData(url: EndPoints.profile);
      if (profile.statusCode == 200) {
        final t = profile.data['technician'] ?? profile.data;
        if (t is Map) {
          final hero = t['homeHeroUrl']?.toString();
          if (hero != null && hero.isNotEmpty) homeHeroUrl = hero;
        }
      }
    } catch (_) {}

    try {
      final unread =
          await DioHelper.getData(url: EndPoints.technicianNotificationsUnread);
      if (unread.statusCode == 200) {
        final c = unread.data['count'];
        unreadNotifications = c is num ? c.toInt() : int.tryParse('$c') ?? 0;
      }
    } catch (_) {}

    _emitLoaded();
  }

  void _connectSocket() {
    _socketService.clearHandlers();
    _socketService.reconnect();

    _socketService.onConnected = () {
      socketConnected = true;
      _emitLoaded();
      fetchSession();
    };

    _socketService.onDisconnected = () {
      socketConnected = false;
      _emitLoaded();
    };

    _socketService.onNewJobAssigned = (data) {
      final incoming = Map<String, dynamic>.from(data as Map);
      final incomingId =
          (incoming['_id'] ?? incoming['job_id'])?.toString();

      if (activeJob != null) {
        final currentId = jobId;
        final currentStatus = jobStatus;
        if (incomingId != null &&
            incomingId == currentId &&
            currentStatus == 'assigned') {
          activeJob = incoming;
        } else if (_isFulfillPathStatus(currentStatus)) {
          return;
        } else if (currentStatus.isEmpty || currentStatus == 'assigned') {
          activeJob = incoming;
        } else {
          return;
        }
      } else {
        activeJob = incoming;
      }
      // Keep beeping until Accept — start alarm even if FCM was missed.
      // ignore: discarded_futures
      JobNotificationService.instance.startInsistentAlarm();
      _emitLoaded();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onEnRouteConfirmed = (data) => _mergeJobStatus(data);
    _socketService.onArrivedConfirmed = (data) => _mergeJobStatus(data);
    _socketService.onJobStartedConfirmed = (data) => _mergeJobStatus(data);

    _socketService.onPaymentConfirmed = (data) {
      // Payment is mid-job now — keep active job and mark paid.
      // Only clear if the job is already completed (legacy unpaid-complete path).
      final status = (data is Map
              ? (data['job_status'] ?? data['status'])
              : null)
          ?.toString();
      if (status == 'completed') {
        activeJob = null;
        fetchHistory();
      } else if (activeJob != null) {
        activeJob!['payment_status'] = 'paid';
        if (data is Map && data['payment_method'] != null) {
          activeJob!['payment_method'] = data['payment_method'];
        }
      }
      _emitLoaded();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onJobCancelled = (data) {
      activeJob = null;
      // ignore: discarded_futures
      JobNotificationService.instance.cancelUrgentJobNotification();
      fetchSession();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onJobReassigned = (data) {
      activeJob = null;
      // ignore: discarded_futures
      JobNotificationService.instance.cancelUrgentJobNotification();
      fetchSession();
      _syncLocationTracking();
      _syncSessionPoll();
      fetchHistory();
    };

    _socketService.onError = (data) {
      final message =
          (data is Map ? data['message'] : null)?.toString() ??
              'Something went wrong';
      emit(HomeActionError(message));
      _emitLoaded();
    };
  }

  void _mergeJobStatus(dynamic data) {
    if (activeJob != null && data is Map) {
      final status = data['status'] ?? data['job_status'];
      if (status != null) {
        activeJob!['job_status'] = status;
        activeJob!['status'] = status;
      }
    }
    isLoadingAction = false;
    _emitLoaded();
    _syncLocationTracking();
  }

  Future<void> fetchSession() async {
    sessionLoadFailed = false;
    try {
      final response = await DioHelper.getData(url: EndPoints.technicianSession);
      if (response.statusCode == 200) {
        final data = response.data as Map;
        final status = data['technician']?['status']?.toString();
        isOnline = status == 'Online' || status == 'On Job';
        final jobsRaw = data['active_jobs'];
        if (jobsRaw is List) {
          activeJobs = jobsRaw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        } else {
          activeJobs = [];
        }
        final job = data['active_job'];
        if (!isLoadingAction) {
          if (job is Map) {
            activeJob = Map<String, dynamic>.from(job);
          } else if (activeJobs.isNotEmpty) {
            activeJob = Map<String, dynamic>.from(activeJobs.first);
          } else {
            activeJob = null;
          }
        }
        sessionLoadFailed = false;
      } else if (response.statusCode == 401) {
        await CacheHelper.clear();
        sessionLoadFailed = true;
        DioHelper.onUnauthorized?.call();
      } else {
        sessionLoadFailed = true;
        final err = DioHelper.errorMessage(response);
        emit(HomeActionError(err ?? 'Failed to load session'));
      }
    } catch (_) {
      sessionLoadFailed = true;
      emit(HomeActionError('Failed to load session. Pull to retry.'));
    }
    _emitLoaded();
    _syncLocationTracking();
    _syncSessionPoll();
  }

  /// Focus a job from the queue (Activities Continue) and jump to Home.
  Future<bool> continueJob(String jobId) async {
    final ok = await focusJob(jobId);
    if (!ok) return false;
    pendingNavigateHome = true;
    _emitLoaded();
    return true;
  }

  void clearPendingNavigateHome() {
    pendingNavigateHome = false;
  }

  /// Set [activeJob] from the queue or by fetching the job.
  Future<bool> focusJob(String jobId) async {
    if (jobId.isEmpty) return false;
    Map<String, dynamic>? fromQueue;
    for (final j in activeJobs) {
      if ((j['_id'] ?? j['job_id'])?.toString() == jobId) {
        fromQueue = j;
        break;
      }
    }
    if (fromQueue != null) {
      activeJob = Map<String, dynamic>.from(fromQueue);
      _emitLoaded();
      return true;
    }
    try {
      final res = await DioHelper.getData(url: EndPoints.jobById(jobId));
      if (res.statusCode == 200) {
        final job = res.data['job'];
        if (job is Map) {
          activeJob = Map<String, dynamic>.from(job);
          _emitLoaded();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  /// Parse job lat/lng from locationCoordinates or location string.
  ({double lat, double lng})? jobLatLng([Map<String, dynamic>? job]) {
    final j = job ?? activeJob;
    if (j == null) return null;
    final coords = j['locationCoordinates'];
    if (coords is Map) {
      final c = coords['coordinates'];
      if (c is List && c.length >= 2) {
        final lng = (c[0] as num?)?.toDouble();
        final lat = (c[1] as num?)?.toDouble();
        if (lat != null && lng != null && !(lat == 0 && lng == 0)) {
          return (lat: lat, lng: lng);
        }
      }
    }
    final label = (j['location'] ?? '').toString().trim();
    final m = RegExp(
      r'(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)',
    ).firstMatch(label);
    if (m != null) {
      final lat = double.tryParse(m.group(1)!);
      final lng = double.tryParse(m.group(2)!);
      if (lat != null && lng != null) return (lat: lat, lng: lng);
    }
    return null;
  }

  /// True when this tech created the active job (GPS start gate skipped).
  bool get isOwnCreatedJob {
    final job = activeJob;
    if (job == null) return false;
    final creator = job['created_by_technician'];
    final creatorId = creator is Map
        ? (creator['_id'] ?? creator['id'])?.toString()
        : creator?.toString();
    if (creatorId == null || creatorId.isEmpty) return false;
    final tid = technicianId;
    if (tid.isNotEmpty && creatorId == tid) return true;
    final assigned = job['assignedTechnician'];
    final assignedId = assigned is Map
        ? (assigned['_id'] ?? assigned['id'])?.toString()
        : assigned?.toString();
    return assignedId != null && assignedId == creatorId;
  }

  /// Client hint: tech GPS is within [startMaxMeters] of the job.
  /// Own-created jobs can start at [arrived] without GPS.
  bool get canStartJob {
    if (jobStatus != 'arrived') return false;
    if (isOwnCreatedJob) return true;
    final dest = jobLatLng();
    final lat = lastLatitude;
    final lng = lastLongitude;
    if (dest == null || lat == null || lng == null) return false;
    final meters = Geolocator.distanceBetween(
      lat,
      lng,
      dest.lat,
      dest.lng,
    );
    return meters <= startMaxMeters;
  }

  double? get distanceToJobMeters {
    final dest = jobLatLng();
    final lat = lastLatitude;
    final lng = lastLongitude;
    if (dest == null || lat == null || lng == null) return null;
    return Geolocator.distanceBetween(lat, lng, dest.lat, dest.lng);
  }

  /// Activity tab: all assigned jobs (any status), newest first.
  Future<void> fetchHistory() async {
    try {
      final response = await DioHelper.getData(url: EndPoints.technicianJobs);
      if (response.statusCode == 200) {
        final jobs = response.data['jobs'];
        if (jobs is List) {
          jobHistory = jobs
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
    } catch (_) {
      // History is best-effort
    }
    _emitLoaded();
  }

  void _syncSessionPoll() {
    final shouldPoll = isOnline || activeJob != null;
    if (shouldPoll && _sessionPollTimer == null) {
      _sessionPollTimer = Timer.periodic(
        const Duration(seconds: 25),
        (_) => fetchSession(),
      );
    } else if (!shouldPoll && _sessionPollTimer != null) {
      _sessionPollTimer?.cancel();
      _sessionPollTimer = null;
    }
  }

  Future<void> toggleOnlineStatus() async {
    if (hasBlockingActiveJob) {
      emit(HomeActionError('Finish your active job before going Offline'));
      return;
    }

    final newStatus = isOnline ? 'Offline' : 'Online';
    isLoadingStatus = true;
    _emitLoaded();

    try {
      // Going Online requires location (Always when available).
      if (newStatus == 'Online') {
        final ok = await _ensureLocationPermission(
          request: true,
          requireAlways: true,
        );
        if (!ok) {
          isLoadingStatus = false;
          locationWarning = true;
          emit(HomeActionError(
            !kIsWeb && Platform.isIOS
                ? 'On iPhone, location must be set to Always so dispatch can see you on the Live Map when the app is in the background.'
                : !kIsWeb && Platform.isAndroid
                    ? 'On Android, location must be set to Allow all the time so dispatch can see you on the Live Map when the app is in the background.'
                    : 'Location must be allowed to go Online. Enable GPS and set location to Always / Allow all the time.',
          ));
          _emitLoaded();
          return;
        }
      }

      final response = await DioHelper.patchData(
        url: EndPoints.status,
        data: {'status': newStatus},
      );
      if (response.statusCode == 200) {
        isOnline = newStatus == 'Online';
        locationWarning = false;
        if (isOnline) {
          // Kick off the background stream immediately so Live Map updates right away.
          _syncLocationTracking();
        }
      } else {
        final err = DioHelper.errorMessage(response);
        emit(HomeActionError(err ?? 'Failed to update status'));
      }
    } catch (_) {
      emit(HomeActionError('Failed to update status'));
    }

    isLoadingStatus = false;
    _emitLoaded();
    _syncLocationTracking();
    _syncSessionPoll();
  }

  String? get jobId {
    final id = activeJob?['_id'] ?? activeJob?['job_id'];
    return id?.toString();
  }

  String get jobIdShort {
    final id = jobId ?? '';
    if (id.isEmpty) return '';
    return id.length > 6 ? id.substring(id.length - 6) : id;
  }

  String get jobStatus =>
      (activeJob?['job_status'] ?? activeJob?['status'] ?? '').toString();

  /// True when tech is on fulfill path and must not go Offline or accept overwrites.
  bool get hasBlockingActiveJob => _isFulfillPathStatus(jobStatus);

  /// Slide toggle enabled only when no incoming/active fulfill job blocks it.
  bool get canToggleOnlineStatus =>
      !hasBlockingActiveJob && jobStatus != 'assigned';

  bool _isFulfillPathStatus(String status) {
    return JobFulfillStatus.isBlocking(
      status,
      paymentStatus: activeJob?['payment_status']?.toString(),
    );
  }

  String get customerName {
    final fromClient = activeJob?['clientName']?.toString();
    if (fromClient != null && fromClient.isNotEmpty) return fromClient;

    final customer = activeJob?['customer_id'] ?? activeJob?['customer'];
    if (customer is! Map) return 'Customer';
    if (customer['name'] != null) return customer['name'].toString();
    final first = customer['first_name'] ?? '';
    final last = customer['last_name'] ?? '';
    final name = '$first $last'.trim();
    return name.isEmpty ? 'Customer' : name;
  }

  String get customerPhone {
    final fromClient = activeJob?['clientMobileNumber']?.toString();
    if (fromClient != null && fromClient.isNotEmpty) return fromClient;

    final customer = activeJob?['customer_id'] ?? activeJob?['customer'];
    if (customer is! Map) return '';
    return (customer['phone'] ?? customer['phone_number'] ?? '').toString();
  }

  String get jobIssue {
    final issue = (activeJob?['issue'] ?? '').toString();
    return issue.isEmpty ? 'Roadside assistance' : issue;
  }

  String get jobType {
    final t = (activeJob?['jobType'] ?? activeJob?['job_type'] ?? '').toString();
    return t;
  }

  String get jobLocation {
    final job = activeJob;
    if (job == null) return 'Location not provided';

    // Prefer explicit lat/lng fields (SOS payloads often include these).
    final lat = job['latitude'] ??
        job['lat'] ??
        (job['location'] is Map
            ? (job['location']['latitude'] ?? job['location']['lat'])
            : null);
    final lng = job['longitude'] ??
        job['lng'] ??
        (job['location'] is Map
            ? (job['location']['longitude'] ?? job['location']['lng'])
            : null);
    if (lat is num && lng is num) {
      return '${lat.toDouble()}, ${lng.toDouble()}';
    }
    if (lat != null && lng != null) {
      final la = double.tryParse(lat.toString());
      final ln = double.tryParse(lng.toString());
      if (la != null && ln != null) return '$la, $ln';
    }

    final loc = job['location'];
    if (loc is Map) {
      final rawCoords = loc['coordinates'];
      // GeoJSON Point is [lng, lat] — normalize to "lat, lng" for the map.
      if (rawCoords is List && rawCoords.length >= 2) {
        final a = double.tryParse(rawCoords[0].toString());
        final b = double.tryParse(rawCoords[1].toString());
        if (a != null && b != null) {
          // Heuristic: if first value looks like longitude (Qatar ~51), swap.
          if (a.abs() > 90 || (a > 40 && a < 60 && b > 20 && b < 30)) {
            return '$b, $a';
          }
          return '$a, $b';
        }
      }
      final coords = rawCoords?.toString() ?? '';
      if (coords.isNotEmpty) return coords;
    }
    final asString = (loc ?? '').toString().trim();
    return asString.isEmpty ? 'Location not provided' : asString;
  }

  double? get jobPrice {
    final p = activeJob?['price'];
    if (p is num) return p.toDouble();
    return double.tryParse(p?.toString() ?? '');
  }

  Future<void> acceptJob() async {
    final id = jobId;
    if (id == null) return;
    await _runJobAction(
      () => DioHelper.postData(url: EndPoints.acceptJob(id), data: {}),
      onSuccess: () {
        activeJob!['job_status'] = 'accepted';
        activeJob!['status'] = 'accepted';
        // ignore: discarded_futures
        JobNotificationService.instance.cancelUrgentJobNotification();
      },
    );
  }

  /// REST-first lifecycle. Do **not** also emit startEnRoute/markArrived/startJob:
  /// REST already advances status + notifies the customer; a follow-up socket emit
  /// fails the server's status gate and surfaces a false error toast.
  Future<void> startEnRoute() async {
    final id = jobId;
    if (id == null) return;
    await _runJobAction(
      () => DioHelper.patchData(
        url: EndPoints.updateJobStatus(id),
        data: {'job_status': 'en_route'},
      ),
      optimisticStatus: 'en_route',
      onSuccess: () {
        activeJob!['job_status'] = 'en_route';
        activeJob!['status'] = 'en_route';
      },
    );
  }

  Future<void> markArrived() async {
    final id = jobId;
    if (id == null) return;
    await _runJobAction(
      () => DioHelper.postData(url: EndPoints.markArrived(id), data: {}),
      optimisticStatus: 'arrived',
      onSuccess: () {
        activeJob!['job_status'] = 'arrived';
        activeJob!['status'] = 'arrived';
      },
    );
  }

  Future<void> startJob() async {
    final id = jobId;
    if (id == null) return;
    double? lat = lastLatitude;
    double? lng = lastLongitude;
    if (!isOwnCreatedJob) {
      try {
        final pos = await Geolocator.getCurrentPosition(
          locationSettings:
              const LocationSettings(accuracy: LocationAccuracy.high),
        );
        lat = pos.latitude;
        lng = pos.longitude;
        lastLatitude = lat;
        lastLongitude = lng;
      } catch (_) {}
    }
    await _runJobAction(
      () => DioHelper.postData(
        url: EndPoints.startJob(id),
        data: {
          if (lat != null) 'latitude': lat,
          if (lng != null) 'longitude': lng,
        },
      ),
      optimisticStatus: 'in_progress',
      onSuccess: () {
        activeJob!['job_status'] = 'in_progress';
        activeJob!['status'] = 'in_progress';
      },
    );
  }

  Future<bool> updateJobDetails(Map<String, dynamic> fields) async {
    final id = jobId;
    if (id == null) return false;
    isLoadingAction = true;
    _emitLoaded();
    try {
      final res = await DioHelper.patchData(
        url: EndPoints.updateJobDetails(id),
        data: fields,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final job = res.data['job'];
        if (job is Map) {
          activeJob = {...?activeJob, ...Map<String, dynamic>.from(job)};
        } else {
          activeJob = {...?activeJob, ...fields};
        }
        if (res.data['signatureCleared'] == true) {
          signatureClearedBanner = true;
          activeJob?['customerSignatureUrl'] = '';
          activeJob?['customerSignedAt'] = null;
        }
        isLoadingAction = false;
        _emitLoaded();
        return true;
      }
    } catch (_) {}
    isLoadingAction = false;
    _emitLoaded();
    return false;
  }

  Future<bool> uploadCustomerSignatureBytes(Uint8List bytes) async {
    final id = jobId;
    if (id == null) return false;
    try {
      final form = FormData.fromMap({
        'signature': MultipartFile.fromBytes(
          bytes,
          filename: 'signature.png',
          contentType: DioMediaType('image', 'png'),
        ),
      });
      final res = await DioHelper.postData(
        url: EndPoints.uploadSignature(id),
        data: form,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = res.data;
        if (data is Map) {
          final url = data['customerSignatureUrl']?.toString() ?? '';
          final signedAt = data['customerSignedAt'];
          if (url.isNotEmpty && signedAt != null) {
            activeJob = {
              ...?activeJob,
              'customerSignatureUrl': url,
              'customerSignedAt': signedAt,
            };
            signatureClearedBanner = false;
            _emitLoaded();
            return true;
          }
        }
        await fetchSession();
        final url = activeJob?['customerSignatureUrl']?.toString() ?? '';
        final signedAt = activeJob?['customerSignedAt'];
        if (url.isEmpty || signedAt == null) {
          debugPrint('[HomeCubit] signature upload OK but session missing signature');
          return false;
        }
        signatureClearedBanner = false;
        _emitLoaded();
        return true;
      }
    } catch (e) {
      debugPrint('[HomeCubit] uploadCustomerSignature failed: $e');
      if (e is DioException && e.response != null) {
        lastActionError = DioHelper.errorMessage(e.response!);
      }
    }
    return false;
  }

  /// Mobile file-path upload (native). Web uses [uploadCustomerSignatureBytes].
  Future<bool> uploadCustomerSignature(String filePath) async {
    if (kIsWeb) return false;
    final id = jobId;
    if (id == null) return false;
    try {
      final form = FormData.fromMap({
        'signature': await MultipartFile.fromFile(
          filePath,
          filename: 'signature.png',
        ),
      });
      final res = await DioHelper.postData(
        url: EndPoints.uploadSignature(id),
        data: form,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = res.data;
        if (data is Map) {
          final url = data['customerSignatureUrl']?.toString() ?? '';
          final signedAt = data['customerSignedAt'];
          if (url.isNotEmpty && signedAt != null) {
            activeJob = {
              ...?activeJob,
              'customerSignatureUrl': url,
              'customerSignedAt': signedAt,
            };
            signatureClearedBanner = false;
            _emitLoaded();
            return true;
          }
        }
        await fetchSession();
        final url = activeJob?['customerSignatureUrl']?.toString() ?? '';
        final signedAt = activeJob?['customerSignedAt'];
        if (url.isEmpty || signedAt == null) return false;
        signatureClearedBanner = false;
        _emitLoaded();
        return true;
      }
    } catch (e) {
      debugPrint('[HomeCubit] uploadCustomerSignature failed: $e');
      if (e is DioException && e.response != null) {
        lastActionError = DioHelper.errorMessage(e.response!);
      }
    }
    return false;
  }

  Future<bool> createJobCard(Map<String, dynamic> body) async {
    lastActionError = null;
    try {
      final res = await DioHelper.postData(
        url: EndPoints.createTechnicianJob,
        data: body,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        await fetchSession();
        await fetchHistory();
        pendingNavigateHome = true;
        _emitLoaded();
        return true;
      }
      lastActionError = DioHelper.errorMessage(res) ?? 'Failed to create job';
    } catch (e) {
      var msg = 'Failed to create job';
      if (e is DioException && e.response != null) {
        msg = DioHelper.errorMessage(e.response!) ?? msg;
      }
      lastActionError = msg;
    }
    return false;
  }

  Future<bool> createSubscription(Map<String, dynamic> body) async {
    try {
      final res = await DioHelper.postData(
        url: EndPoints.createSubscription,
        data: body,
      );
      return res.statusCode == 200 || res.statusCode == 201;
    } catch (_) {
      return false;
    }
  }

  Future<bool> uploadHomeHero(String filePath) async {
    try {
      final form = FormData.fromMap({
        'homeHero': await MultipartFile.fromFile(filePath),
      });
      final res = await DioHelper.postData(
        url: EndPoints.homeHero,
        data: form,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        homeHeroUrl = res.data['homeHeroUrl']?.toString() ?? homeHeroUrl;
        _emitLoaded();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> completeJob({
    String notes = '',
    List<String> photoLabels = const [],
  }) async {
    final id = jobId;
    if (id == null) return false;
    lastActionError = null;
    await fetchSession();
    return _runJobAction(
      () => DioHelper.postData(
        url: EndPoints.completeJob(id),
        data: {
          'completion_notes': notes,
          if (photoLabels.isNotEmpty) 'completion_photos': photoLabels,
        },
      ),
      optimisticStatus: 'completed',
      onSuccess: () {
        activeJob = null;
        fetchHistory();
        fetchHomeMeta();
      },
    );
  }

  Future<bool> addRepairProcedure({
    required String description,
    required double price,
    int quantity = 1,
    String? name,
    String? notes,
    double? cost,
    String? receiptImageUrl,
  }) async {
    final id = jobId;
    if (id == null) return false;
    try {
      final res = await DioHelper.postData(
        url: EndPoints.addRepair(id),
        data: {
          'description': description,
          'price': price,
          'quantity': quantity,
          if (name != null && name.isNotEmpty) 'name': name,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          if (cost != null) 'cost': cost,
          if (receiptImageUrl != null && receiptImageUrl.isNotEmpty)
            'receipt_image_url': receiptImageUrl,
        },
      );
      return res.statusCode == 200 || res.statusCode == 201;
    } catch (_) {
      return false;
    }
  }

  Future<double?> fetchJobTotal() async {
    final id = jobId;
    if (id == null) return jobPrice;
    try {
      final res = await DioHelper.getData(url: EndPoints.jobTotal(id));
      if (res.statusCode == 200) {
        final t = res.data['total'];
        if (t is num) return t.toDouble();
        return double.tryParse(t?.toString() ?? '');
      }
    } catch (_) {}
    return jobPrice;
  }

  Future<void> confirmPayment({String paymentMethod = 'cash'}) async {
    final id = jobId;
    if (id == null) return;
    await _runJobAction(
      () => DioHelper.postData(
        url: EndPoints.confirmPayment(id),
        data: {'payment_method': paymentMethod},
      ),
      onSuccess: () {
        // Best-effort customer socket notify; stay On Job until Complete.
        _socketService.paymentReceived(id, paymentMethod: paymentMethod);
        if (activeJob != null) {
          activeJob!['payment_status'] = 'paid';
          activeJob!['payment_method'] = paymentMethod;
        }
        fetchHomeMeta();
      },
    );
  }

  Future<bool> _runJobAction(
    Future Function() request, {
    required void Function() onSuccess,
    String? optimisticStatus,
  }) async {
    isLoadingAction = true;
    final previousStatus = jobStatus;
    if (optimisticStatus != null && activeJob != null) {
      activeJob!['job_status'] = optimisticStatus;
      activeJob!['status'] = optimisticStatus;
    }
    _emitLoaded();

    var ok = false;
    try {
      final response = await request();
      if (response.statusCode == 200 || response.statusCode == 201) {
        onSuccess();
        ok = true;
      } else {
        if (optimisticStatus != null && activeJob != null) {
          activeJob!['job_status'] = previousStatus;
          activeJob!['status'] = previousStatus;
        }
        final err = DioHelper.errorMessage(response);
        lastActionError = err ?? 'Action failed';
        emit(HomeActionError(lastActionError!));
      }
    } catch (e) {
      if (optimisticStatus != null && activeJob != null) {
        activeJob!['job_status'] = previousStatus;
        activeJob!['status'] = previousStatus;
      }
      var msg = 'Action failed, please try again';
      if (e is DioException && e.response != null) {
        msg = DioHelper.errorMessage(e.response!) ?? msg;
      }
      lastActionError = msg;
      emit(HomeActionError(msg));
    }

    isLoadingAction = false;
    _emitLoaded();
    _syncLocationTracking();
    _syncSessionPoll();
    return ok;
  }

  // ─── Location stream management ─────────────────────────────────────────────

  /// Start or stop the GPS stream based on whether the tech should be tracked.
  /// Uses a foreground service notification on Android so the OS cannot suspend
  /// location delivery when the app is in the background.
  void _syncLocationTracking() {
    final shouldTrack = isOnline || activeJob != null;
    if (shouldTrack && _locationStream == null) {
      _startLocationStream();
    } else if (!shouldTrack && _locationStream != null) {
      _stopLocationStream();
    }
  }

  LocationSettings _buildLocationSettings() {
    if (kIsWeb) {
      // Web: simple high-accuracy, no FGS.
      return const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
      );
    }
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
        intervalDuration: const Duration(seconds: 4),
        // Foreground service keeps the process alive when the app is backgrounded.
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Clicks — You\'re Online',
          notificationText: 'Your location is being shared with dispatch.',
          enableWakeLock: true,
          enableWifiLock: true,
          notificationIcon: AndroidResource(
            name: 'ic_launcher',
            defType: 'mipmap',
          ),
        ),
      );
    }
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
        activityType: ActivityType.automotiveNavigation,
        // These two keep the stream alive when the app goes to the background.
        allowBackgroundLocationUpdates: true,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 5,
    );
  }

  void _startLocationStream() {
    _locationStream?.cancel();
    _locationStream = Geolocator.getPositionStream(
      locationSettings: _buildLocationSettings(),
    ).listen(
      _onPositionUpdate,
      onError: (_) {
        locationWarning = true;
        _emitLoaded();
      },
      cancelOnError: false,
    );

    // Immediately push a fix so the admin Live Map shows the correct position
    // right away instead of waiting for the tech to physically move (the stream
    // is distance-filtered and may not emit for a stationary device).
    _sendCurrentPositionNow();

    // Time-based heartbeat: guarantees the server stays fresh even when the
    // technician is parked and the movement stream is silent.
    _locationHeartbeat?.cancel();
    _locationHeartbeat = Timer.periodic(
      _heartbeatInterval,
      (_) => _sendCurrentPositionNow(),
    );
  }

  void _stopLocationStream() {
    _locationStream?.cancel();
    _locationStream = null;
    _locationHeartbeat?.cancel();
    _locationHeartbeat = null;
  }

  /// One-shot: fetch the current GPS fix and send it on both channels.
  /// Falls back to the last cached fix if a fresh read times out.
  Future<void> _sendCurrentPositionNow() async {
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      _onPositionUpdate(position);
    } catch (_) {
      // Timed out / no fix — reuse the last known position so the admin map
      // and disconnect policy don't go stale.
      if (lastLatitude != null && lastLongitude != null) {
        _dispatchLocation(lastLatitude!, lastLongitude!);
      }
    }
  }

  void _onPositionUpdate(Position position) {
    final moved = lastLatitude == null ||
        lastLongitude == null ||
        (position.latitude - lastLatitude!).abs() > 0.000025 ||
        (position.longitude - lastLongitude!).abs() > 0.000025;
    lastLatitude = position.latitude;
    lastLongitude = position.longitude;

    _dispatchLocation(position.latitude, position.longitude);

    if (locationWarning || moved) {
      locationWarning = false;
      _emitLoaded();
    }
  }

  /// Send a coordinate on both transports (socket fast-path + REST heartbeat).
  void _dispatchLocation(double latitude, double longitude) {
    // 1. Socket (fast path — works when foreground / socket alive)
    _socketService.updateLocation(
      technicianId: technicianId,
      latitude: latitude,
      longitude: longitude,
      jobId: jobId,
    );

    // 2. REST heartbeat (always) — keeps server informed when socket is down
    //    and drives the admin Live Map via the server-side broadcast.
    _sendLocationRest(latitude, longitude);
  }

  /// Fire-and-forget REST PATCH /technicians/location.
  /// The server throttles writes internally; we don't need to throttle here.
  void _sendLocationRest(double latitude, double longitude) {
    // Wrap in unawaited async so the Future type is Future<void>,
    // avoiding return-type issues with Dio's typed catchError.
    Future<void> doSend() async {
      try {
        await DioHelper.patchData(
          url: EndPoints.location,
          data: {
            'latitude': latitude,
            'longitude': longitude,
            if (jobId != null && jobId!.isNotEmpty) 'job_id': jobId,
          },
        );
      } catch (_) {
        // best-effort — ignore network failures silently
      }
    }
    doSend();
  }

  // ─── Permission helpers ──────────────────────────────────────────────────────

  /// Ensures GPS is enabled and location permission is granted.
  /// [requireAlways] requests "Allow all the time" (needed for Android/iOS background).
  /// On iOS and Android, Online is blocked unless Always / all-the-time is granted.
  Future<bool> _ensureLocationPermission({
    bool request = false,
    bool requireAlways = false,
  }) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        locationWarning = true;
        if (request) await Geolocator.openLocationSettings();
        return false;
      }

      var permission = await Geolocator.checkPermission();

      if (permission == LocationPermission.denied && request) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        locationWarning = true;
        if (request) await Geolocator.openAppSettings();
        return false;
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.unableToDetermine) {
        locationWarning = true;
        return false;
      }

      // Try to upgrade to Always so background Live Map updates keep working.
      if (request &&
          requireAlways &&
          permission == LocationPermission.whileInUse) {
        await Geolocator.requestPermission();
        permission = await Geolocator.checkPermission();
      }

      // iOS / Android: background Live Map requires Always — block Online on whileInUse only.
      if (request &&
          requireAlways &&
          !kIsWeb &&
          (Platform.isIOS || Platform.isAndroid) &&
          permission != LocationPermission.always) {
        locationWarning = true;
        if (request && Platform.isAndroid) {
          await Geolocator.openAppSettings();
        }
        return false;
      }

      locationWarning = false;
      return true;
    } catch (_) {
      locationWarning = true;
      return false;
    }
  }

  // Called by the home shell's WidgetsBindingObserver when app is resumed.
  void onAppResumed() {
    if (!_socketService.isConnected) {
      _socketService.reconnect();
    }
    // ignore: discarded_futures
    _hydrateFromPendingNotification();
  }

  /// Clear location warning after user returns from Android Settings.
  Future<void> recheckLocationPermission() async {
    final ok = await _ensureLocationPermission(requireAlways: true);
    if (ok && locationWarning) {
      locationWarning = false;
      _emitLoaded();
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  Future<void> logout() async {
    _stopLocationStream();
    _sessionPollTimer?.cancel();
    _sessionPollTimer = null;
    _socketService.clearHandlers();
    _socketService.disconnect();
    await JobNotificationService.instance.clearTokenOnBackend();
    await CacheHelper.clear();
  }

  @override
  Future<void> close() {
    _stopLocationStream();
    _sessionPollTimer?.cancel();
    _socketService.clearHandlers();
    _socketService.disconnect();
    return super.close();
  }
}
