import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';

/// Tracks and requests everything a technician needs before going Online.
class TechnicianPermissions {
  TechnicianPermissions._();

  static const _batteryChannel = MethodChannel('clicks_technician/urgent_alarm');

  /// Minimum set to go Online with background Live Map + urgent job alerts.
  static Future<List<PermissionSetupStep>> missingSteps() async {
    if (kIsWeb) return const [];

    final steps = <PermissionSetupStep>[];
    if (Platform.isAndroid) {
      if (!await _notificationsGranted()) {
        steps.add(PermissionSetupStep.notifications);
      }
      if (!await _locationAlwaysGranted()) {
        steps.add(PermissionSetupStep.locationAlways);
      }
      if (!await _dndBypassGranted()) {
        steps.add(PermissionSetupStep.doNotDisturb);
      }
      if (!await _fullScreenIntentGranted()) {
        steps.add(PermissionSetupStep.fullScreenAlerts);
      }
      if (!await _batteryUnrestricted()) {
        steps.add(PermissionSetupStep.battery);
      }
    } else if (Platform.isIOS) {
      if (!await _locationAlwaysGranted()) {
        steps.add(PermissionSetupStep.locationAlways);
      }
      final settings = await Geolocator.checkPermission();
      if (settings == LocationPermission.denied) {
        steps.add(PermissionSetupStep.locationAlways);
      }
    }
    return steps;
  }

  static Future<bool> readyForOnline() async {
    final missing = await missingSteps();
    return missing.isEmpty;
  }

  /// Run one wizard step. Returns true when that step is satisfied.
  static Future<bool> runStep(PermissionSetupStep step) async {
    switch (step) {
      case PermissionSetupStep.notifications:
        return _requestNotifications();
      case PermissionSetupStep.locationAlways:
        return _requestLocationAlways();
      case PermissionSetupStep.doNotDisturb:
        return _requestDndBypass();
      case PermissionSetupStep.fullScreenAlerts:
        return _requestFullScreenIntent();
      case PermissionSetupStep.battery:
        return _requestBatteryUnrestricted();
    }
  }

  static Future<bool> _notificationsGranted() async {
    if (!Platform.isAndroid) return true;
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    final enabled = await android?.areNotificationsEnabled();
    return enabled == true;
  }

  static Future<bool> _requestNotifications() async {
    if (!Platform.isAndroid) return true;
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    final result = await android?.requestNotificationsPermission();
    if (result == true) return true;
    return _notificationsGranted();
  }

  static Future<bool> _locationAlwaysGranted() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    final permission = await Geolocator.checkPermission();
    return permission == LocationPermission.always;
  }

  /// Foreground first, then background / Always. Opens Settings when Android requires it.
  static Future<bool> _requestLocationAlways() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      await Geolocator.openLocationSettings();
      return false;
    }

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.deniedForever) {
      await Geolocator.openAppSettings();
      return false;
    }

    if (permission == LocationPermission.denied) {
      return false;
    }

    // Already "Allow all the time" / Always.
    if (permission == LocationPermission.always) {
      return true;
    }

    // While-in-use only — Android 10 may show a second prompt; Android 11+ needs Settings.
    if (permission == LocationPermission.whileInUse) {
      await Geolocator.requestPermission();
      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.always) {
        return true;
      }
      await Geolocator.openAppSettings();
      return false;
    }

    return permission == LocationPermission.always;
  }

  static Future<bool> _dndBypassGranted() async {
    if (!Platform.isAndroid) return true;
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    final granted = await android?.hasNotificationPolicyAccess();
    return granted == true;
  }

  static Future<bool> _requestDndBypass() async {
    if (!Platform.isAndroid) return true;
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    if (await _dndBypassGranted()) return true;
    await android?.requestNotificationPolicyAccess();
    return _dndBypassGranted();
  }

  static Future<bool> _fullScreenIntentGranted() async {
    // flutter_local_notifications 19.x has requestFullScreenIntentPermission
    // but no canUseFullScreenIntent — treat as optional / already handled.
    return true;
  }

  static Future<bool> _requestFullScreenIntent() async {
    if (!Platform.isAndroid) return true;
    final android = FlutterLocalNotificationsPlugin()
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await android?.requestFullScreenIntentPermission();
    return true;
  }

  static Future<bool> _batteryUnrestricted() async {
    if (!Platform.isAndroid) return true;
    try {
      final ok = await _batteryChannel.invokeMethod<bool>('isBatteryUnrestricted');
      return ok == true;
    } catch (_) {
      return true;
    }
  }

  static Future<bool> _requestBatteryUnrestricted() async {
    if (!Platform.isAndroid) return true;
    if (await _batteryUnrestricted()) return true;
    try {
      await _batteryChannel.invokeMethod<void>('requestBatteryUnrestricted');
    } catch (_) {}
    return _batteryUnrestricted();
  }

  static Future<void> openAppSettings() => Geolocator.openAppSettings();
}

enum PermissionSetupStep {
  notifications,
  locationAlways,
  doNotDisturb,
  fullScreenAlerts,
  battery,
}

extension PermissionSetupStepCopy on PermissionSetupStep {
  String get title {
    switch (this) {
      case PermissionSetupStep.notifications:
        return 'Allow notifications';
      case PermissionSetupStep.locationAlways:
        return 'Allow location all the time';
      case PermissionSetupStep.doNotDisturb:
        return 'Allow urgent alerts in Do Not Disturb';
      case PermissionSetupStep.fullScreenAlerts:
        return 'Allow full-screen job alerts';
      case PermissionSetupStep.battery:
        return 'Keep app running in background';
    }
  }

  String get body {
    switch (this) {
      case PermissionSetupStep.notifications:
        return 'So you never miss a new job assignment, even when the app is closed.';
      case PermissionSetupStep.locationAlways:
        return 'Dispatch needs your location on the Live Map while you are Online, even when the screen is off.\n\n'
            'On the next screen: tap Permissions → Location → Allow all the time.';
      case PermissionSetupStep.doNotDisturb:
        return 'Urgent job alarms should ring even when Do Not Disturb is on.\n\n'
            'On the next screen: turn on access for Clicks Technician.';
      case PermissionSetupStep.fullScreenAlerts:
        return 'New jobs can pop up over the lock screen so you see them immediately.\n\n'
            'On the next screen: allow full-screen notifications for this app.';
      case PermissionSetupStep.battery:
        return 'Some phones stop background apps and hide alerts. Unrestricted battery lets Clicks stay online reliably.\n\n'
            'On the next screen: tap Allow or Unrestricted.';
    }
  }

  String get actionLabel {
    switch (this) {
      case PermissionSetupStep.notifications:
        return 'Allow notifications';
      case PermissionSetupStep.locationAlways:
        return 'Continue';
      case PermissionSetupStep.doNotDisturb:
        return 'Open settings';
      case PermissionSetupStep.fullScreenAlerts:
        return 'Continue';
      case PermissionSetupStep.battery:
        return 'Allow unrestricted';
    }
  }

  bool get opensExternalSettings {
    switch (this) {
      case PermissionSetupStep.locationAlways:
      case PermissionSetupStep.doNotDisturb:
      case PermissionSetupStep.fullScreenAlerts:
      case PermissionSetupStep.battery:
        return true;
      case PermissionSetupStep.notifications:
        return false;
    }
  }
}
