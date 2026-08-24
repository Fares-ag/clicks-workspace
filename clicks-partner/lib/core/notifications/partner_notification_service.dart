import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/dio_helper.dart';
import '../api/end_points.dart';
import '../helper/app_navigator.dart';
import '../helper/cache_helper.dart';
import '../routing/routes.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print('[PartnerNotif] $msg');
  }
}

/// Top-level FCM background handler — must be registered in main() before any await.
@pragma('vm:entry-point')
Future<void> partnerFirebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
  } catch (e) {
    _log('background Firebase init failed: $e');
  }
  await PartnerNotificationService.showFromBackgroundMessage(message);
}

/// Soft-fail partner push. Works when Firebase is configured; no-ops otherwise.
class PartnerNotificationService {
  PartnerNotificationService._();
  static final instance = PartnerNotificationService._();

  static const _channelId = 'clicks_partner_accrual';

  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _tokenRefreshWired = false;
  Map<String, dynamic>? _pendingTapData;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (_) {
      // No google-services / firebase options yet — skip push client.
      return;
    }

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _onLocalNotificationResponse,
    );

    await _ensureChannel();

    FirebaseMessaging.onMessage.listen(_showFromMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageOpened);

    _wireTokenRefresh();

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      _pendingTapData = Map<String, dynamic>.from(initial.data);
      _log('stored initial notification tap from killed state');
    }

    _ready = true;
    _log('initialized');
  }

  void _wireTokenRefresh() {
    if (_tokenRefreshWired) return;
    _tokenRefreshWired = true;
    FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      _log('FCM token refreshed');
      await _postTokenToBackend(token);
    });
  }

  Future<void> _ensureChannel() async {
    final androidPlugin = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        'Partner accruals',
        description: 'Credits from attributed jobs',
        importance: Importance.high,
      ),
    );
  }

  /// Request notification permission — call after login on Android 13+.
  Future<void> requestPermissions() async {
    if (!_ready) return;
    try {
      if (!kIsWeb && Platform.isAndroid) {
        final android = _local.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
        await android?.requestNotificationsPermission();
      }

      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    } catch (e) {
      _log('permission request failed: $e');
    }
  }

  Future<void> registerTokenIfLoggedIn() async {
    if (!_ready) return;
    final token = CacheHelper.getAuthToken();
    if (token == null || token.isEmpty) return;
    try {
      final fcm = await FirebaseMessaging.instance.getToken();
      if (fcm == null || fcm.isEmpty) return;
      await _postTokenToBackend(fcm);
    } catch (e) {
      _log('register token failed: $e');
    }
  }

  Future<void> _postTokenToBackend(String fcmToken) async {
    final authToken = CacheHelper.getAuthToken();
    if (authToken == null || authToken.isEmpty) return;
    try {
      await DioHelper.postData(
        url: EndPoints.fcmToken,
        data: {'fcm_token': fcmToken},
      );
      _log('FCM token registered with backend');
    } catch (e) {
      _log('FCM backend register failed: $e');
    }
  }

  Future<void> clearToken() async {
    if (!_ready) return;
    try {
      await DioHelper.deleteData(url: EndPoints.fcmToken);
    } catch (_) {}
    try {
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {}
  }

  /// Routes notification taps once the navigator is ready (e.g. HomeScreen mount).
  Future<void> handlePendingLaunchNotification() async {
    final data = _pendingTapData;
    if (data == null) return;
    _pendingTapData = null;
    await _routeFromNotification(data);
  }

  void _handleMessageOpened(RemoteMessage message) {
    _log('notification opened from background');
    // ignore: discarded_futures
    _routeFromNotification(Map<String, dynamic>.from(message.data));
  }

  void _onLocalNotificationResponse(NotificationResponse response) {
    if (response.payload == null || response.payload!.isEmpty) return;
    try {
      final decoded = jsonDecode(response.payload!);
      if (decoded is Map) {
        // ignore: discarded_futures
        _routeFromNotification(Map<String, dynamic>.from(decoded));
      }
    } catch (e) {
      _log('local notification payload parse failed: $e');
    }
  }

  Future<void> _routeFromNotification(Map<String, dynamic> data) async {
    final auth = CacheHelper.getAuthToken();
    if (auth == null || auth.isEmpty) {
      _pendingTapData = data;
      return;
    }

    final nav = navigatorKey.currentState;
    if (nav == null) {
      _pendingTapData = data;
      return;
    }

    _log('routing to dashboard from notification');
    nav.pushNamedAndRemoveUntil(Routes.home, (_) => false);
  }

  static Future<void> showFromBackgroundMessage(RemoteMessage message) async {
    final plugin = FlutterLocalNotificationsPlugin();
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await plugin.initialize(
      const InitializationSettings(android: androidInit),
    );

    final androidPlugin = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(
      const AndroidNotificationChannel(
        _channelId,
        'Partner accruals',
        description: 'Credits from attributed jobs',
        importance: Importance.high,
      ),
    );

    await _showNotification(
      message,
      local: plugin,
    );
  }

  static Future<void> _showNotification(
    RemoteMessage message, {
    required FlutterLocalNotificationsPlugin local,
  }) async {
    final data = message.data;
    final notification = message.notification;
    final title =
        data['title_en'] ?? notification?.title ?? 'Clicks Partner';
    final body = data['body_en'] ??
        notification?.body ??
        (data['amount'] != null ? '+QAR ${data['amount']} credited' : '');
    if (body.isEmpty) return;

    final payload = jsonEncode(
      data.map((k, v) => MapEntry(k, v?.toString() ?? '')),
    );

    await local.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Partner accruals',
          channelDescription: 'Credits from attributed jobs',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: payload,
    );
  }

  Future<void> _showFromMessage(RemoteMessage message) async {
    await _showNotification(message, local: _local);
  }
}
