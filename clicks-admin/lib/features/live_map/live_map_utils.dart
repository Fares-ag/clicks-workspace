/// Live map merge helpers — mirrors LiveMap/liveMapUtils.js
const locationStaleMs = 60000;
const restPollMs = 8000;

DateTime? parseTs(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse(value.toString());
}

String? getTechLastLocationAt(Map<String, dynamic> tech) {
  return tech['lastLocationAt']?.toString() ??
      tech['_locationUpdatedAt']?.toString();
}

bool isTechLocationStale(Map<String, dynamic> tech, [DateTime? now]) {
  if (tech['locationStale'] == true) return true;
  final ts = getTechLastLocationAt(tech);
  if (ts == null) return true;
  final at = DateTime.tryParse(ts);
  if (at == null) return true;
  return (now ?? DateTime.now()).difference(at).inMilliseconds >= locationStaleMs;
}

String formatLastSeen(Map<String, dynamic> tech, [DateTime? now]) {
  final ts = getTechLastLocationAt(tech);
  if (ts == null) return 'Unknown';
  final at = DateTime.tryParse(ts);
  if (at == null) return 'Unknown';
  final sec = (now ?? DateTime.now()).difference(at).inSeconds.clamp(0, 999999);
  if (sec < 60) return '${sec}s ago';
  if (sec < 3600) return '${sec ~/ 60}m ago';
  return '${sec ~/ 3600}h ago';
}

Map<String, dynamic> mergeApiTechnicianWithSocketState(
  Map<String, dynamic> apiTech,
  Map<String, dynamic>? existing, [
  DateTime? now,
]) {
  final id = apiTech['_id']?.toString() ?? apiTech['id']?.toString() ?? '';
  final base = Map<String, dynamic>.from(apiTech)
    ..['_id'] = id
    ..['lastLocationAt'] = apiTech['lastLocationAt']
    ..['locationStale'] = apiTech['locationStale'];

  if (existing == null ||
      existing['_locationUpdatedAt'] == null ||
      existing['location'] == null) {
    return base;
  }

  final socketAt = parseTs(existing['lastLocationAt']) ??
      parseTs(existing['_locationUpdatedAt']);
  final apiAt = parseTs(apiTech['lastLocationAt']);

  if (socketAt == null) return base;
  if (apiAt != null && !apiAt.isBefore(socketAt)) return base;

  return {
    ...base,
    'location': existing['location'],
    '_locationUpdatedAt': existing['_locationUpdatedAt'],
    'lastLocationAt': existing['lastLocationAt'] ?? apiTech['lastLocationAt'],
    'locationStale': existing['locationStale'] ?? apiTech['locationStale'],
    '_socketPresenceAt': existing['_socketPresenceAt'],
  };
}

bool isSocketOnlyPreserved(
  Map<String, dynamic> tech,
  Set<String> apiIds, [
  DateTime? now,
]) {
  final id = tech['_id']?.toString() ?? '';
  if (apiIds.contains(id)) return false;
  final status = tech['currentStatus']?.toString() ?? '';
  if (status != 'Online' && status != 'On Job') return false;
  final presence = tech['_socketPresenceAt'] ?? tech['_locationUpdatedAt'];
  final at = parseTs(presence);
  if (at == null) return false;
  return (now ?? DateTime.now()).difference(at).inMilliseconds < restPollMs * 2;
}

bool hasUsableLocation(Map<String, dynamic> tech) {
  final loc = tech['location'];
  if (loc is! Map) return false;
  final lat = (loc['latitude'] as num?)?.toDouble();
  final lng = (loc['longitude'] as num?)?.toDouble();
  if (lat == null || lng == null) return false;
  if (lat == 0 && lng == 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

Map<String, dynamic> buildLocationPatch(Map<String, dynamic> data) {
  final updatedAt = data['updatedAt']?.toString() ?? DateTime.now().toUtc().toIso8601String();
  return {
    'location': {
      'latitude': (data['latitude'] as num?)?.toDouble(),
      'longitude': (data['longitude'] as num?)?.toDouble(),
    },
    '_locationUpdatedAt': updatedAt,
    'lastLocationAt': data['lastLocationAt'] ?? updatedAt,
    'locationStale': data['locationStale'] == true,
    '_socketPresenceAt': DateTime.now().toUtc().toIso8601String(),
  };
}
