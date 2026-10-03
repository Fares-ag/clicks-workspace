import 'dart:async';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:bloc/bloc.dart';
import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/config/device_capability.dart';
import '../../../../core/config/job_fulfill_status.dart';
import '../../../../core/config/location_tracking.dart';
import '../../../../core/api/dio_helper.dart';
import '../../../../core/api/end_points/end_points.dart';
import '../../../../core/helper/action_errors.dart';
import '../../../../core/helper/cache_helper.dart';
import '../../../../core/notifications/job_notification_service.dart';
import '../../../../core/monitoring/sentry_config.dart';
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

  /// Last coordinates sent to dispatch (Live Map pin).
  double? _lastDispatchedLat;
  double? _lastDispatchedLng;
  double? _lastDispatchedAccuracy;
  /// When the last dispatched pin was actually measured by the OS.
  DateTime? _lastFixAt;
  /// When we last used the REST transport (see _shouldSendRest).
  DateTime? _lastRestSentAt;

  /// Dashboard balance for Home pill (totalEarnings).
  double? balanceQar;

  /// Unread notification count for bell badge.
  int unreadNotifications = 0;

  /// Raw job JSON — REST session or `newJobAssigned` socket payload.
  Map<String, dynamic>? activeJob;

  /// Job the technician explicitly opened (Accept, Activity → Continue, Add
  /// job). The server's `active_job` is its own priority pick (in_progress
  /// beats accepted), so without this the 25s session poll swapped the
  /// ActiveJobScreen to another job. Cleared when that job leaves the queue.
  String? _focusedJobId;

  /// All fulfill-path / unpaid jobs from session (multi-job queue).
  List<Map<String, dynamic>> activeJobs = [];

  /// Client-side start proximity hint (meters). Server enforces the real limit.
  static const double startMaxMeters = 200;

  /// Recent completed jobs (read-only history).
  List<Map<String, dynamic>> jobHistory = [];
  int historyPage = 1;
  bool historyHasMore = true;
  bool historyLoadingMore = false;

  /// Bumped on every history load so a newer reset can discard the response of
  /// an older in-flight append instead of interleaving the two.
  int _historyRequestToken = 0;
  DateTime? _lastHomeMetaAt;

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
    // Notification accept reconciliation can trigger a second session fetch —
    // do not block the first Home paint on it.
    // ignore: discarded_futures
    _reconcileNotificationAcceptState();
    // History loads when the Activity tab opens; earnings when Earnings opens.
    // Home balance/meta only (parallel, cached 45s on client).
    // ignore: discarded_futures
    fetchHomeMeta();
    JobNotificationService.instance.registerTokenWithBackend();
  }

  /// After session load: surface notification accept results and retry real jobs.
  Future<void> _reconcileNotificationAcceptState() async {
    final failedMsg = CacheHelper.get(kAcceptNotifFailedKey)?.toString();
    if (failedMsg != null && failedMsg.isNotEmpty) {
      await CacheHelper.remove(kAcceptNotifFailedKey);
      if (isClosed) return;
      emit(HomeActionError(failedMsg));
      _emitLoaded();
    }

    final acceptedId =
        CacheHelper.get(kAcceptedFromNotifJobIdKey)?.toString();
    if (acceptedId != null && acceptedId.isNotEmpty) {
      await CacheHelper.remove(kAcceptedFromNotifJobIdKey);
      await CacheHelper.remove(kPendingJobIdKey);
      await fetchSession();
      return;
    }

    final pendingId = CacheHelper.get(kPendingJobIdKey)?.toString();
    if (pendingId == null || pendingId.isEmpty) return;

    if (pendingId.startsWith('qa-live-') || pendingId.startsWith('qa-bg-')) {
      await CacheHelper.remove(kPendingJobIdKey);
      if (failedMsg == null || failedMsg.isEmpty) {
        if (isClosed) return;
        emit(HomeActionError(
          'Test alert only — assign a real job from admin to test Accept.',
        ));
        _emitLoaded();
      }
      return;
    }

    // Background accept may have failed — retry in foreground while logged in.
    if (activeJob != null &&
        jobStatus == 'assigned' &&
        jobId == pendingId) {
      await acceptJob();
    }
  }

  /// On resume: refresh session when Accept succeeded from a background
  /// notification action, or when the user opened the app from a job alert.
  Future<void> _hydrateFromPendingNotification() async {
    await _reconcileNotificationAcceptState();
    final pendingId = CacheHelper.get(kPendingJobIdKey)?.toString();
    if (pendingId == null || pendingId.isEmpty) return;
    // Refresh UI but keep pending id — Accept on the notification still needs it.
    await fetchSession();
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
      if (isClosed) return;
      emit(HomeActionError(message ?? 'Could not accept job from notification'));
      _emitLoaded();
    };
  }

  /// Balance pill + notification unread (non-blocking for fulfill path).
  Future<void> fetchHomeMeta({bool force = false}) async {
    if (!force &&
        _lastHomeMetaAt != null &&
        DateTime.now().difference(_lastHomeMetaAt!) <
            const Duration(seconds: 45)) {
      return;
    }
    Future<Response?> safeGet(String url) async {
      try {
        return await DioHelper.getData(url: url);
      } catch (_) {
        return null;
      }
    }

    final results = await Future.wait([
      safeGet(EndPoints.dashboard),
      safeGet(EndPoints.profile),
      safeGet(EndPoints.technicianNotificationsUnread),
    ]);

    final dash = results[0];
    if (dash != null && dash.statusCode == 200) {
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

    final profile = results[1];
    if (profile != null && profile.statusCode == 200) {
      final t = profile.data['technician'] ?? profile.data;
      if (t is Map) {
        final hero = t['homeHeroUrl']?.toString();
        if (hero != null && hero.isNotEmpty) homeHeroUrl = hero;
      }
    }

    final unread = results[2];
    if (unread != null && unread.statusCode == 200) {
      final c = unread.data['count'];
      unreadNotifications = c is num ? c.toInt() : int.tryParse('$c') ?? 0;
    }

    _lastHomeMetaAt = DateTime.now();
    _emitLoaded();
  }

  void _connectSocket() {
    _socketService.clearHandlers();
    _socketService.reconnect();

    _socketService.onConnected = () {
      socketConnected = true;
      _emitLoaded();
      fetchSession();
      if (isOnline) {
        _sendCurrentPositionNow();
      }
    };

    _socketService.onDisconnected = () {
      socketConnected = false;
      _emitLoaded();
    };

    _socketService.onNewJobAssigned = (data) {
      final incoming = Map<String, dynamic>.from(data as Map);
      final incomingId =
          (incoming['_id'] ?? incoming['job_id'])?.toString();

      final incomingStatus =
          (incoming['job_status'] ?? incoming['status'] ?? 'assigned')
              .toString();
      // Never drop an assignment: keep the queue in sync even while busy on
      // another job so it surfaces via the Home pending-assignments banner
      // and Activity → Accept job.
      _upsertQueuedJob(incoming);

      if (activeJob != null) {
        final currentId = jobId;
        final currentStatus = jobStatus;
        if (incomingId != null &&
            incomingId == currentId &&
            currentStatus == 'assigned') {
          activeJob = incoming;
        } else if (_isFulfillPathStatus(currentStatus)) {
          // Mid-fulfill on another job — do not swap activeJob; the new
          // assignment waits in [activeJobs] (see pendingAssignedJobs).
        } else {
          activeJob = incoming;
          _focusedJobId = incomingId;
        }
      } else {
        activeJob = incoming;
        _focusedJobId = incomingId;
      }
      if (incomingStatus == 'assigned' && !isLoadingAction && incomingId != null) {
        // Fresh assignment — clear any prior handled flag so re-dispatch alerts.
        // ignore: discarded_futures
        JobNotificationService.instance.clearAlarmHandledForJob(incomingId);
        // Keep beeping until Accept — start alarm even if FCM was missed.
        // ignore: discarded_futures
        JobNotificationService.instance.startInsistentAlarm(jobId: incomingId);
      } else if (incomingStatus != 'assigned' && !hasIncomingAssignedJob) {
        // ignore: discarded_futures
        JobNotificationService.instance.cancelUrgentJobNotification();
      }
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
        _focusedJobId = null;
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
      _focusedJobId = null;
      // ignore: discarded_futures
      JobNotificationService.instance.cancelUrgentJobNotification();
      fetchSession();
      _syncLocationTracking();
      _syncSessionPoll();
    };

    _socketService.onJobReassigned = (data) {
      activeJob = null;
      _focusedJobId = null;
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
      if (isClosed) return;
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
        if (status.toString() != 'assigned') {
          // ignore: discarded_futures
          JobNotificationService.instance.cancelUrgentJobNotification();
        }
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
          // Keep the job the technician opened on screen; only fall back to
          // the server's priority pick when no focused job is active any more.
          final focused = _findQueuedJob(_focusedJobId);
          if (focused != null) {
            activeJob = Map<String, dynamic>.from(focused);
          } else {
            _focusedJobId = null;
            if (job is Map) {
              activeJob = Map<String, dynamic>.from(job);
            } else if (activeJobs.isNotEmpty) {
              activeJob = Map<String, dynamic>.from(activeJobs.first);
            } else {
              activeJob = null;
            }
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
        if (isClosed) return;
        emit(HomeActionError(err ?? 'Failed to load session'));
      }
    } catch (_) {
      sessionLoadFailed = true;
      if (isClosed) return;
      emit(HomeActionError('Failed to load session. Pull to retry.'));
    }
    _emitLoaded();
    _syncLocationTracking();
    _syncSessionPoll();
    if (!hasIncomingAssignedJob) {
      // Session refresh is authoritative — stop alarm when nothing is waiting.
      // ignore: discarded_futures
      JobNotificationService.instance.cancelUrgentJobNotification();
    }
  }

  /// Focus a job from the queue (Activities Continue).
  Future<bool> continueJob(String jobId) async {
    return focusJob(jobId);
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
      _focusedJobId = jobId;
      _emitLoaded();
      return true;
    }
    try {
      final res = await DioHelper.getData(url: EndPoints.jobById(jobId));
      if (res.statusCode == 200) {
        final job = res.data['job'];
        if (job is Map) {
          activeJob = Map<String, dynamic>.from(job);
          _focusedJobId = jobId;
          _emitLoaded();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  /// The queue entry for [jobId], or null when it is not (or no longer) active.
  Map<String, dynamic>? _findQueuedJob(String? jobId) {
    if (jobId == null || jobId.isEmpty) return null;
    for (final j in activeJobs) {
      if ((j['_id'] ?? j['job_id'])?.toString() == jobId) return j;
    }
    return null;
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

  /// Activity tab: paginated assigned jobs, newest first.
  /// Returns true only when a page was actually applied to [jobHistory].
  Future<bool> fetchHistory({bool reset = true}) async {
    final token = ++_historyRequestToken;
    if (reset) {
      historyPage = 1;
      historyHasMore = true;
      if (!historyLoadingMore) jobHistory = [];
    }
    var ok = false;
    try {
      final response = await DioHelper.getData(
        url: EndPoints.technicianJobs,
        query: {'page': historyPage, 'limit': 20},
      );
      // A newer load started while this one was in flight — drop the stale page
      // instead of racing it into jobHistory.
      if (token != _historyRequestToken) {
        historyLoadingMore = false;
        return false;
      }
      if (response.statusCode == 200) {
        final jobs = response.data['jobs'];
        if (jobs is List) {
          final pageJobs = jobs
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          if (reset) {
            jobHistory = pageJobs;
          } else {
            jobHistory = [...jobHistory, ...pageJobs];
          }
          historyHasMore = response.data['has_more'] == true;
          ok = true;
        }
      }
    } catch (_) {
      // History is best-effort
    }
    historyLoadingMore = false;
    _emitLoaded();
    return ok;
  }

  Future<void> loadMoreHistory() async {
    if (!historyHasMore || historyLoadingMore || isClosed) return;
    final previousPage = historyPage;
    final requestedPage = previousPage + 1;
    historyLoadingMore = true;
    historyPage = requestedPage;
    final ok = await fetchHistory(reset: false);
    // Roll the page back if it never landed, otherwise a single failed request
    // silently drops 20 jobs out of the Activity list for the rest of the
    // session. Skip the rollback when a reset load already rewound the cursor.
    if (!ok && historyPage == requestedPage) {
      historyPage = previousPage;
    }
  }

  void _syncSessionPoll() {
    final shouldPoll = isOnline || activeJob != null;
    if (shouldPoll && _sessionPollTimer == null) {
      _sessionPollTimer = Timer.periodic(
        const Duration(seconds: 45),
        (_) => fetchSession(),
      );
    } else if (!shouldPoll && _sessionPollTimer != null) {
      _sessionPollTimer?.cancel();
      _sessionPollTimer = null;
    }
  }

  Future<void> toggleOnlineStatus() async {
    if (hasIncomingAssignedJob) {
      emit(HomeActionError(
        'Accept pending job assignments before going Offline',
      ));
      return;
    }
    if (hasBlockingFulfillJob) {
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
          if (isClosed) return;
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
        if (isClosed) return;
        emit(HomeActionError(err ?? 'Failed to update status'));
      }
    } catch (_) {
      if (isClosed) return;
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

  bool get hasBlockingFulfillJob {
    if (activeJobs.isEmpty) {
      return hasBlockingActiveJob;
    }
    return activeJobs.any((j) {
      final status = (j['job_status'] ?? j['status'] ?? '').toString();
      return JobFulfillStatus.isBlocking(
        status,
        paymentStatus: j['payment_status']?.toString(),
      );
    });
  }

  bool get hasIncomingAssignedJob {
    if (jobStatus == 'assigned') return true;
    return activeJobs.any((j) {
      final status = (j['job_status'] ?? j['status'] ?? '').toString();
      return status == 'assigned';
    });
  }

  /// Assigned (not yet accepted) jobs waiting in the queue — surfaced on Home
  /// via the pending-assignments banner and in Activity → Accept job.
  List<Map<String, dynamic>> get pendingAssignedJobs => activeJobs
      .where((j) =>
          (j['job_status'] ?? j['status'] ?? '').toString() == 'assigned')
      .toList();

  /// Add job is available whenever the tech is online.
  bool get canShowAddJob => isOnline;

  Map<String, dynamic>? get holdRequest {
    final raw = activeJob?['hold_request'];
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return null;
  }

  String? get holdRequestStatus => holdRequest?['status']?.toString();

  bool get hasPendingHoldRequest => holdRequestStatus == 'pending';

  bool get canRequestHold {
    const holdable = {'accepted', 'en_route', 'arrived', 'in_progress'};
    return holdable.contains(jobStatus) && !hasPendingHoldRequest;
  }

  /// Slide toggle enabled only when no incoming/active fulfill job blocks it.
  bool get canToggleOnlineStatus =>
      !hasBlockingFulfillJob && !hasIncomingAssignedJob;

  /// Short hint shown under the slider when offline is blocked.
  String? get offlineToggleBlockedReason {
    if (canToggleOnlineStatus) return null;
    if (hasIncomingAssignedJob) {
      return 'Accept pending job assignments before going offline';
    }
    if (hasBlockingFulfillJob) {
      return 'Finish your active job before going offline';
    }
    return null;
  }

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

    final ll = jobLatLng(job);
    if (ll != null) return '${ll.lat}, ${ll.lng}';

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

  Future<bool> acceptJob() async {
    final id = jobId;
    if (id == null) return false;
    // Stop alarm immediately — do not wait for the accept API round-trip.
    await JobNotificationService.instance.cancelUrgentJobNotification(jobId: id);
    return _runJobAction(
      () => DioHelper.postData(url: EndPoints.acceptJob(id), data: {}),
      optimisticStatus: 'accepted',
      onSuccess: () {
        activeJob!['job_status'] = 'accepted';
        activeJob!['status'] = 'accepted';
        // The shell opens this job right after accept — pin it.
        _focusedJobId = id;
        // ignore: discarded_futures
        CacheHelper.remove(kPendingJobIdKey);
        // ignore: discarded_futures
        JobNotificationService.instance.cancelUrgentJobNotification(jobId: id);
      },
    );
  }

  /// Accept a specific assigned job by id (Activity details / pending banner)
  /// without swapping [activeJob] away from a job mid-fulfill.
  Future<bool> acceptJobById(String jobId) async {
    if (jobId.isEmpty || isLoadingAction) return false;
    await JobNotificationService.instance.cancelUrgentJobNotification(jobId: jobId);
    final touchThisActiveJob = this.jobId == jobId && activeJob != null;
    return _runJobAction(
      () => DioHelper.postData(url: EndPoints.acceptJob(jobId), data: {}),
      optimisticStatus: touchThisActiveJob ? 'accepted' : null,
      onSuccess: () {
        // ignore: discarded_futures
        CacheHelper.remove(kPendingJobIdKey);
        final idx = activeJobs.indexWhere(
          (j) => (j['_id'] ?? j['job_id'])?.toString() == jobId,
        );
        if (idx >= 0) {
          activeJobs[idx]['job_status'] = 'accepted';
          activeJobs[idx]['status'] = 'accepted';
        }
        if (touchThisActiveJob) {
          activeJob!['job_status'] = 'accepted';
          activeJob!['status'] = 'accepted';
        }
        _focusedJobId = jobId;
        if (!hasIncomingAssignedJob) {
          // ignore: discarded_futures
          JobNotificationService.instance.cancelUrgentJobNotification();
        }
        // Sync queue in background — do not block Accept → navigate.
        // ignore: discarded_futures
        fetchSession();
      },
    );
  }

  /// Insert or merge a job payload into [activeJobs] by id.
  void _upsertQueuedJob(Map<String, dynamic> job) {
    final id = (job['_id'] ?? job['job_id'])?.toString();
    if (id == null || id.isEmpty) return;
    final idx = activeJobs.indexWhere(
      (j) => (j['_id'] ?? j['job_id'])?.toString() == id,
    );
    if (idx >= 0) {
      activeJobs[idx] = {...activeJobs[idx], ...job};
    } else {
      activeJobs.add(Map<String, dynamic>.from(job));
    }
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
        // Add job opens the created job next — pin it so the session refresh
        // does not surface another active job instead.
        final created = res.data is Map ? (res.data as Map)['job'] : null;
        final createdId =
            created is Map ? (created['_id'] ?? created['id'])?.toString() : null;
        if (createdId != null && createdId.isNotEmpty) {
          _focusedJobId = createdId;
        }
        await fetchSession();
        await fetchHistory();
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

  void _mergeJobFromResponse(dynamic data) {
    if (data is! Map) return;
    final job = data['job'];
    if (job is! Map) return;
    final merged = Map<String, dynamic>.from(job);
    activeJob = merged;
    final id = (merged['_id'] ?? merged['job_id'])?.toString();
    if (id == null || id.isEmpty) return;
    final idx = activeJobs.indexWhere(
      (j) => (j['_id'] ?? j['job_id'])?.toString() == id,
    );
    if (idx >= 0) {
      activeJobs[idx] = merged;
    }
  }

  Future<bool> requestJobHold(String reason) async {
    final id = jobId;
    if (id == null) return false;
    lastActionError = null;
    try {
      final res = await DioHelper.postData(
        url: EndPoints.requestHold(id),
        data: {'reason': reason.trim()},
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        _mergeJobFromResponse(res.data);
        _emitLoaded();
        return true;
      }
      lastActionError =
          DioHelper.errorMessage(res) ?? 'Failed to submit hold request';
    } catch (e) {
      var msg = 'Failed to submit hold request';
      if (e is DioException && e.response != null) {
        msg = DioHelper.errorMessage(e.response!) ?? msg;
      }
      lastActionError = msg;
    }
    return false;
  }

  Future<bool> cancelHoldRequest() async {
    final id = jobId;
    if (id == null) return false;
    lastActionError = null;
    try {
      final res = await DioHelper.deleteData(url: EndPoints.requestHold(id));
      if (res.statusCode == 200) {
        _mergeJobFromResponse(res.data);
        _emitLoaded();
        return true;
      }
      lastActionError =
          DioHelper.errorMessage(res) ?? 'Failed to cancel hold request';
    } catch (e) {
      var msg = 'Failed to cancel hold request';
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

  DioMediaType _heroContentType(String filename, String? mime) {
    final lower = '${mime ?? ''} ${filename.toLowerCase()}';
    if (lower.contains('png')) return DioMediaType('image', 'png');
    if (lower.contains('webp')) return DioMediaType('image', 'webp');
    if (lower.contains('gif')) return DioMediaType('image', 'gif');
    if (lower.contains('heic') || lower.contains('heif')) {
      return DioMediaType('image', 'heic');
    }
    return DioMediaType('image', 'jpeg');
  }

  String _heroFilename(XFile file) {
    final name = file.name.trim();
    if (name.isNotEmpty && name.contains('.')) return name;
    final mime = (file.mimeType ?? '').toLowerCase();
    if (mime.contains('png')) return 'home-hero.png';
    if (mime.contains('webp')) return 'home-hero.webp';
    if (mime.contains('gif')) return 'home-hero.gif';
    return 'home-hero.jpg';
  }

  Future<bool> uploadHomeHero(XFile file) async {
    lastActionError = null;
    try {
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) {
        lastActionError = 'Selected image is empty';
        return false;
      }
      final filename = _heroFilename(file);
      final form = FormData.fromMap({
        'homeHero': MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: _heroContentType(filename, file.mimeType),
        ),
      });
      final res = await DioHelper.postData(
        url: EndPoints.homeHero,
        data: form,
      );
      if (res.statusCode == 200 || res.statusCode == 201) {
        final url = res.data is Map
            ? res.data['homeHeroUrl']?.toString()
            : null;
        if (url != null && url.isNotEmpty) {
          // data: URLs break if we append ?v=; http(s) needs cache bust after upload.
          if (url.startsWith('data:')) {
            homeHeroUrl = url;
          } else {
            final sep = url.contains('?') ? '&' : '?';
            homeHeroUrl =
                '$url${sep}v=${DateTime.now().millisecondsSinceEpoch}';
          }
        }
        _emitLoaded();
        return true;
      }
      lastActionError = DioHelper.errorMessage(res) ?? 'Upload failed';
    } on DioException catch (e) {
      lastActionError = e.response != null
          ? DioHelper.errorMessage(e.response!)
          : 'Upload failed — check network';
      debugPrint('[HomeCubit] uploadHomeHero failed: $e');
    } catch (e) {
      lastActionError = 'Could not read selected image';
      debugPrint('[HomeCubit] uploadHomeHero failed: $e');
    }
    return false;
  }

  Map<String, dynamic>? jobSnapshot(String id) {
    final active = activeJob;
    if (active != null &&
        (active['_id'] ?? active['job_id'])?.toString() == id) {
      return active;
    }
    for (final job in activeJobs) {
      if ((job['_id'] ?? job['job_id'])?.toString() == id) return job;
    }
    return null;
  }

  Future<bool> completeJob({
    String notes = '',
    required String jobReference,
    String? jobId,
    List<String> photoLabels = const [],
  }) async {
    // Pin the caller's job: the 25s session poll can swap [activeJob] while the
    // complete sheet is open, which would post the typed Job ID to another job.
    final id = jobId ?? this.jobId;
    if (id == null) {
      lastActionError = 'Job not found. Go back and reopen it from Activity.';
      return false;
    }
    if (isLoadingAction) {
      lastActionError = 'Please wait — another action is still in progress.';
      return false;
    }
    lastActionError = null;
    // Server requires the technician-entered Job ID before it will complete.
    final reference = jobReference.trim();
    if (reference.isEmpty) {
      lastActionError = 'Enter the Job ID before completing.';
      return false;
    }
    if (reference.length > 64) {
      lastActionError = 'Job ID is too long (max 64 characters).';
      return false;
    }
    // Use the local job snapshot. A session refresh here can return a stale
    // cached payload (no signature / paid flag) and block a valid complete.
    final readiness = ActionErrors.completionReadiness(jobSnapshot(id));
    if (readiness != null) {
      lastActionError = readiness;
      return false;
    }
    return _runJobAction(
      () => DioHelper.postData(
        url: EndPoints.completeJob(id),
        data: {
          'completion_notes': notes,
          'job_reference': reference,
          if (photoLabels.isNotEmpty) 'completion_photos': photoLabels,
        },
      ),
      optimisticStatus: 'completed',
      onSuccess: () {
        activeJob = null;
        _focusedJobId = null;
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
    // Re-entrancy guard: a second tap while a job action is in flight would
    // race the first and surface the server's "already accepted" 400 as an error.
    if (isLoadingAction) return false;
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
        lastActionError = DioHelper.errorMessage(response);
        if (!isClosed) emit(HomeActionError(lastActionError!));
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
      if (!isClosed) emit(HomeActionError(msg));
    }

    isLoadingAction = false;
    _emitLoaded();
    _syncLocationTracking();
    _syncSessionPoll();
    return ok;
  }

  // ─── Location stream management ─────────────────────────────────────────────

  /// Last GPS profile applied to the stream. Restart when idle-online coarse
  /// mode and on-job high accuracy need to swap.
  bool _trackingCoarseIdle = false;

  /// Start or stop the GPS stream based on whether the tech should be tracked.
  /// Uses a foreground service notification on Android so the OS cannot suspend
  /// location delivery when the app is in the background.
  void _syncLocationTracking() {
    final shouldTrack = isOnline || activeJob != null;
    final coarseIdle =
        DeviceCapability.isLowEnd && isOnline && activeJob == null;
    if (!shouldTrack) {
      if (_locationStream != null) _stopLocationStream();
      _trackingCoarseIdle = false;
      return;
    }
    if (_locationStream != null && coarseIdle != _trackingCoarseIdle) {
      _stopLocationStream();
    }
    _trackingCoarseIdle = coarseIdle;
    if (_locationStream == null) {
      _startLocationStream();
    }
  }

  LocationSettings _buildLocationSettings() {
    final coarseIdle = _trackingCoarseIdle;
    final accuracy =
        coarseIdle ? LocationAccuracy.medium : LocationAccuracy.high;
    final distanceFilter = coarseIdle ? 15 : 5;
    final interval = coarseIdle
        ? const Duration(seconds: 8)
        : const Duration(seconds: 4);
    if (kIsWeb) {
      return LocationSettings(
        accuracy: accuracy,
        distanceFilter: distanceFilter,
      );
    }
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: accuracy,
        distanceFilter: distanceFilter,
        intervalDuration: interval,
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
        accuracy: accuracy,
        distanceFilter: distanceFilter,
        activityType: ActivityType.automotiveNavigation,
        // These two keep the stream alive when the app goes to the background.
        allowBackgroundLocationUpdates: true,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    }
    return LocationSettings(
      accuracy: accuracy,
      distanceFilter: distanceFilter,
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
        SentryConfig.captureException(
          StateError('Technician location stream error'),
          tags: const {'component': 'location_stream'},
        );
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
      LocationTracking.heartbeatInterval,
      (_) => _sendCurrentPositionNow(),
    );
  }

  void _stopLocationStream() {
    _locationStream?.cancel();
    _locationStream = null;
    _locationHeartbeat?.cancel();
    _locationHeartbeat = null;
    _lastDispatchedLat = null;
    _lastDispatchedLng = null;
    _lastDispatchedAccuracy = null;
    _lastFixAt = null;
    _lastRestSentAt = null;
  }

  bool _isAccuracyAcceptable(double accuracy) {
    if (accuracy <= 0) return false;
    return accuracy <= LocationTracking.maxAcceptableAccuracyMeters;
  }

  bool _shouldDispatchNewPosition(double latitude, double longitude) {
    if (_lastDispatchedLat == null || _lastDispatchedLng == null) return true;
    final meters = Geolocator.distanceBetween(
      _lastDispatchedLat!,
      _lastDispatchedLng!,
      latitude,
      longitude,
    );
    return meters >= LocationTracking.minDispatchMoveMeters;
  }

  /// Liveness heartbeat.
  ///
  /// Re-sends the last accepted pin so dispatch knows the app is alive, but
  /// always carries the time that pin was MEASURED. Refreshing that time from
  /// the OS's own last-known fix first is what separates "parked technician,
  /// GPS healthy" from "GPS died and we are replaying a frozen point" — the
  /// admin Live Map used to show both as a confident live marker.
  Future<void> _sendCurrentPositionNow() async {
    // Cheap: reads the OS cache, does not pay for an acquisition.
    try {
      final last = await Geolocator.getLastKnownPosition();
      if (last != null && _isAccuracyAcceptable(last.accuracy)) {
        _onPositionUpdate(last);
      }
    } catch (_) {
      // Fall through to whatever we already hold.
    }

    if (_lastDispatchedLat != null && _lastDispatchedLng != null) {
      _dispatchLocation(
        _lastDispatchedLat!,
        _lastDispatchedLng!,
        accuracy: _lastDispatchedAccuracy,
        fixTime: _lastFixAt,
      );
      return;
    }

    // No pin yet — bootstrap is worth a real GPS read.
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      _onPositionUpdate(position);
    } catch (e, st) {
      SentryConfig.captureException(
        StateError('Location heartbeat GPS read failed'),
        stackTrace: st,
        tags: const {'component': 'location_heartbeat'},
      );
    }
  }

  void _onPositionUpdate(Position position) {
    if (!_isAccuracyAcceptable(position.accuracy)) return;

    final moved = lastLatitude == null ||
        lastLongitude == null ||
        (position.latitude - lastLatitude!).abs() > 0.000025 ||
        (position.longitude - lastLongitude!).abs() > 0.000025;
    lastLatitude = position.latitude;
    lastLongitude = position.longitude;

    _lastFixAt = position.timestamp;

    if (_shouldDispatchNewPosition(position.latitude, position.longitude)) {
      _dispatchLocation(
        position.latitude,
        position.longitude,
        accuracy: position.accuracy,
        fixTime: position.timestamp,
      );
    }

    if (locationWarning || moved) {
      locationWarning = false;
      _emitLoaded();
    }
  }

  /// Should this fix also go out over REST?
  ///
  /// Sending every fix on both transports doubled the DB writes and the admin
  /// broadcasts for no benefit. But dropping REST entirely while the socket
  /// "looks" connected is unsafe — a socket can go quiet without disconnecting,
  /// and REST is what corrects the map in that case. So: always when the socket
  /// is down, and on a slow interval otherwise.
  bool _shouldSendRest() {
    if (!_socketService.isConnected) return true;
    final last = _lastRestSentAt;
    if (last == null) return true;
    return DateTime.now().difference(last) >=
        LocationTracking.restFallbackInterval;
  }

  /// Send a coordinate over the socket, with REST as fallback / slow corrective.
  void _dispatchLocation(
    double latitude,
    double longitude, {
    double? accuracy,
    DateTime? fixTime,
  }) {
    _lastDispatchedLat = latitude;
    _lastDispatchedLng = longitude;
    _lastDispatchedAccuracy = accuracy;
    if (fixTime != null) _lastFixAt = fixTime;

    _socketService.updateLocation(
      technicianId: technicianId,
      latitude: latitude,
      longitude: longitude,
      jobId: jobId,
      accuracy: accuracy,
      fixTime: fixTime ?? _lastFixAt,
    );

    if (_shouldSendRest()) {
      _lastRestSentAt = DateTime.now();
      _sendLocationRest(
        latitude,
        longitude,
        accuracy: accuracy,
        fixTime: fixTime ?? _lastFixAt,
      );
    }
  }

  /// Fire-and-forget REST PATCH /technicians/location.
  void _sendLocationRest(
    double latitude,
    double longitude, {
    double? accuracy,
    DateTime? fixTime,
  }) {
    Future<void> doSend() async {
      try {
        await DioHelper.patchData(
          url: EndPoints.location,
          data: {
            'latitude': latitude,
            'longitude': longitude,
            if (accuracy != null && accuracy > 0) 'accuracy': accuracy,
            if (fixTime != null) 'fix_time': fixTime.toUtc().toIso8601String(),
            if (jobId != null && jobId!.isNotEmpty) 'job_id': jobId,
          },
        );
      } catch (e, st) {
        SentryConfig.captureException(
          StateError('Location REST heartbeat send failed'),
          stackTrace: st,
          tags: const {'component': 'location_rest_heartbeat'},
        );
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
    _socketService.ensureConnected();
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
    // Tell the server we are gone BEFORE dropping the socket and the token,
    // otherwise the marker lingers on the admin Live Map until a sweep reaps it.
    // Note: the server refuses Offline while a job is still active, so a
    // mid-job logout still falls back to the sweep — and "On Job" is excluded
    // from that sweep. See the On-Job reconciliation gap.
    await _goOfflineOnBackend();
    _socketService.clearHandlers();
    _socketService.disconnect();
    await JobNotificationService.instance.clearTokenOnBackend();
    await CacheHelper.clear();
  }

  /// Best-effort Offline on logout. Never blocks or throws the logout path:
  /// a failure here just falls back to the server-side sweep.
  Future<void> _goOfflineOnBackend() async {
    try {
      await DioHelper.patchData(
        url: EndPoints.status,
        data: const {'status': 'Offline'},
      ).timeout(const Duration(seconds: 3));
    } catch (e, st) {
      SentryConfig.captureException(
        StateError('Failed to set Offline on logout'),
        stackTrace: st,
        tags: const {'component': 'logout_offline'},
      );
    }
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
