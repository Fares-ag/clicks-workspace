// ignore: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

bool _googleMapsReady = false;

/// Injects the Google Maps JS SDK when running on Flutter web so
/// `google_maps_flutter` can render. Key comes from AppConfig / dart-define.
Future<void> ensureGoogleMapsLoaded(String apiKey) async {
  if (apiKey.trim().isEmpty) return;
  if (html.document.querySelector('#clicks-google-maps-js') != null) {
    _googleMapsReady = true;
    return;
  }
  final script = html.ScriptElement()
    ..id = 'clicks-google-maps-js'
    ..src =
        'https://maps.googleapis.com/maps/api/js?key=${Uri.encodeQueryComponent(apiKey)}'
    ..async = true;
  final head = html.document.head;
  if (head == null) return;
  head.append(script);
  await script.onLoad.first;
  _googleMapsReady = true;
}

bool get isGoogleMapsAvailable => _googleMapsReady;
