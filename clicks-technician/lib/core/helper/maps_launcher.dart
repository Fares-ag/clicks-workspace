import 'package:url_launcher/url_launcher.dart';

/// Opens Google Maps search for a free-text job location (no lat/lng on Job).
Future<bool> openJobLocationInMaps(String location) async {
  final q = location.trim();
  if (q.isEmpty || q == 'Location not provided') return false;
  final uri = Uri.parse(
    'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}',
  );
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
