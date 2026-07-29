import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

/// Background message handler - must be a top-level function
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  _log('🔔 Background message received: ${message.messageId}');
  _log('🔔 Background data: ${message.data}');

  // Show notification from background isolate
  await _showNotificationFromBackground(message);
}

/// Standalone function to show notification from background isolate
Future<void> _showNotificationFromBackground(RemoteMessage message) async {
  final flutterLocalNotificationsPlugin = FlutterLocalNotificationsPlugin();

  // Initialize in background isolate
  const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
  const initSettings = InitializationSettings(android: androidSettings);
  await flutterLocalNotificationsPlugin.initialize(initSettings);

  // Create channel
  const channel = AndroidNotificationChannel(
    'clicks_customer_channel',
    'Clicks Customer Notifications',
    description: 'Notifications for SOS updates and job status',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
  );

  await flutterLocalNotificationsPlugin
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(channel);

  final data = message.data;
  final title = data['title'] ?? message.notification?.title ?? 'Clicks';
  final body = data['body'] ?? message.notification?.body ?? '';

  _log('🔔 BG Notification - title: $title');
  _log('🔔 BG Notification - body: $body');

  final androidDetails = AndroidNotificationDetails(
    'clicks_customer_channel',
    'Clicks Customer Notifications',
    channelDescription: 'Notifications for SOS updates and job status',
    importance: Importance.max,
    priority: Priority.max,
    icon: '@mipmap/ic_launcher',
    playSound: true,
    enableVibration: true,
    styleInformation: BigTextStyleInformation(
      body,
      contentTitle: title,
    ),
  );

  await flutterLocalNotificationsPlugin.show(
    message.hashCode,
    title,
    body,
    NotificationDetails(android: androidDetails),
    payload: jsonEncode(data),
  );

  _log('✅ BG Notification shown successfully');
}

class FCMNotificationService {
  FCMNotificationService._();
  static final FCMNotificationService instance = FCMNotificationService._();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  bool _isInitialized = false;

  // Notification channel for Android
  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'clicks_customer_channel',
    'Clicks Customer Notifications',
    description: 'Notifications for SOS updates and job status',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  // Callbacks for handling notifications
  Function(Map<String, dynamic> data)? onNotificationReceived;
  Function(Map<String, dynamic> data)? onNotificationTapped;
  Function(String? token)? onTokenRefresh;

  /// Initialize FCM and local notifications
  Future<void> initialize() async {
    if (_isInitialized) return;

    // Initialize local notifications first so Android 13+ permission APIs work.
    await _initializeLocalNotifications();

    // Create notification channel for Android
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_channel);
    }

    // Request permission (Android POST_NOTIFICATIONS + iOS/Firebase)
    await _requestPermission();

    // Set up background message handler
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification tap when app is in background or terminated
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // Check if app was opened from a notification
    final initialMessage = await _firebaseMessaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }

    // Listen for token refresh
    _firebaseMessaging.onTokenRefresh.listen((token) {
      _log('🔑 FCM Token refreshed: $token');
      onTokenRefresh?.call(token);
    });

    _isInitialized = true;
    _log('✅ FCM Notification Service initialized (Customer)');
  }

  /// Request notification permissions
  Future<void> _requestPermission() async {
    // Android 13+ requires runtime POST_NOTIFICATIONS via local notifications.
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      final androidPlugin = _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();
      await androidPlugin?.requestNotificationsPermission();
    }

    final settings = await _firebaseMessaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: false,
      provisional: false,
      sound: true,
    );

    _log('🔔 Notification permission status: ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      _log('✅ User granted notification permission');
    } else if (settings.authorizationStatus == AuthorizationStatus.provisional) {
      _log('⚠️ User granted provisional notification permission');
    } else {
      _log('❌ User declined notification permission');
    }
  }

  /// Initialize local notifications plugin
  Future<void> _initializeLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initializationSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
    );
  }

  /// Handle notification response (tap)
  void _onNotificationResponse(NotificationResponse response) {
    _log('🔔 Notification tapped: payload=${response.payload}');
    if (response.payload == null) return;

    try {
      final data = jsonDecode(response.payload!) as Map<String, dynamic>;
      onNotificationTapped?.call(data);
    } catch (e) {
      _log('❌ Error parsing notification payload: $e');
    }
  }

  /// Handle foreground messages
  void _handleForegroundMessage(RemoteMessage message) {
    _log('🔔 Foreground message received: ${message.messageId}');
    _log('📋 Data: ${message.data}');

    // Show local notification
    _showLocalNotification(message);

    // Trigger callback
    onNotificationReceived?.call(message.data);
  }

  /// Handle notification tap (from FCM directly — background/terminated)
  void _handleNotificationTap(RemoteMessage message) {
    _log('🔔 Notification tapped via FCM: ${message.messageId}');
    _log('📋 Data: ${message.data}');
    onNotificationTapped?.call(message.data);
  }

  /// Show a local notification
  Future<void> _showLocalNotification(RemoteMessage message) async {
    final data = message.data;
    final title = data['title'] ?? message.notification?.title ?? 'Clicks';
    final body = data['body'] ?? message.notification?.body ?? '';

    _log('🔔 Showing local notification:');
    _log('   Title: $title');
    _log('   Body: $body');

    final androidDetails = AndroidNotificationDetails(
      _channel.id,
      _channel.name,
      channelDescription: _channel.description,
      importance: Importance.high,
      priority: Priority.high,
      icon: '@mipmap/ic_launcher',
      playSound: true,
      enableVibration: true,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
      ),
    );

    await _localNotifications.show(
      message.hashCode,
      title,
      body,
      NotificationDetails(
        android: androidDetails,
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(data),
    );

    _log('✅ Local notification shown');
  }

  /// Get the FCM token
  Future<String?> getToken() async {
    try {
      final token = await _firebaseMessaging.getToken();
      _log('🔑 FCM Token: $token');
      return token;
    } catch (e) {
      _log('❌ Error getting FCM token: $e');
      return null;
    }
  }

  /// Subscribe to a topic
  Future<void> subscribeToTopic(String topic) async {
    try {
      await _firebaseMessaging.subscribeToTopic(topic);
      _log('✅ Subscribed to topic: $topic');
    } catch (e) {
      _log('❌ Error subscribing to topic: $e');
    }
  }

  /// Unsubscribe from a topic
  Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _firebaseMessaging.unsubscribeFromTopic(topic);
      _log('✅ Unsubscribed from topic: $topic');
    } catch (e) {
      _log('❌ Error unsubscribing from topic: $e');
    }
  }

  /// Show a custom local notification
  Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    Map<String, dynamic>? data,
  }) async {
    await _localNotifications.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: data != null ? jsonEncode(data) : null,
    );
  }

  /// Cancel a notification
  Future<void> cancelNotification(int id) async {
    await _localNotifications.cancel(id);
  }

  /// Cancel all notifications
  Future<void> cancelAllNotifications() async {
    await _localNotifications.cancelAll();
  }
}
