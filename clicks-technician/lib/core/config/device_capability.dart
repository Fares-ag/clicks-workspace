import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';

/// Process-cached low-end device flag for 3 GB / Unisoc-class phones.
///
/// Fail-open: lookup errors and non-Android targets stay "normal" so mid-range
/// phones keep the full visual path.
class DeviceCapability {
  DeviceCapability._();

  static const _channel = MethodChannel('clicks_technician/device');

  /// Physical RAM at or below this (MB) is treated as low-end (~3.5 GB).
  static const int lowEndRamMb = 3584;

  static bool? _isLowEnd;

  /// Synchronous read after [ensureLoaded]. False until loaded or on failure.
  static bool get isLowEnd => _isLowEnd ?? false;

  static Future<void> ensureLoaded() async {
    if (_isLowEnd != null) return;
    if (kIsWeb || !Platform.isAndroid) {
      _isLowEnd = false;
      return;
    }
    try {
      final raw = await _channel.invokeMethod<Object?>('getCapability');
      if (raw is Map) {
        final flagged = raw['isLowEnd'] == true;
        final ram = raw['ramMb'];
        final ramMb = ram is num ? ram.toInt() : null;
        _isLowEnd = flagged || (ramMb != null && ramMb > 0 && ramMb <= lowEndRamMb);
      } else {
        _isLowEnd = false;
      }
    } catch (_) {
      _isLowEnd = false;
    }
  }
}
