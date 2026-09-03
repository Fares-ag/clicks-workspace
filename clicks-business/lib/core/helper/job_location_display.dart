/// Format job location as "lat, lng" when coordinates are stored on the job.
String formatJobLocationDisplay(Map<String, dynamic> job) {
  final coords = job['locationCoordinates'];
  if (coords is Map) {
    final c = coords['coordinates'];
    if (c is List && c.length >= 2) {
      final lng = (c[0] as num?)?.toDouble();
      final lat = (c[1] as num?)?.toDouble();
      if (lat != null && lng != null && !(lat == 0 && lng == 0)) {
        return '$lat, $lng';
      }
    }
  }
  final raw = job['location']?.toString().trim() ?? '';
  if (raw.isEmpty) return '';
  final m = RegExp(
    r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$',
  ).firstMatch(raw);
  if (m != null) return '${m.group(1)}, ${m.group(2)}';
  return raw;
}
