import 'dart:ui' as ui;

import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/constants/map_style.dart';
import 'package:clicks_technician/core/helper/maps_api_key.dart';
import 'package:clicks_technician/core/helper/maps_launcher.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Uber-style live map for Active Job — tech + customer markers, route, fit bounds.
class LiveJobMap extends StatefulWidget {
  const LiveJobMap({
    super.key,
    required this.jobId,
    required this.locationLabel,
    this.techLat,
    this.techLng,
    this.bottomPadding = 220,
  });

  final String? jobId;
  final String locationLabel;
  final double? techLat;
  final double? techLng;

  /// Logical pixels reserved for the bottom job sheet (camera padding).
  final double bottomPadding;

  @override
  State<LiveJobMap> createState() => _LiveJobMapState();
}

class _LiveJobMapState extends State<LiveJobMap> {
  static const _qatarCenter = LatLng(25.276987, 51.520008);
  static final Map<String, LatLng> _geocodeCache = {};

  GoogleMapController? _controller;
  BitmapDescriptor? _vanIcon;
  LatLng? _destination;
  LatLng? _localTechPos;
  List<LatLng> _routePoints = [];
  bool _fetchingRoute = false;
  bool _geocoding = false;
  bool _mapReady = false;
  String? _error;
  String _mapsKey = '';

  bool get _hasKey => _mapsKey.trim().isNotEmpty;

  LatLng? get _techPos {
    if (_localTechPos != null) return _localTechPos;
    if (widget.techLat != null && widget.techLng != null) {
      return LatLng(widget.techLat!, widget.techLng!);
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _mapsKey = await MapsApiKey.resolve();
    if (!mounted) return;
    await Future.wait([
      _loadVanIcon(),
      _geocodeDestination(),
      _ensureLocalGps(),
    ]);
  }

  @override
  void didUpdateWidget(covariant LiveJobMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.locationLabel != widget.locationLabel ||
        oldWidget.jobId != widget.jobId) {
      _geocodeDestination();
    }
    // Prefer fresh cubit GPS when local not yet ready.
    if (_localTechPos == null &&
        widget.techLat != null &&
        widget.techLng != null &&
        (oldWidget.techLat != widget.techLat ||
            oldWidget.techLng != widget.techLng)) {
      setState(() {
        _localTechPos = LatLng(widget.techLat!, widget.techLng!);
      });
      if (_destination != null) {
        _fetchRoute(_localTechPos!);
      }
      _fitBounds();
    } else if (oldWidget.techLat != widget.techLat ||
        oldWidget.techLng != widget.techLng) {
      // Keep tech marker moving with cubit updates.
      if (widget.techLat != null && widget.techLng != null) {
        setState(() {
          _localTechPos = LatLng(widget.techLat!, widget.techLng!);
        });
        // Refresh driving route occasionally as tech moves.
        if (_destination != null && !_fetchingRoute) {
          _fetchRoute(_localTechPos!);
        }
      }
    }
    if (oldWidget.bottomPadding != widget.bottomPadding) {
      _fitBounds();
    }
  }

  @override
  void dispose() {
    // Web: disposing before buildView() throws in google_maps_flutter_web.
    if (_mapReady) {
      _controller?.dispose();
    }
    _controller = null;
    super.dispose();
  }

  Future<void> _ensureLocalGps() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        if (mounted && _techPos == null) {
          setState(() => _error = 'Enable location to see yourself on the map');
        }
        return;
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings:
            const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      setState(() {
        _localTechPos = LatLng(position.latitude, position.longitude);
        _error = null;
      });
      if (_destination != null) {
        await _fetchRoute(_localTechPos!);
      }
      await _fitBounds();
    } catch (_) {
      if (mounted && _techPos == null) {
        setState(() => _error = 'Could not get your GPS position');
      }
    }
  }

  Future<void> _loadVanIcon() async {
    try {
      final data = await rootBundle.load('assets/images/map_icon.png');
      final bytes = data.buffer.asUint8List();
      final codec = await ui.instantiateImageCodec(
        bytes,
        targetWidth: 120,
        targetHeight: 120,
      );
      final frame = await codec.getNextFrame();
      final resized =
          await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (resized != null && mounted) {
        setState(() {
          _vanIcon = BitmapDescriptor.bytes(resized.buffer.asUint8List());
        });
      }
    } catch (_) {}
  }

  static LatLng? _tryParseLatLng(String raw) {
    final m = RegExp(
      r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$',
    ).firstMatch(raw.trim());
    if (m == null) return null;
    final lat = double.tryParse(m.group(1)!);
    final lng = double.tryParse(m.group(2)!);
    if (lat == null || lng == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return LatLng(lat, lng);
  }

  Future<void> _applyDestination(LatLng dest) async {
    final cacheKey = widget.jobId ?? widget.locationLabel;
    _geocodeCache[cacheKey] = dest;
    if (!mounted) return;
    setState(() {
      _destination = dest;
      _error = null;
    });
    final tech = _techPos;
    if (tech != null) await _fetchRoute(tech);
    await _fitBounds();
  }

  Future<void> _geocodeDestination() async {
    final label = widget.locationLabel.trim();
    if (label.isEmpty || label == 'Location not provided') {
      if (mounted) {
        setState(() => _error = 'Customer location missing on this job');
      }
      return;
    }

    final cacheKey = widget.jobId ?? label;
    final cached = _geocodeCache[cacheKey];
    if (cached != null) {
      await _applyDestination(cached);
      return;
    }

    final parsed = _tryParseLatLng(label);
    if (parsed != null) {
      await _applyDestination(parsed);
      return;
    }

    if (_geocoding) return;
    _geocoding = true;
    try {
      final res = await DioHelper.getData(
        url: EndPoints.mapsGeocode,
        query: {
          'address': label,
          'region': 'qa',
        },
      );
      final data = res.data;
      final results = data is Map ? data['results'] : null;
      if (results is List && results.isNotEmpty) {
        final loc = results.first['geometry']?['location'];
        if (loc is Map) {
          final lat = (loc['lat'] as num?)?.toDouble();
          final lng = (loc['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) {
            await _applyDestination(LatLng(lat, lng));
            return;
          }
        }
      }
      if (mounted) setState(() => _error = 'Could not locate customer');
    } catch (_) {
      if (mounted) setState(() => _error = 'Map geocode failed');
    } finally {
      _geocoding = false;
    }
  }

  void _setStraightRoute(LatLng techPos, LatLng dest) {
    if (!mounted) return;
    setState(() {
      _routePoints = [techPos, dest];
    });
  }

  Future<void> _fetchRoute(LatLng techPos, {bool force = false}) async {
    final dest = _destination;
    if (dest == null) return;
    if (_fetchingRoute && !force) return;

    // Always show a connector immediately so En Route never looks empty
    // while Directions is in flight (or if the dart-define key is missing).
    if (_routePoints.length < 2) {
      _setStraightRoute(techPos, dest);
    }

    _fetchingRoute = true;
    try {
      final res = await DioHelper.getData(
        url: EndPoints.mapsDirections,
        query: {
          'origin': '${techPos.latitude},${techPos.longitude}',
          'destination': '${dest.latitude},${dest.longitude}',
          'mode': 'driving',
        },
      );
      if (res.statusCode == 404 || res.statusCode == 503) {
        await _fetchRouteDirect(techPos, dest);
        return;
      }
      final data = res.data;
      final status = (data is Map ? data['status'] : null)?.toString() ?? '';
      final routes = data is Map ? data['routes'] : null;
      if (status == 'OK' && routes is List && routes.isNotEmpty) {
        final encoded =
            routes.first['overview_polyline']?['points']?.toString() ?? '';
        if (encoded.isNotEmpty) {
          final decoded = PolylinePoints().decodePolyline(encoded);
          if (decoded.isNotEmpty && mounted) {
            setState(() {
              _routePoints = decoded
                  .map((p) => LatLng(p.latitude, p.longitude))
                  .toList();
            });
            await _fitBounds();
            return;
          }
        }
      }
      // Directions denied / zero results → keep straight connector.
      _setStraightRoute(techPos, dest);
      await _fitBounds();
    } catch (_) {
      await _fetchRouteDirect(techPos, dest);
      if (_routePoints.length < 2) {
        _setStraightRoute(techPos, dest);
      }
      await _fitBounds();
    } finally {
      _fetchingRoute = false;
    }
  }

  /// Fallback when the server maps proxy is missing (e.g. prod not deployed yet).
  Future<void> _fetchRouteDirect(LatLng techPos, LatLng dest) async {
    if (_mapsKey.isEmpty) return;
    try {
      final result = await PolylinePoints().getRouteBetweenCoordinates(
        googleApiKey: _mapsKey,
        request: PolylineRequest(
          origin: PointLatLng(techPos.latitude, techPos.longitude),
          destination: PointLatLng(dest.latitude, dest.longitude),
          mode: TravelMode.driving,
        ),
      );
      if (result.points.isNotEmpty && mounted) {
        setState(() {
          _routePoints = result.points
              .map((p) => LatLng(p.latitude, p.longitude))
              .toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _fitBounds() async {
    final c = _controller;
    if (c == null) return;
    final tech = _techPos;
    final dest = _destination;
    final padTop = 80.0;
    final padBottom = widget.bottomPadding + 24;
    final padSide = 48.0;

    if (tech != null && dest != null) {
      final sw = LatLng(
        tech.latitude < dest.latitude ? tech.latitude : dest.latitude,
        tech.longitude < dest.longitude ? tech.longitude : dest.longitude,
      );
      final ne = LatLng(
        tech.latitude > dest.latitude ? tech.latitude : dest.latitude,
        tech.longitude > dest.longitude ? tech.longitude : dest.longitude,
      );
      // Identical points → zoom on that spot.
      if ((sw.latitude - ne.latitude).abs() < 0.00005 &&
          (sw.longitude - ne.longitude).abs() < 0.00005) {
        await c.animateCamera(CameraUpdate.newLatLngZoom(tech, 15));
        return;
      }
      try {
        await c.animateCamera(
          CameraUpdate.newLatLngBounds(
            LatLngBounds(southwest: sw, northeast: ne),
            0,
          ),
        );
        // Apply asymmetric padding so markers sit above the bottom sheet.
        await c.animateCamera(
          CameraUpdate.newLatLngBounds(
            LatLngBounds(southwest: sw, northeast: ne),
            padSide,
          ),
        );
        // Extra nudge: move camera center slightly up via scroll.
        await c.animateCamera(
          CameraUpdate.scrollBy(0, -(padBottom - padTop) / 4),
        );
      } catch (_) {
        await c.animateCamera(CameraUpdate.newLatLngZoom(tech, 13));
      }
    } else if (tech != null) {
      await c.animateCamera(CameraUpdate.newLatLngZoom(tech, 15));
    } else if (dest != null) {
      await c.animateCamera(CameraUpdate.newLatLngZoom(dest, 15));
    }
  }

  Set<Marker> get _markers {
    final markers = <Marker>{};
    final dest = _destination;
    if (dest != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('destination'),
          position: dest,
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
          infoWindow: const InfoWindow(title: 'Customer'),
          zIndexInt: 1,
        ),
      );
    }
    final tech = _techPos;
    if (tech != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('technician'),
          position: tech,
          icon: _vanIcon ??
              BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          anchor: const Offset(0.5, 0.5),
          infoWindow: const InfoWindow(title: 'You'),
          zIndexInt: 2,
        ),
      );
    }
    return markers;
  }

  Set<Polyline> get _polylines {
    if (_routePoints.length < 2) return {};
    // Outline + brand stroke so the route stays visible on light road tiles.
    return {
      Polyline(
        polylineId: const PolylineId('route_outline'),
        points: _routePoints,
        color: Colors.white,
        width: 10,
        geodesic: true,
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
        jointType: JointType.round,
        zIndex: 0,
      ),
      Polyline(
        polylineId: const PolylineId('route'),
        points: _routePoints,
        color: const Color(0xFFC01048),
        width: 6,
        geodesic: true,
        startCap: Cap.roundCap,
        endCap: Cap.roundCap,
        jointType: JointType.round,
        zIndex: 1,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasKey) {
      return _FallbackMap(
        location: widget.locationLabel,
        message: 'Maps key missing — rebuild with GOOGLE_MAPS_API_KEY',
      );
    }

    final initial = _techPos ?? _destination ?? _qatarCenter;
    final bottomPad = widget.bottomPadding;

    return Stack(
      fit: StackFit.expand,
      children: [
        GoogleMap(
          key: ValueKey('live_map_${widget.jobId ?? widget.locationLabel}'),
          initialCameraPosition: CameraPosition(target: initial, zoom: 14),
          markers: _markers,
          polylines: _polylines,
          myLocationEnabled: true,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          compassEnabled: false,
          padding: EdgeInsets.only(bottom: bottomPad, top: 72),
          style: kMapStyle,
          onMapCreated: (controller) async {
            _controller = controller;
            if (mounted) setState(() => _mapReady = true);
            // Re-apply route after the platform map is ready (polylines can
            // be dropped if set before the native view exists).
            final tech = _techPos;
            if (tech != null && _destination != null) {
              await _fetchRoute(tech, force: true);
            }
            await Future<void>.delayed(const Duration(milliseconds: 300));
            await _fitBounds();
          },
        ),
        if (!_mapReady)
          const ColoredBox(
            color: Color(0xFFE8EEF2),
            child: Center(child: CircularProgressIndicator()),
          ),
        Positioned(
          right: 12.w,
          bottom: bottomPad + 12,
          child: Column(
            children: [
              _MapFab(
                icon: Icons.alt_route_rounded,
                onTap: () => openJobLocationInMaps(widget.locationLabel),
              ),
              SizedBox(height: 10.h),
              _MapFab(
                icon: Icons.my_location_rounded,
                onTap: () async {
                  await _ensureLocalGps();
                  await _fitBounds();
                },
              ),
            ],
          ),
        ),
        if (_error != null)
          Positioned(
            top: 100.h,
            left: 24.w,
            right: 24.w,
            child: Material(
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(10.r),
              elevation: 2,
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyles.font12RegularGrey,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MapFab extends StatelessWidget {
  const _MapFab({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(12.w),
          child: Icon(icon, color: ColorsManager.mainColor, size: 22.sp),
        ),
      ),
    );
  }
}

class _FallbackMap extends StatelessWidget {
  const _FallbackMap({required this.location, required this.message});
  final String location;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFD6E4EC),
      child: Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 40.w),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.map_outlined,
                  size: 56.sp, color: ColorsManager.mainColor),
              SizedBox(height: 8.h),
              Text(
                location,
                textAlign: TextAlign.center,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyles.font14RegularGrey.copyWith(
                  color: const Color(0xFF344054),
                  fontWeight: FontWeight.w500,
                ),
              ),
              SizedBox(height: 8.h),
              Text(message, style: TextStyles.font12RegularGrey),
            ],
          ),
        ),
      ),
    );
  }
}
