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

import '../api/end_points/end_points.dart';
import '../config/app_config.dart';
import '../helper/cache_helper.dart';

const String kJobUrgentChannelId = 'clicks_job_urgent_v2';
const String kAcceptJobActionId = 'accept_job';
const int kJobAssignedNotifId = 42001;
const String kPendingJobIdKey = 'pending_fcm_job_id';

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
    await Firebase.initializeApp();
  } catch (_) {
    return;
  }
  await JobNotificationService.instance.showFromRemoteData(
    message.data,
    fromBackground: true,
  );
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

  /// Optional UI hook after Accept action or notification tap.
  void Function(String jobId)? onJobAcceptedFromNotification;
  void Function(String jobId)? onNotificationOpened;

  void setForeground(bool value) => _appInForeground = value;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    if (kIsWeb) {
      _log('web — FCM disabled');
      return;
    }

    try {
      await Firebase.initializeApp();
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

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    FirebaseMessaging.onMessage.listen((message) async {
      // Foreground: IncomingJobModal handles UX — skip duplicate OS banner.
      if (_appInForeground) {
        _log('foreground FCM ignored (modal handles assigned job)');
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
      'Urgent jobs',
      description: 'High-priority new job assignments',
      importance: Importance.max,
      playSound: true,
      enableVibration: true,
      sound: RawResourceAndroidNotificationSound('job_urgent'),
    );
    await android.createNotificationChannel(channel);
  }

  Future<void> showFromRemoteData(
    Map<String, dynamic> data, {
    bool fromBackground = false,
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
        'Urgent jobs',
        channelDescription: 'High-priority new job assignments',
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.call,
        ongoing: true,
        autoCancel: false,
        fullScreenIntent: true,
        playSound: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList([0, 500, 200, 500, 200, 500]),
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
      await _ensureChannel();
    }

    await _local.show(
      kJobAssignedNotifId,
      strings['title'] ?? 'New job assigned',
      body,
      details,
      payload: payload,
    );
    _log('showed urgent notif job=$jobId bg=$fromBackground');
  }

  Future<void> cancelUrgentJobNotification() async {
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
