import 'dart:async';
import 'dart:io' show Platform;

import 'package:bloc/bloc.dart';
import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
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

  /// Last GPS fix from location tracking (for live Active Job map).
  double? lastLatitude;
  double? lastLongitude;

  /// Dashboard balance for Home pill (totalEarnings).
  double? balanceQar;

  /// Unread notification count for bell badge.
  int unreadNotifications = 0;

  /// Raw job JSON — REST session or `newJobAssigned` socket payload.
  Map<String, dynamic>? activeJob;

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
      // Modal is showing — dismiss any OS urgent banner.
      // ignore: discarded_futures
      JobNotificationService.instance.cancelUrgentJobNotification();
      _emitLoaded();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onEnRouteConfirmed = (data) => _mergeJobStatus(data);
    _socketService.onArrivedConfirmed = (data) => _mergeJobStatus(data);
    _socketService.onJobStartedConfirmed = (data) => _mergeJobStatus(data);

    _socketService.onPaymentConfirmed = (data) {
      activeJob = null;
      _emitLoaded();
      _syncLocationTracking();
      _syncSessionPoll();
      fetchHistory();
    };

    _socketService.onJobCancelled = (data) {
      activeJob = null;
      fetchSession();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onJobReassigned = (data) {
      activeJob = null;
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
        final job = data['active_job'];
        if (!isLoadingAction) {
          activeJob = job is Map ? Map<String, dynamic>.from(job) : null;
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
    await _runJobAction(
      () => DioHelper.postData(url: EndPoints.startJob(id), data: {}),
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

  Future<bool> uploadCustomerSignature(String filePath) async {
    final id = jobId;
    if (id == null) return false;
    try {
      final form = FormData.fromMap({
        'signature': await MultipartFile.fromFile(filePath, filename: 'signature.png'),
      });
      final res = await DioHelper.postData(
        url: EndPoints.uploadSignature(id),
        data: form,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        activeJob?['customerSignatureUrl'] =
            res.data['customerSignatureUrl']?.toString() ?? 'ok';
        activeJob?['customerSignedAt'] =
            res.data['customerSignedAt']?.toString() ??
                DateTime.now().toIso8601String();
        signatureClearedBanner = false;
        _emitLoaded();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<bool> createJobCard(Map<String, dynamic> body) async {
    try {
      final res = await DioHelper.postData(
        url: EndPoints.createTechnicianJob,
        data: body,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        await fetchHistory();
        return true;
      }
    } catch (_) {}
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
    return _runJobAction(
      () => DioHelper.postData(
        url: EndPoints.completeJob(id),
        data: {
          if (notes.isNotEmpty) 'completion_notes': notes,
          if (photoLabels.isNotEmpty) 'completion_photos': photoLabels,
        },
      ),
      optimisticStatus: 'completed',
      onSuccess: () {
        activeJob!['job_status'] = 'completed';
        activeJob!['status'] = 'completed';
        fetchHomeMeta();
      },
    );
  }

  Future<bool> addRepairProcedure({
    required String description,
    required double price,
    int quantity = 1,
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
        // Best-effort customer socket notify; REST already resets tech to Online.
        _socketService.paymentReceived(id, paymentMethod: paymentMethod);
        activeJob = null;
        fetchHistory();
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
        emit(HomeActionError(err ?? 'Action failed'));
      }
    } catch (_) {
      if (optimisticStatus != null && activeJob != null) {
        activeJob!['job_status'] = previousStatus;
        activeJob!['status'] = previousStatus;
      }
      emit(HomeActionError('Action failed, please try again'));
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
