import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/config/app_config.dart';
import '../../core/socket/admin_socket_service.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import 'live_map_utils.dart';

class LiveMapScreen extends StatefulWidget {
  const LiveMapScreen({super.key});

  @override
  State<LiveMapScreen> createState() => _LiveMapScreenState();
}

class _LiveMapScreenState extends State<LiveMapScreen> {
  static const _qatarCenter = LatLng(25.276987, 51.520008);
  static const _pollInterval = Duration(seconds: 8);

  final Map<String, Map<String, dynamic>> _techById = {};
  GoogleMapController? _mapController;
  BitmapDescriptor? _markerIcon;
  String _filter = 'all';
  String _search = '';
  String? _error;
  bool _loading = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadMarkerIcon();
    _pollRest();
    _pollTimer = Timer.periodic(_pollInterval, (_) => _pollRest());
    AdminSocketService.instance.joinLiveMap();
    AdminSocketService.instance.onLiveMapBatch = _onBatch;
    AdminSocketService.instance.onLiveMapUpdate = _onUpdate;
    AdminSocketService.instance.onLiveMapStale = _onStale;
    AdminSocketService.instance.onLiveMapOnline = _onOnline;
    AdminSocketService.instance.onLiveMapOffline = _onOffline;
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    AdminSocketService.instance.leaveLiveMap();
    AdminSocketService.instance.onLiveMapBatch = null;
    AdminSocketService.instance.onLiveMapUpdate = null;
    AdminSocketService.instance.onLiveMapStale = null;
    AdminSocketService.instance.onLiveMapOnline = null;
    AdminSocketService.instance.onLiveMapOffline = null;
    _mapController?.dispose();
    super.dispose();
  }

  Future<void> _loadMarkerIcon() async {
    try {
      _markerIcon = await BitmapDescriptor.asset(
        const ImageConfiguration(size: Size(48, 48)),
        'assets/icons/map_icon.png',
      );
    } catch (_) {
      _markerIcon = BitmapDescriptor.defaultMarker;
    }
    if (mounted) setState(() {});
  }

  Future<void> _pollRest() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.techniciansLiveMap);
      if (res.statusCode == 200 && res.data is Map) {
        final list = (res.data as Map)['technicians'] as List? ?? [];
        final apiIds = <String>{};
        for (final raw in list) {
          if (raw is! Map) continue;
          final tech = Map<String, dynamic>.from(raw);
          final id = tech['_id']?.toString() ?? tech['id']?.toString() ?? '';
          if (id.isEmpty) continue;
          apiIds.add(id);
          _techById[id] = mergeApiTechnicianWithSocketState(
            tech,
            _techById[id],
          );
        }
        // Preserve socket-only ghosts ≤2 poll windows
        final preserved = _techById.entries.where((e) {
          return isSocketOnlyPreserved(e.value, apiIds);
        }).map((e) => e.key).toList();
        _techById.removeWhere((id, _) => !apiIds.contains(id) && !preserved.contains(id));

        setState(() {
          _loading = false;
          _error = null;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Failed to load map';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load map';
        _loading = false;
      });
    }
  }

  void _patchTech(String id, Map<String, dynamic> patch) {
    final existing = _techById[id] ?? {'_id': id};
    _techById[id] = {...existing, ...patch, '_id': id};
    setState(() {});
  }

  void _onBatch(dynamic raw) {
    if (raw is! List) return;
    for (final item in raw) {
      if (item is! Map) continue;
      final data = Map<String, dynamic>.from(item);
      final id = data['technician_id']?.toString() ?? data['_id']?.toString() ?? '';
      if (id.isEmpty) continue;
      _patchTech(id, buildLocationPatch(data));
    }
  }

  void _onUpdate(dynamic raw) {
    if (raw is! Map) return;
    final data = Map<String, dynamic>.from(raw);
    final id = data['technician_id']?.toString() ?? data['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    _patchTech(id, buildLocationPatch(data));
  }

  void _onStale(dynamic raw) {
    if (raw is! Map) return;
    final id = raw['technician_id']?.toString() ?? raw['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    _patchTech(id, {'locationStale': true});
  }

  void _onOnline(dynamic raw) {
    if (raw is! Map) return;
    final id = raw['technician_id']?.toString() ?? raw['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    _patchTech(id, {'currentStatus': 'Online'});
  }

  void _onOffline(dynamic raw) {
    if (raw is! Map) return;
    final id = raw['technician_id']?.toString() ?? raw['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    _patchTech(id, {'currentStatus': 'Offline'});
  }

  List<Map<String, dynamic>> get _visibleTechs {
    var list = _techById.values.where(hasUsableLocation).toList();
    if (_filter == 'online') {
      list = list.where((t) => t['currentStatus'] == 'Online').toList();
    } else if (_filter == 'on_job') {
      list = list.where((t) => t['currentStatus'] == 'On Job').toList();
    }
    if (_search.isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where((t) {
        final name = '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.toLowerCase();
        return name.contains(q);
      }).toList();
    }
    return list;
  }

  Set<Marker> _buildMarkers() {
    final icon = _markerIcon ?? BitmapDescriptor.defaultMarker;
    return _visibleTechs.map((tech) {
      final id = tech['_id']?.toString() ?? '';
      final loc = tech['location'] as Map;
      final lat = (loc['latitude'] as num).toDouble();
      final lng = (loc['longitude'] as num).toDouble();
      final name = '${tech['firstName'] ?? ''} ${tech['lastName'] ?? ''}'.trim();
      final stale = isTechLocationStale(tech);
      final vehicle = tech['vehicle'];
      var vehicleLabel = '';
      if (vehicle is Map) {
        vehicleLabel = vehicle['plateNumber']?.toString() ?? '';
      }
      return Marker(
        markerId: MarkerId(id),
        position: LatLng(lat, lng),
        icon: icon,
        infoWindow: InfoWindow(
          title: stale ? '$name (!)' : name,
          snippet: [
            tech['currentStatus']?.toString(),
            formatLastSeen(tech),
            if (vehicleLabel.isNotEmpty) vehicleLabel,
          ].where((s) => s != null && s.toString().isNotEmpty).join(' · '),
        ),
        onTap: () {},
      );
    }).toSet();
  }

  @override
  Widget build(BuildContext context) {
    if (AppConfig.googleMapsApiKey.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Live map requires GOOGLE_MAPS_API_KEY.\nRun scripts/read-maps-key.ps1 or pass --dart-define.',
            textAlign: TextAlign.center,
            style: AdminTypography.body.copyWith(color: AppColors.muted),
          ),
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(
                decoration: const InputDecoration(
                  hintText: 'Search technicians',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => _search = v.trim()),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _FilterTab(
                    label: 'All',
                    active: _filter == 'all',
                    onTap: () => setState(() => _filter = 'all'),
                  ),
                  _FilterTab(
                    label: 'Online',
                    active: _filter == 'online',
                    onTap: () => setState(() => _filter = 'online'),
                  ),
                  _FilterTab(
                    label: 'On Job',
                    active: _filter == 'on_job',
                    onTap: () => setState(() => _filter = 'on_job'),
                  ),
                  const Spacer(),
                  Text(
                    '${_visibleTechs.where((t) => isTechLocationStale(t)).length} stale',
                    style: AdminTypography.caption.copyWith(color: AppColors.warning),
                  ),
                ],
              ),
            ],
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(_error!, style: AdminTypography.caption.copyWith(color: AppColors.danger)),
          ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : GoogleMap(
                  initialCameraPosition: const CameraPosition(
                    target: _qatarCenter,
                    zoom: 11,
                  ),
                  markers: _buildMarkers(),
                  onMapCreated: (c) => _mapController = c,
                  myLocationButtonEnabled: false,
                ),
        ),
      ],
    );
  }
}

class _FilterTab extends StatelessWidget {
  const _FilterTab({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: active,
        onSelected: (_) => onTap(),
      ),
    );
  }
}
