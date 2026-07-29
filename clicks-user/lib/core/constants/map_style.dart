/// Map style JSON matching the admin dashboard live-map style.
/// Muted landscape, hidden POIs, white roads with grey strokes,
/// orange highways — same as clicks-interface LiveMap.
const String kMapStyle = '''
[
  {
    "featureType": "landscape",
    "elementType": "geometry.fill",
    "stylers": [{"color": "#e0e0e0"}]
  },
  {
    "featureType": "poi.attraction",
    "stylers": [{"visibility": "off"}]
  },
  {
    "featureType": "poi.business",
    "stylers": [{"visibility": "off"}]
  },
  {
    "featureType": "poi.sports_complex",
    "stylers": [{"visibility": "off"}]
  },
  {
    "featureType": "road",
    "elementType": "geometry.fill",
    "stylers": [{"color": "#ffffff"}]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [{"color": "#808080"}]
  },
  {
    "featureType": "road",
    "elementType": "labels.text",
    "stylers": [{"visibility": "on"}]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.fill",
    "stylers": [{"color": "#ff9800"}]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [{"color": "#e65100"}]
  },
  {
    "featureType": "transit",
    "stylers": [{"visibility": "off"}]
  }
]
''';
