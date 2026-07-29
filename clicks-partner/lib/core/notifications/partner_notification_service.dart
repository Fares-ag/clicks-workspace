import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../api/dio_helper.dart';
import '../api/end_points.dart';
import '../helper/cache_helper.dart';

/// Soft-fail partner push. Works when Firebase is configured; no-ops otherwise.
class PartnerNotificationService {
  PartnerNotificationService._();
  static final instance = PartnerNotificationService._();

  static const _channelId = 'clicks_partner_accrual';
  final _local = FlutterLocalNotificationsPlugin();
  bool _ready = false;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (_) {
      // No google-services / firebase options yet — skip push client.
      return;
    }

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: DarwinInitializationSettings()),
    );

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

    FirebaseMessaging.onMessage.listen(_showFromMessage);
    FirebaseMessaging.onMessageOpenedApp.listen((_) {});
    _ready = true;
  }

  Future<void> requestPermissions() async {
    if (!_ready) return;
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    } catch (_) {}
  }

  Future<void> registerTokenIfLoggedIn() async {
    if (!_ready) return;
    final token = CacheHelper.get('token');
    if (token == null || token.isEmpty) return;
    try {
      final fcm = await FirebaseMessaging.instance.getToken();
      if (fcm == null || fcm.isEmpty) return;
      await DioHelper.postData(
        url: EndPoints.fcmToken,
        data: {'fcm_token': fcm},
      );
    } catch (_) {}
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

  Future<void> _showFromMessage(RemoteMessage message) async {
    final data = message.data;
    final notification = message.notification;
    final title =
        data['title_en'] ?? notification?.title ?? 'Clicks Partner';
    final body = data['body_en'] ??
        notification?.body ??
        (data['amount'] != null ? '+QAR ${data['amount']} credited' : '');
    if (body.isEmpty) return;

    await _local.show(
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
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }
}
