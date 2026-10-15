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

String? getTechLastHeartbeatAt(Map<String, dynamic> tech) {
  return tech['lastHeartbeatAt']?.toString() ??
      tech['_socketPresenceAt']?.toString();
}

bool _isTimestampStale(String? value, DateTime now) {
  final at = parseTs(value);
  if (at == null) return true;
  return now.difference(at).inMilliseconds >= locationStaleMs;
}

bool isTechGpsStale(Map<String, dynamic> tech, [DateTime? now]) {
  final ts = getTechLastLocationAt(tech);
  if (ts == null) return true;
  return _isTimestampStale(ts, now ?? DateTime.now());
}

bool isTechPresenceStale(Map<String, dynamic> tech, [DateTime? now]) {
  final clock = now ?? DateTime.now();
  if (tech['presenceStale'] == true) return true;
  final heard = getTechLastHeartbeatAt(tech);
  if (heard != null) return _isTimestampStale(heard, clock);
  if (tech['locationStale'] == true) return true;
  return isTechGpsStale(tech, clock);
}

bool isTechLocationStale(Map<String, dynamic> tech, [DateTime? now]) {
  return isTechPresenceStale(tech, now);
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

String formatPresenceLabel(Map<String, dynamic> tech, [DateTime? now]) {
  final clock = now ?? DateTime.now();
  if (isTechPresenceStale(tech, clock)) {
    return 'Disconnected · last GPS ${formatLastSeen(tech, clock)}';
  }
  if (isTechGpsStale(tech, clock)) {
    return 'Connected · GPS ${formatLastSeen(tech, clock)}';
  }
  return 'Live';
}

Map<String, dynamic> mergeApiTechnicianWithSocketState(
  Map<String, dynamic> apiTech,
  Map<String, dynamic>? existing, [
  DateTime? now,
]) {
  final id = apiTech['_id']?.toString() ?? apiTech['id']?.toString() ?? '';
  final lastHeartbeatAt = _newerIso(
    apiTech['lastHeartbeatAt'],
    _newerIso(existing?['lastHeartbeatAt'], existing?['_socketPresenceAt']),
  );
  final heartbeatAt = parseTs(lastHeartbeatAt);
  final clock = now ?? DateTime.now();
  final presenceStale = heartbeatAt == null
      ? apiTech['presenceStale'] == true
      : clock.difference(heartbeatAt).inMilliseconds >= locationStaleMs;

  final base = Map<String, dynamic>.from(apiTech)
    ..['_id'] = id
    ..['lastLocationAt'] = apiTech['lastLocationAt']
    ..['lastHeartbeatAt'] = lastHeartbeatAt
    ..['locationStale'] = apiTech['locationStale']
    ..['presenceStale'] = presenceStale;

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
    'lastHeartbeatAt': lastHeartbeatAt,
    'locationStale': existing['locationStale'] ?? apiTech['locationStale'],
    'presenceStale': presenceStale,
    '_socketPresenceAt': existing['_socketPresenceAt'],
  };
}

dynamic _newerIso(dynamic a, dynamic b) {
  final at = parseTs(a);
  final bt = parseTs(b);
  if (at == null) return b;
  if (bt == null) return a;
  return !at.isBefore(bt) ? a : b;
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
    'lastHeartbeatAt': data['lastHeartbeatAt'] ?? DateTime.now().toUtc().toIso8601String(),
    'locationStale': data['locationStale'] == true,
    'presenceStale': data['presenceStale'] == true,
    '_socketPresenceAt': DateTime.now().toUtc().toIso8601String(),
  };
}
