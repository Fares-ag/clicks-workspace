import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';
import 'dart:ui' show PlatformDispatcher;

import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_ringtone_player/flutter_ringtone_player.dart';

import '../api/end_points/end_points.dart';
import '../config/app_config.dart';
import '../helper/cache_helper.dart';
import '../../firebase_options.dart';
import 'urgent_alarm_volume.dart';

/// Bumped channel id when sound / insistent behavior changes (Android channels
/// are immutable after first create).
const String kJobUrgentChannelId = 'clicks_job_urgent_v4';
const String kAcceptJobActionId = 'accept_job';
const int kJobAssignedNotifId = 42001;
const String kPendingJobIdKey = 'pending_fcm_job_id';

/// Android Notification.FLAG_INSISTENT — sound/vibration repeats until cancel.
const int kInsistentFlag = 4;

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
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (e) {
    _log('background Firebase init failed (continuing with local notif): $e');
  }
  await JobNotificationService.showUrgentJobFromBackground(message.data);
}

/// Urgent Android job assignment notifications (FCM + local channel).
///
/// Graceful no-op when Firebase / google-services.json is missing.
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
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    } catch (e) {
      _log('Firebase.initializeApp failed (missing google-services?): $e');
      enabled = false;
      return;
    }

    enabled = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);

    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
      onDidReceiveBackgroundNotificationResponse: notificationActionBackground,
    );

    await _ensureChannel();

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
      }
    });

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      final jobId = initial.data['job_id']?.toString();
      if (jobId != null && jobId.isNotEmpty) {
        await CacheHelper.save(kPendingJobIdKey, jobId);
      }
    }

    if (!kIsWeb && Platform.isAndroid) {
      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
        alert: false,
        badge: false,
        sound: false,
      );
    }

    _log('initialized');
  }

  Future<void> requestPermissions() async {
    if (!enabled) return;
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        criticalAlert: true,
      );
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
    final token = CacheHelper.get('token')?.toString();
    if (token == null || token.isEmpty) return;

    try {
      final fcm = await FirebaseMessaging.instance.getToken();
      if (fcm == null || fcm.isEmpty) {
        _log('no FCM token yet');
        return;
      }
      final dio = Dio(
        BaseOptions(
          baseUrl: EndPoints.baseUrl,
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        ),
      );
      await dio.post(
        EndPoints.fcmToken,
        data: {'fcm_token': fcm},
      );
      _log('FCM token registered');

      if (!_tokenRefreshWired) {
        _tokenRefreshWired = true;
        FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
          try {
            final t = CacheHelper.get('token')?.toString();
            if (t == null || t.isEmpty) return;
            await Dio(
              BaseOptions(
                baseUrl: EndPoints.baseUrl,
                headers: {
                  'Authorization': 'Bearer $t',
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              ),
            ).post(EndPoints.fcmToken, data: {'fcm_token': newToken});
          } catch (_) {}
        });
      }
    } catch (e) {
      _log('register token failed: $e');
    }
  }

  Future<void> clearTokenOnBackend() async {
    final token = CacheHelper.get('token')?.toString();
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
            showsUserInterface: true,
            cancelNotification: true,
          ),
        ],
      ),
    );

    // Ensure plugin is ready in background isolate
    if (fromBackground) {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      await _local.initialize(
        const InitializationSettings(android: androidInit),
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

  void _onNotificationResponse(NotificationResponse response) {
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

    final jobId = data['job_id']?.toString() ?? '';
    if (jobId.isEmpty) return;

    if (response.actionId == kAcceptJobActionId) {
      final ok = await acceptJobById(jobId);
      if (ok) {
        await JobNotificationService.instance.cancelUrgentJobNotification();
        JobNotificationService.instance.onJobAcceptedFromNotification
            ?.call(jobId);
      } else {
        JobNotificationService.instance.onJobAcceptFromNotificationFailed
            ?.call(jobId, 'Could not accept job. Open the app and try again.');
      }
      return;
    }

    await CacheHelper.save(kPendingJobIdKey, jobId);
    JobNotificationService.instance.onNotificationOpened?.call(jobId);
  }

  /// Accept job using cached JWT (works from notification action isolate).
  static Future<bool> acceptJobById(String jobId) async {
    try {
      await CacheHelper.init();
    } catch (_) {}
    final token = CacheHelper.get('token')?.toString();
    if (token == null || token.isEmpty) return false;
    try {
      final dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          validateStatus: (s) => s != null && s < 600,
        ),
      );
      final res = await dio.post(EndPoints.acceptJob(jobId), data: {});
      return res.statusCode == 200 || res.statusCode == 201;
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
void notificationActionBackground(NotificationResponse response) {
  // ignore: discarded_futures
  JobNotificationService._handleResponse(response);
}
