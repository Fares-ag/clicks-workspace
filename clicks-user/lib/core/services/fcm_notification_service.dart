import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../../firebase_options.dart';
import 'session_sync.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

/// Background message handler — must be a top-level function registered in main().
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (e) {
    _log('⚠️ Background Firebase init failed: $e');
  }
  _log('🔔 Background message received: ${message.messageId}');
  // The server sends a `notification` block (scenario 69): the OS already
  // shows it in the tray, grouped per job. Showing a local copy too gave the
  // customer two entries for every update (scenario 73).
  if (message.notification != null) return;
  await _showNotificationFromBackground(message);
}

/// One tray slot per job / SOS: a new update for the same job replaces the
/// previous entry instead of stacking 6–8 of them (scenario 73).
int customerNotificationIdFor(Map<String, dynamic> data) {
  final group = data['group']?.toString() ??
      (data['job_id']?.toString().isNotEmpty == true
          ? 'job_${data['job_id']}'
          : data['sos_id']?.toString().isNotEmpty == true
              ? 'sos_${data['sos_id']}'
              : 'clicks');
  return group.hashCode & 0x7fffffff;
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
    customerNotificationIdFor(data),
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
  Function(String? token)? onTokenRefresh;

  Function(Map<String, dynamic> data)? _onNotificationTapped;
  Map<String, dynamic>? _pendingTap;

  /// Tap handler. A tap that arrives before the handler is set (the tap that
  /// cold-started the app) is kept and delivered as soon as it is set.
  Function(Map<String, dynamic> data)? get onNotificationTapped =>
      _onNotificationTapped;
  set onNotificationTapped(Function(Map<String, dynamic> data)? handler) {
    _onNotificationTapped = handler;
    final pending = _pendingTap;
    if (handler != null && pending != null) {
      _pendingTap = null;
      handler(pending);
    }
  }

  void _deliverTap(Map<String, dynamic> data) {
    final handler = _onNotificationTapped;
    if (handler == null) {
      _pendingTap = data;
    } else {
      handler(data);
    }
  }

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

    // Registered in main() before any await — do not register again here.

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification tap when app is in background or terminated
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // App cold-started from a tap: an OS-shown push (FCM) or a local
    // notification we showed (getNotificationAppLaunchDetails) — scenario 72.
    final initialMessage = await _firebaseMessaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    } else {
      try {
        final launch =
            await _localNotifications.getNotificationAppLaunchDetails();
        final payload = launch?.notificationResponse?.payload;
        if ((launch?.didNotificationLaunchApp ?? false) &&
            payload != null &&
            payload.isNotEmpty) {
          final data = jsonDecode(payload);
          if (data is Map) _deliverTap(Map<String, dynamic>.from(data));
        }
      } catch (e) {
        _log('⚠️ launch details unavailable: $e');
      }
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
      _deliverTap(data);
    } catch (e) {
      _log('❌ Error parsing notification payload: $e');
    }
  }

  /// Handle foreground messages
  void _handleForegroundMessage(RemoteMessage message) {
    _log('🔔 Foreground message received: ${message.messageId}');
    _log('📋 Data: ${message.data}');

    // Foreground: no banner when the customer is already looking at this
    // job / SOS — the screen updates itself (scenario 73).
    final data = message.data;
    final onScreen = ActiveSessionScreen.isOnTop &&
        ActiveSessionScreen.shows(
          jobId: data['job_id']?.toString(),
          sosId: data['sos_id']?.toString(),
        );
    if (!onScreen) _showLocalNotification(message);

    // Trigger callback
    onNotificationReceived?.call(message.data);
  }

  /// Handle notification tap (from FCM directly — background/terminated)
  void _handleNotificationTap(RemoteMessage message) {
    _log('🔔 Notification tapped via FCM: ${message.messageId}');
    _log('📋 Data: ${message.data}');
    _deliverTap(Map<String, dynamic>.from(message.data));
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
      customerNotificationIdFor(data),
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

  /// Invalidate this device's FCM token.
  ///
  /// Must be called on logout: the token stays stored on the customer record
  /// server-side, so without this the next account signing in on the device
  /// would keep receiving the previous account's pushes.
  Future<void> deleteToken() async {
    try {
      await _firebaseMessaging.deleteToken();
      _log('🔕 FCM token deleted');
    } catch (e) {
      _log('❌ Error deleting FCM token: $e');
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
