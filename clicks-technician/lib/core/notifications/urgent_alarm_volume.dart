import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';

/// Boosts Android STREAM_ALARM to max so urgent job alerts stay loud even when
/// media/notification volume is turned down.
class UrgentAlarmVolume {
  UrgentAlarmVolume._();

  static const _channel = MethodChannel('clicks_technician/urgent_alarm');

  static Future<void> boostToMax() async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('boostAlarmVolume');
    } catch (_) {}
  }
}
