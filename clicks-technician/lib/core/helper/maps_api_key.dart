import 'package:clicks_technician/core/config/app_config.dart';
import 'package:flutter/services.dart';

/// Resolves the Google Maps key used for Geocoding / Directions.
/// Prefers `--dart-define=GOOGLE_MAPS_API_KEY`, then falls back to the
/// AndroidManifest meta-data value (same key the Maps SDK already uses).
class MapsApiKey {
  MapsApiKey._();

  static const _channel = MethodChannel('clicks_technician/maps_key');
  static String? _cached;

  static Future<String> resolve() async {
    final fromDefine = AppConfig.googleMapsApiKey.trim();
    if (fromDefine.isNotEmpty) {
      _cached = fromDefine;
      return fromDefine;
    }
    if (_cached != null && _cached!.isNotEmpty) return _cached!;
    try {
      final native = await _channel.invokeMethod<String>('getGoogleMapsApiKey');
      final key = (native ?? '').trim();
      _cached = key;
      return key;
    } catch (_) {
      _cached = '';
      return '';
    }
  }

  static String get syncOrEmpty =>
      (_cached?.isNotEmpty == true)
          ? _cached!
          : AppConfig.googleMapsApiKey.trim();
}
