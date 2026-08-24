import 'package:url_launcher/url_launcher.dart';

/// Parse job lat/lng from locationCoordinates or location string.
({double lat, double lng})? jobLatLngFromMap(Map<String, dynamic> job) {
  final coords = job['locationCoordinates'];
  if (coords is Map) {
    final c = coords['coordinates'];
    if (c is List && c.length >= 2) {
      final lng = (c[0] as num?)?.toDouble();
      final lat = (c[1] as num?)?.toDouble();
      if (lat != null && lng != null && !(lat == 0 && lng == 0)) {
        return (lat: lat, lng: lng);
      }
    }
  }
  final label = (job['location'] ?? '').toString().trim();
  final m = RegExp(
    r'(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)',
  ).firstMatch(label);
  if (m != null) {
    final lat = double.tryParse(m.group(1)!);
    final lng = double.tryParse(m.group(2)!);
    if (lat != null && lng != null) return (lat: lat, lng: lng);
  }
  return null;
}

/// Opens the job location in a maps/navigation app (Android "Open with" chooser).
Future<bool> openJobLocationInMaps(
  String location, {
  double? lat,
  double? lng,
}) async {
  final q = location.trim();
  if (q.isEmpty || q == 'Location not provided') return false;

  final Uri geoUri = (lat != null && lng != null)
      ? Uri.parse('geo:$lat,$lng?q=$lat,$lng(${Uri.encodeComponent(q)})')
      : Uri.parse('geo:0,0?q=${Uri.encodeComponent(q)}');

  if (await canLaunchUrl(geoUri)) {
    return launchUrl(geoUri, mode: LaunchMode.externalApplication);
  }

  final googleUri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}',
  );
  return launchUrl(googleUri, mode: LaunchMode.externalApplication);
}
