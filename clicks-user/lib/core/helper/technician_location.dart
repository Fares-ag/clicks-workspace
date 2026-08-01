/// Parse technician coordinates from API/socket payloads.
class TechnicianLocation {
  TechnicianLocation._();

  static (double?, double?) latLngFrom(dynamic tech) {
    if (tech is! Map) return (null, null);
    final map = Map<String, dynamic>.from(tech);

    final directLat = map['latitude'];
    final directLng = map['longitude'];
    if (directLat != null && directLng != null) {
      final lat = (directLat as num).toDouble();
      final lng = (directLng as num).toDouble();
      if (lat != 0 || lng != 0) return (lat, lng);
    }

    final coords = map['currentLocation']?['coordinates'];
    if (coords is List && coords.length >= 2) {
      final lng = (coords[0] as num).toDouble();
      final lat = (coords[1] as num).toDouble();
      if (lat != 0 || lng != 0) return (lat, lng);
    }

    return (null, null);
  }
}
