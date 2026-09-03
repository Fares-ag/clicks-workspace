import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/dio_helper.dart';
import '../api/end_points.dart';
import '../helper/cache_helper.dart';

const String kAdminDispatchChannelId = 'clicks_admin_dispatch_v1';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[AdminNotif] $msg');
  }
}

@pragma('vm:entry-point')
Future<void> adminFirebaseBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  await AdminNotificationService.showFromRemoteData(message.data);
}

class AdminNotificationService {
  AdminNotificationService._();
  static final AdminNotificationService instance = AdminNotificationService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool enabled = false;
  bool _initialized = false;
  bool _appInForeground = true;

  bool get isForeground => _appInForeground;

  void Function(Map<String, dynamic> data)? onDispatchOpened;

  void setForeground(bool value) => _appInForeground = value;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    if (kIsWeb) return;

    try {
      await Firebase.initializeApp();
    } catch (e) {
      _log('Firebase init skipped: $e');
      return;
    }

    enabled = true;

    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );

    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && payload.isNotEmpty) {
          onDispatchOpened?.call({'type': payload});
        }
      },
    );

    if (Platform.isAndroid) {
      const channel = AndroidNotificationChannel(
        kAdminDispatchChannelId,
        'Dispatch alerts',
        description: 'SOS and service request alerts for admins',
        importance: Importance.high,
      );
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(channel);
    }

    FirebaseMessaging.onMessage.listen((message) async {
      if (_appInForeground) return;
      await showFromRemoteData(message.data);
    });

    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      onDispatchOpened?.call(message.data);
    });

    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _registerToken(token);
    });
  }

  Future<void> registerAfterLogin() async {
    if (!enabled) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final token = await messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }
    } catch (e) {
      _log('FCM register failed: $e');
    }
  }

  Future<void> clearToken() async {
    if (!enabled) return;
    try {
      await DioHelper.deleteData(url: EndPoints.fcmToken);
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      _log('FCM clear failed: $e');
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await DioHelper.putData(
        url: EndPoints.fcmToken,
        data: {'fcm_token': token},
      );
      _log('FCM token registered');
    } catch (e) {
      _log('FCM token upload failed: $e');
    }
  }

  static Future<void> showFromRemoteData(Map<String, dynamic> data) async {
    final type = data['type']?.toString() ?? '';
    final title = data['title']?.toString() ?? 'Clicks Admin';
    final body = data['body']?.toString() ?? 'New dispatch alert';

    final plugin = FlutterLocalNotificationsPlugin();
    const androidDetails = AndroidNotificationDetails(
      kAdminDispatchChannelId,
      'Dispatch alerts',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(android: androidDetails);

    await plugin.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: type,
    );
  }

  Future<void> showLocal({
    required String title,
    required String body,
    String? payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      kAdminDispatchChannelId,
      'Dispatch alerts',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(android: androidDetails);
    await _local.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      details,
      payload: payload,
    );
  }
}
