import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';
import 'dart:ui' show PlatformDispatcher;

import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_ringtone_player/flutter_ringtone_player.dart';

import '../api/end_points/end_points.dart';
import '../helper/cache_helper.dart';
import '../../firebase_options.dart';
import 'urgent_alarm_volume.dart';

/// Bumped channel id when sound / insistent behavior changes (Android channels
/// are immutable after first create).
const String kJobUrgentChannelId = 'clicks_job_urgent_v4';
const String kAcceptJobActionId = 'accept_job';
const int kJobAssignedNotifId = 42001;
const String kPendingJobIdKey = 'pending_fcm_job_id';
const String kAcceptedFromNotifJobIdKey = 'accepted_from_notif_job_id';
const String kAcceptNotifFailedKey = 'accept_notif_failed_message';

/// Android Notification.FLAG_INSISTENT — sound/vibration repeats until cancel.
const int kInsistentFlag = 4;

bool _isQaOnlyJobId(String jobId) =>
    jobId.startsWith('qa-live-') || jobId.startsWith('qa-bg-');

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[JobNotif] $msg');
  }
}

/// Top-level FCM background handler (must be entry-point).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await FirebaseBootstrap.initialize();
  } catch (e) {
    _log('background Firebase init failed (continuing with local notif): $e');
  }
  await JobNotificationService.showUrgentJobFromBackground(message.data);
}

/// Urgent job assignment notifications (FCM + local channel).
///
/// Graceful no-op when Firebase / google-services.json is missing (Android) or
/// GoogleService-Info.plist is missing (iOS) — see ios/Runner/README-FIREBASE.md.
class JobNotificationService {
  JobNotificationService._();
  static final JobNotificationService instance = JobNotificationService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool enabled = false;
  bool _initialized = false;
  bool _appInForeground = true;
  bool _tokenRefreshWired = false;
  bool _alarmPlaying = false;

  /// Optional UI hook after Accept action or notification tap.
  void Function(String jobId)? onJobAcceptedFromNotification;
  void Function(String jobId)? onNotificationOpened;
  void Function(Map<String, dynamic> data)? onForegroundJobAssigned;
  void Function(String jobId, String message)? onJobAcceptFromNotificationFailed;

  void setForeground(bool value) => _appInForeground = value;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    if (kIsWeb) {
      _log('web — FCM disabled');
      return;
    }

    try {
      await FirebaseBootstrap.initialize();
    } catch (e) {
      _log('Firebase.initializeApp failed (missing platform config?): $e');
      enabled = false;
      return;
    }

    enabled = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );

    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
      onDidReceiveBackgroundNotificationResponse: notificationActionBackground,
    );

    await _ensureChannel();
    await _handleLaunchNotificationAction();

    // Registered in main() before any await — do not register again here.

    FirebaseMessaging.onMessage.listen((message) async {
      final type = message.data['type']?.toString() ?? '';
      if (type.isNotEmpty && type != 'job_assigned') return;

      if (_appInForeground) {
        final jobId = message.data['job_id']?.toString() ?? '';
        if (jobId.isNotEmpty) {
          await CacheHelper.save(kPendingJobIdKey, jobId);
        }
        onForegroundJobAssigned?.call(
          Map<String, dynamic>.from(message.data),
        );
        // Keep beeping in-app until Accept (modal may also be visible).
        await showFromRemoteData(message.data);
        _log('foreground FCM job_assigned → insistent alert');
        return;
      }
      await showFromRemoteData(message.data);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final jobId = message.data['job_id']?.toString();
      if (jobId != null && jobId.isNotEmpty) {
        CacheHelper.save(kPendingJobIdKey, jobId);
        onNotificationOpened?.call(jobId);
        // Hybrid FCM may show a system tray notification first; upgrade to
        // the full insistent alarm channel when the tech opens the app.
        showFromRemoteData(message.data, fromBackground: true);
      }
    });

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      final jobId = initial.data['job_id']?.toString();
      if (jobId != null && jobId.isNotEmpty) {
        await CacheHelper.save(kPendingJobIdKey, jobId);
        await showFromRemoteData(initial.data, fromBackground: true);
      }
    }

    if (!kIsWeb && Platform.isAndroid) {
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: false,
        badge: false,
        sound: false,
      );
    } else if (!kIsWeb && Platform.isIOS) {
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    _wireTokenRefresh();

    _log('initialized');
  }

  void _wireTokenRefresh() {
    if (_tokenRefreshWired) return;
    _tokenRefreshWired = true;
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      _log('FCM token refreshed');
      await _postFcmTokenToBackend(newToken);
    });
  }

  Future<void> _ensureIosApnsToken() async {
    if (kIsWeb || !Platform.isIOS) return;
    try {
      var apns = await FirebaseMessaging.instance.getAPNSToken();
      if (apns != null && apns.isNotEmpty) return;
      for (var i = 0; i < 6; i++) {
        await Future.delayed(const Duration(milliseconds: 500));
        apns = await FirebaseMessaging.instance.getAPNSToken();
        if (apns != null && apns.isNotEmpty) {
          _log('APNS token ready');
          return;
        }
      }
      _log('APNS token not available yet');
    } catch (e) {
      _log('APNS token check failed: $e');
    }
  }

  Future<void> _postFcmTokenToBackend(String fcmToken) async {
    final authToken = CacheHelper.getAuthToken();
    if (authToken == null || authToken.isEmpty) return;
    try {
      await Dio(
        BaseOptions(
          baseUrl: EndPoints.baseUrl,
          headers: {
            'Authorization': 'Bearer $authToken',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        ),
      ).post(EndPoints.fcmToken, data: {'fcm_token': fcmToken});
      _log('FCM token registered with backend');
    } catch (e) {
      _log('FCM backend register failed: $e');
    }
  }

  Future<void> requestPermissions() async {
    if (!enabled) return;
    try {
      if (!kIsWeb && Platform.isIOS) {
        final ios = _local.resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin>();
        await ios?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
          critical: true,
        );
      }

      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        criticalAlert: true,
      );

      if (!kIsWeb && Platform.isIOS) {
        await _ensureIosApnsToken();
      }

      final android = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.requestNotificationsPermission();
      await android?.requestFullScreenIntentPermission();
      // Required before bypassDnd channel can take effect on Android 6+.
      await android?.requestNotificationPolicyAccess();
    } catch (e) {
      _log('permission request failed: $e');
    }
  }

  Future<void> registerTokenWithBackend() async {
    if (!enabled) return;
    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) return;

    try {
      if (!kIsWeb && Platform.isIOS) {
        await _ensureIosApnsToken();
      }

      final fcm = await FirebaseMessaging.instance.getToken();
      if (fcm == null || fcm.isEmpty) {
        _log('no FCM token yet');
        return;
      }
      await _postFcmTokenToBackend(fcm);
    } catch (e) {
      _log('register token failed: $e');
    }
  }

  Future<void> clearTokenOnBackend() async {
    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) return;
    try {
      await Dio(
        BaseOptions(
          baseUrl: EndPoints.baseUrl,
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
          },
        ),
      ).delete(EndPoints.fcmToken);
    } catch (_) {}
  }

  Future<void> _ensureChannel() async {
    final android = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (android == null) return;

    const channel = AndroidNotificationChannel(
      kJobUrgentChannelId,
      'Urgent jobs (alarm)',
      description: 'Repeating alarm until you accept a new job',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      bypassDnd: true,
      sound: RawResourceAndroidNotificationSound('job_urgent'),
      audioAttributesUsage: AudioAttributesUsage.alarm,
    );
    await android.createNotificationChannel(channel);
  }

  /// Looping system/alarm ringtone (works while Dart isolate is alive).
  Future<void> startInsistentAlarm() async {
    if (kIsWeb || _alarmPlaying) return;
    _alarmPlaying = true;
    try {
      await FlutterRingtonePlayer().play(
        android: AndroidSounds.alarm,
        ios: IosSounds.alarm,
        looping: true,
        volume: 1.0,
        asAlarm: true,
      );
      _log('insistent ringtone started');
    } catch (e) {
      _alarmPlaying = false;
      _log('ringtone start failed: $e');
    }
  }

  Future<void> stopInsistentAlarm() async {
    if (kIsWeb) return;
    _alarmPlaying = false;
    try {
      await FlutterRingtonePlayer().stop();
    } catch (_) {}
  }

  /// Entry point for FCM background/killed isolates — does not rely on singleton state.
  static Future<void> showUrgentJobFromBackground(
    Map<String, dynamic> data,
  ) async {
    await JobNotificationService.instance._showUrgentJobNotification(
      data,
      fromBackground: true,
      forceShow: true,
    );
  }

  Future<void> showFromRemoteData(
    Map<String, dynamic> data, {
    bool fromBackground = false,
  }) async {
    await _showUrgentJobNotification(
      data,
      fromBackground: fromBackground,
      forceShow: fromBackground || !_appInForeground,
    );
  }

  Future<void> _showUrgentJobNotification(
    Map<String, dynamic> data, {
    required bool fromBackground,
    required bool forceShow,
  }) async {
    final type = data['type']?.toString() ?? '';
    if (type.isNotEmpty && type != 'job_assigned') return;

    final jobId = data['job_id']?.toString() ?? '';
    if (jobId.isEmpty) return;

    try {
      await CacheHelper.init();
    } catch (_) {}
    await CacheHelper.save(kPendingJobIdKey, jobId);

    final locale = PlatformDispatcher.instance.locale;
    final isAr = locale.languageCode.toLowerCase().startsWith('ar');
    final strings = _localized(isAr);

    final issue = data['issue']?.toString() ?? '';
    final location = data['location']?.toString() ?? '';
    final body = (strings['body'] ?? '{issue} — {location}')
        .replaceAll('{issue}', issue.isEmpty ? '—' : issue)
        .replaceAll('{location}', location.isEmpty ? '—' : location);

    final payload = jsonEncode({
      'type': 'job_assigned',
      'job_id': jobId,
      ...data.map((k, v) => MapEntry(k, v?.toString() ?? '')),
    });

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        kJobUrgentChannelId,
        'Urgent jobs (alarm)',
        channelDescription: 'Repeating alarm until you accept a new job',
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.alarm,
        channelBypassDnd: true,
        ongoing: true,
        autoCancel: false,
        fullScreenIntent: true,
        playSound: true,
        enableVibration: true,
        audioAttributesUsage: AudioAttributesUsage.alarm,
        // Keep sound/vibration looping until cancelled (Accept).
        additionalFlags: Int32List.fromList(<int>[kInsistentFlag]),
        vibrationPattern: Int64List.fromList(
          [0, 600, 200, 600, 200, 600, 400, 800],
        ),
        sound: const RawResourceAndroidNotificationSound('job_urgent'),
        actions: <AndroidNotificationAction>[
          AndroidNotificationAction(
            kAcceptJobActionId,
            strings['accept'] ?? 'Accept Job',
            // Run accept in background without forcing a cold-start race.
            showsUserInterface: false,
            cancelNotification: true,
          ),
        ],
      ),
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        interruptionLevel: InterruptionLevel.timeSensitive,
      ),
    );

    // Ensure plugin is ready in background isolate
    if (fromBackground) {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings();
      await _local.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
        onDidReceiveBackgroundNotificationResponse: notificationActionBackground,
      );
      final android = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await android?.requestNotificationPolicyAccess();
      await _ensureChannel();
    }

    await UrgentAlarmVolume.boostToMax();

    if (forceShow) {
      await _local.show(
        kJobAssignedNotifId,
        strings['title'] ?? 'New job assigned',
        body,
        details,
        payload: payload,
      );
    }
    // Extra looping ringtone while the app/isolate is alive.
    await startInsistentAlarm();
    _log('showed insistent urgent notif job=$jobId bg=$fromBackground force=$forceShow');
  }

  Future<void> cancelUrgentJobNotification() async {
    await stopInsistentAlarm();
    try {
      await _local.cancel(kJobAssignedNotifId);
    } catch (_) {}
  }

  Future<void> _handleLaunchNotificationAction() async {
    try {
      final details = await _local.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp != true) return;
      final response = details?.notificationResponse;
      if (response == null) return;
      _log('processing notification launch action');
      await _handleResponse(response);
    } catch (e) {
      _log('launch notification action failed: $e');
    }
  }

  void _onNotificationResponse(NotificationResponse response) {
    // ignore: discarded_futures
    _handleResponse(response);
  }

  static Future<void> _handleResponse(NotificationResponse response) async {
    Map<String, dynamic> data = {};
    try {
      if (response.payload != null && response.payload!.isNotEmpty) {
        final decoded = jsonDecode(response.payload!);
        if (decoded is Map) {
          data = Map<String, dynamic>.from(decoded);
        }
      }
    } catch (_) {}

    var jobId = data['job_id']?.toString() ?? '';
    if (jobId.isEmpty) {
      try {
        await CacheHelper.init();
      } catch (_) {}
      jobId = CacheHelper.get(kPendingJobIdKey)?.toString() ?? '';
    }
    if (jobId.isEmpty) {
      _log('notification action ignored — no job_id in payload or cache');
      return;
    }

    if (response.actionId == kAcceptJobActionId) {
      _log('accept action for job=$jobId');
      if (_isQaOnlyJobId(jobId)) {
        try {
          await CacheHelper.init();
          await CacheHelper.save(
            kAcceptNotifFailedKey,
            'Test alert only — assign a real job from admin to test Accept.',
          );
          await CacheHelper.remove(kPendingJobIdKey);
        } catch (_) {}
        await JobNotificationService.instance.cancelUrgentJobNotification();
        _log('accept skipped for QA-only job=$jobId');
        return;
      }
      final ok = await acceptJobById(jobId);
      if (ok) {
        try {
          await CacheHelper.init();
          await CacheHelper.save(kAcceptedFromNotifJobIdKey, jobId);
          await CacheHelper.remove(kPendingJobIdKey);
          await CacheHelper.remove(kAcceptNotifFailedKey);
        } catch (_) {}
        await JobNotificationService.instance.cancelUrgentJobNotification();
        JobNotificationService.instance.onJobAcceptedFromNotification
            ?.call(jobId);
        _log('accept action succeeded job=$jobId');
      } else {
        _log('accept action failed job=$jobId');
        try {
          await CacheHelper.init();
          await CacheHelper.save(
            kAcceptNotifFailedKey,
            'Could not accept job from notification. Open the app and tap Accept again.',
          );
        } catch (_) {}
        JobNotificationService.instance.onJobAcceptFromNotificationFailed
            ?.call(jobId, 'Could not accept job. Open the app and try again.');
      }
      return;
    }

    try {
      await CacheHelper.init();
      await CacheHelper.save(kPendingJobIdKey, jobId);
    } catch (_) {}
    JobNotificationService.instance.onNotificationOpened?.call(jobId);
  }

  /// Accept job using cached JWT (works from notification action isolate).
  static Future<bool> acceptJobById(String jobId) async {
    try {
      await CacheHelper.init();
    } catch (_) {}
    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) {
      _log('accept from notif failed: no auth token in cache');
      return false;
    }
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: EndPoints.baseUrl,
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          validateStatus: (s) => s != null && s < 600,
        ),
      );
      final res = await dio.post(EndPoints.acceptJob(jobId), data: {});
      if (res.statusCode == 200 || res.statusCode == 201) {
        return true;
      }
      final err = res.data is Map
          ? (res.data['error'] ?? res.data['message'])?.toString()
          : null;
      _log(
        'accept from notif HTTP ${res.statusCode} job=$jobId${err != null ? ' — $err' : ''}',
      );
      return false;
    } catch (e) {
      _log('accept from notif failed: $e');
      return false;
    }
  }

  static Map<String, String> _localized(bool isAr) {
    // Prefer easy_localization keys when the widget tree is ready; fall back
    // for background isolates.
    try {
      final title = 'notif.job_assigned.title'.tr();
      final body = 'notif.job_assigned.body'.tr();
      final accept = 'notif.job_assigned.accept'.tr();
      if (title.isNotEmpty && !title.startsWith('notif.')) {
        return {'title': title, 'body': body, 'accept': accept};
      }
    } catch (_) {}

    if (isAr) {
      return {
        'title': 'مهمة جديدة',
        'body': '{issue} — {location}',
        'accept': 'قبول المهمة',
      };
    }
    return {
      'title': 'New job assigned',
      'body': '{issue} — {location}',
      'accept': 'Accept Job',
    };
  }
}

/// Background notification action (Accept Job).
@pragma('vm:entry-point')
Future<void> notificationActionBackground(NotificationResponse response) async {
  await JobNotificationService._handleResponse(response);
}
