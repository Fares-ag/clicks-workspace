import '../../core/config/public_config.dart';
import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/constants/map_style.dart';
import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/helper/google_maps_loader.dart';
import 'package:clicks_user/core/helper/technician_location.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/services/session_sync.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/event_scope.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_polyline_points/flutter_polyline_points.dart';
import 'package:clicks_user/core/config/app_config.dart';
import 'package:easy_localization/easy_localization.dart';

import 'finding_technician_screen.dart';
import 'job_in_progress_screen.dart';
import 'job_cancel_api.dart';
import '../settings/ui/cubit/settings_cubit.dart';
import '../my_cars/cubit/my_cars_cubit.dart';
import 'rating_bottom_sheet.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

/// Arguments passed when navigating to [TechnicianTrackingScreen].
class TrackingArgs {
  final String jobId;
  final Map<String, dynamic> techInfo; // name, phone, photo, rating
  /// The job's own coordinates. Null when unknown — the ETA is then hidden
  /// rather than computed to a made-up central-Doha point (scenario 61).
  final double? customerLat;
  final double? customerLng;
  final String initialPhase; // 'assigned' | 'en_route' | 'arrived' | 'on_hold'
  final double? techLat;  // initial technician latitude
  final double? techLng;  // initial technician longitude
  /// Server cancel policy (`kind`: free | fee | contact_support | none).
  final Map<String, dynamic>? cancelPolicy;

  const TrackingArgs({
    required this.jobId,
    required this.techInfo,
    this.customerLat,
    this.customerLng,
    this.initialPhase = 'en_route',
    this.techLat,
    this.techLng,
    this.cancelPolicy,
  });
}

class TechnicianTrackingScreen extends StatefulWidget {
  final TrackingArgs args;
  const TechnicianTrackingScreen({super.key, required this.args});

  @override
  State<TechnicianTrackingScreen> createState() =>
      _TechnicianTrackingScreenState();
}

class _TechnicianTrackingScreenState extends State<TechnicianTrackingScreen>
    with TickerProviderStateMixin {
  GoogleMapController? _mapController;
  final DraggableScrollableController _sheetController =
      DraggableScrollableController();

  // Technician's live location
  LatLng? _techLocation;
  double _techHeading = 0;
  // Current phase: en_route → arrived → in_progress → completed
  late String _phase;
  Set<Marker> _markers = {};
  Set<Polyline> _polylines = {};

  // Custom van icon
  BitmapDescriptor? _vanIcon;

  // Animation for smooth marker movement
  AnimationController? _animController;
  Animation<double>? _animation;
  LatLng? _animStartPos;
  LatLng? _animEndPos;
  double _animStartHeading = 0;
  double _animEndHeading = 0;

  // Timer-based animation updates (~10fps instead of 60fps)
  Timer? _animUpdateTimer;

  // --- Location update throttling (20-second intervals) ---
  DateTime _lastLocationProcessedAt = DateTime(2000);
  static const _locationUpdateInterval = Duration(seconds: 5);
  Timer? _pendingLocationTimer;
  LatLng? _pendingTechLocation;
  double _pendingTechHeading = 0;

  // --- Route polyline from Directions API ---
  List<LatLng> _routePoints = [];
  bool _fetchingRoute = false;

  late Map<String, dynamic> _techInfo;
  Timer? _locationPollTimer;
  Timer? _staleTicker;
  int _pollTick = 0;
  bool _cancelling = false;
  bool _leaving = false;

  /// The customer's point: the job's coordinates (args, or loaded from the
  /// job). Null → no customer pin, no route line, no ETA (scenario 61).
  double? _custLat;
  double? _custLng;
  bool get _hasCustomerPoint => _custLat != null && _custLng != null;

  /// Server cancel policy for this job (scenario 63); null until known.
  Map<String, dynamic>? _cancelPolicy;

  /// Dispatch hold reason while the job is paused (scenario 49).
  String? _holdReason;

  /// When the technician's position was last reported (scenario 59).
  DateTime? _lastTechFixAt;
  late final DateTime _openedAt = DateTime.now();
  static const _staleAfter = Duration(seconds: 60);

  late final EventScope _scope = EventScope(jobId: widget.args.jobId);
  StreamSubscription<Map<String, dynamic>>? _syncSub;

  bool get _locationStale {
    final last = _lastTechFixAt ?? _openedAt;
    return DateTime.now().difference(last) > _staleAfter;
  }

  int get _staleMinutes {
    final last = _lastTechFixAt;
    if (last == null) return 0;
    return DateTime.now().difference(last).inMinutes;
  }

  String? get _policyKind => _cancelPolicy?['kind']?.toString();

  bool get _canCancelJob {
    final kind = _policyKind;
    if (kind != null) return kind == 'free' || kind == 'fee';
    return _phase == 'en_route' || _phase == 'arrived' || _phase == 'assigned';
  }

  bool get _cancelHasFee {
    final kind = _policyKind;
    if (kind != null) return kind == 'fee';
    return _phase == 'en_route' || _phase == 'arrived';
  }

  String get _cancelNote {
    if (!_cancelHasFee) return 'realtime.cancel_free_note'.tr();
    final amount = _cancelPolicy?['fee_amount'];
    if (amount is num && amount > 0) {
      return 'realtime.cancel_fee_amount'
          .tr(namedArgs: {'amount': amount.toStringAsFixed(2)});
    }
    return 'home.cancel_fee_note'.tr();
  }

  Future<void> _cancelJob() async {
    if (_cancelling || !_canCancelJob) return;
    final feeNote = '\n$_cancelNote';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('home.cancel_job'.tr()),
        content: Text('${'home.cancel_job_confirm'.tr()}$feeNote'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('common.cancel'.tr()),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('home.cancel_job'.tr()),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _cancelling = true);
    try {
      await JobCancelApi.cancelCustomer(
        jobId: widget.args.jobId,
        reason: 'changed_mind',
      );
      if (!mounted) return;
      AppSnackBars.successSnackBar('home.job_cancelled'.tr());
      context.offAllNamed(Routes.home);
    } catch (e) {
      if (!mounted) return;
      AppSnackBars.errorSnackBar(e.toString().replaceFirst('Exception: ', ''));
      setState(() => _cancelling = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _phase = widget.args.initialPhase == 'accepted'
        ? 'assigned'
        : widget.args.initialPhase;
    _custLat = widget.args.customerLat;
    _custLng = widget.args.customerLng;
    _cancelPolicy = widget.args.cancelPolicy;
    _techInfo = Map<String, dynamic>.from(widget.args.techInfo);
    ActiveSessionScreen.enter(
      Routes.technicianTracking,
      widget.args.jobId,
      () => mounted && (ModalRoute.of(context)?.isCurrent ?? true),
    );
    // A resync (reconnect / resume) that finds this same job refreshes it.
    _syncSub = SessionSync.instance.updates.listen((_) {
      if (mounted) _refreshTechnicianFromServer();
    });
    _staleTicker = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() {});
    });
    // Set initial technician location from args (sent with enroute event)
    final (techLat, techLng) = TechnicianLocation.latLngFrom(widget.args.techInfo);
    if (techLat != null &&
        techLng != null &&
        widget.args.techLat == null &&
        widget.args.techLng == null) {
      _techLocation = LatLng(techLat, techLng);
    } else if (widget.args.techLat != null &&
        widget.args.techLng != null &&
        (widget.args.techLat != 0 || widget.args.techLng != 0)) {
      _techLocation = LatLng(widget.args.techLat!, widget.args.techLng!);
    }
    _loadVanIcon();
    _updateMarkers();
    // Fetch real driving route on init if en_route with known tech position
    if (_phase == 'en_route' && _techLocation != null) {
      _fetchRoute(_techLocation!);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<SosCubit>().socketService.ensureConnected();
      _refreshTechnicianFromServer();
    });
    // Poll this job (not "the" active job — two cars, scenario 62): position
    // every 5 s while en route, and job_status in every phase so a missed
    // socket event cannot leave the screen behind (scenario 58).
    _locationPollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) {
        if (!mounted) return;
        _pollTick++;
        if (_phase == 'en_route' || _pollTick % 3 == 0) {
          _refreshTechnicianFromServer();
        }
      },
    );
  }

  Future<void> _refreshTechnicianFromServer() async {
    try {
      final data = await SessionService.getJob(widget.args.jobId);
      final job = data?['job'];
      if (job is! Map || !mounted || _leaving) return;

      final policy = data?['cancel_policy'];
      if (policy is Map) _cancelPolicy = Map<String, dynamic>.from(policy);

      if (!_hasCustomerPoint) {
        final point = SessionResume.customerLatLng(job, context);
        if (point != null) {
          _custLat = point.$1;
          _custLng = point.$2;
        }
      }

      if (_applyServerStatus(Map<String, dynamic>.from(job))) return;

      final tech = job['assignedTechnician'];
      if (tech is! Map) {
        setState(() {});
        return;
      }

      final first = tech['firstName']?.toString() ?? '';
      final last = tech['lastName']?.toString() ?? '';
      final (lat, lng) = TechnicianLocation.latLngFrom(tech);
      final reportedAt = DateTime.tryParse(tech['lastLocationAt']?.toString() ?? '');
      if (reportedAt != null) {
        final local = reportedAt.toLocal();
        if (_lastTechFixAt == null || local.isAfter(_lastTechFixAt!)) {
          _lastTechFixAt = local;
        }
      }

      setState(() {
        _techInfo = {
          'name': '$first $last'.trim(),
          'phone': tech['phone']?.toString() ?? '',
          'photo': tech['profilePicture']?.toString() ?? '',
          'rating': _techInfo['rating'],
          if (lat != null) 'latitude': lat,
          if (lng != null) 'longitude': lng,
        };
      });

      if (lat != null && lng != null) {
        _applyTechnicianLocation(LatLng(lat, lng), fromPoll: true);
      }
    } catch (e) {
      _log('⚠️ refresh tech location: $e');
    }
  }

  /// Follow the job's server status. Returns true when the screen is leaving.
  bool _applyServerStatus(Map<String, dynamic> job) {
    final status = job['job_status']?.toString() ?? '';
    switch (status) {
      case 'assigned':
      case 'accepted':
      case 'en_route':
      case 'arrived':
        final next = SessionResume.trackingInitialPhase(
          status,
          SessionResume.resolveGaragePhase(job),
        );
        if (_phase != next) {
          setState(() {
            _phase = next;
            _holdReason = null;
          });
          _updateMarkers();
        }
        return false;
      case 'on_hold':
        setState(() {
          _phase = 'on_hold';
          _holdReason = job['hold_reason']?.toString();
        });
        return false;
      case 'pending':
        _openFindingTechnician(job['job_reference']?.toString() ?? '');
        return true;
      case 'cancelled':
        _leaveForHome('job_progress.job_cancelled'.tr());
        return true;
      case 'in_progress':
      case 'completed':
        _leaving = true;
        // In progress / completed (paid or not): the session routes it.
        SessionSync.instance.resync(reason: 'tracking:$status', force: true);
        Future<void>.delayed(const Duration(seconds: 2), () {
          if (mounted) _leaving = false;
        });
        return true;
    }
    return false;
  }

  void _openFindingTechnician(String jobReference) {
    if (_leaving || !mounted) return;
    _leaving = true;
    context.offNamed(
      Routes.findingTechnician,
      arguments: FindingTechnicianArgs(
        jobId: widget.args.jobId,
        jobReference: jobReference,
      ),
    );
  }

  void _leaveForHome(String message) {
    if (_leaving || !mounted) return;
    _leaving = true;
    AppSnackBars.errorSnackBar(message);
    context.offAllNamed(Routes.home);
  }

  void _applyTechnicianLocation(LatLng newPos, {bool fromPoll = false}) {
    if (_techLocation == null) {
      setState(() => _techLocation = newPos);
      _updateMarkers();
      if (_phase == 'en_route') _fetchRoute(newPos);
      _animateToTech();
      return;
    }

    final moved = Geolocator.distanceBetween(
          _techLocation!.latitude,
          _techLocation!.longitude,
          newPos.latitude,
          newPos.longitude,
        ) >
        25;

    if (!moved) return;

    if (fromPoll) {
      _pendingTechLocation = newPos;
      _processLocationUpdate();
    } else {
      _animateMarkerTo(newPos, _techHeading);
      _fetchRoute(newPos);
    }
  }

  Future<void> _loadVanIcon() async {
    try {
      final data = await rootBundle.load('assets/images/map_icon.png');
      final bytes = data.buffer.asUint8List();
      // Decode and resize the image to a suitable marker size
      final codec = await ui.instantiateImageCodec(
        bytes,
        targetWidth: 48,
        targetHeight: 48,
      );
      final frame = await codec.getNextFrame();
      final resizedBytes = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      if (resizedBytes != null && mounted) {
        setState(() {
          _vanIcon = BitmapDescriptor.bytes(resizedBytes.buffer.asUint8List());
        });
        _updateMarkers();
      }
    } catch (e) {
      _log('⚠️ Van icon load error: $e');
    }
  }

  @override
  void dispose() {
    ActiveSessionScreen.leave(Routes.technicianTracking, widget.args.jobId);
    _syncSub?.cancel();
    _staleTicker?.cancel();
    _animController?.dispose();
    _animUpdateTimer?.cancel();
    _pendingLocationTimer?.cancel();
    _locationPollTimer?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  /// Animate the technician marker from current position to new position.
  /// Uses easeOut curve polled at ~10fps for good visuals with low overhead.
  void _animateMarkerTo(LatLng newPos, double newHeading) {
    _animStartPos = _techLocation ?? newPos;
    _animEndPos = newPos;
    _animStartHeading = _techHeading;
    _animEndHeading = newHeading;

    _animController?.stop();
    _animController?.dispose();
    _animUpdateTimer?.cancel();

    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    );
    _animation = CurvedAnimation(
      parent: _animController!,
      curve: Curves.easeOut,
    );

    // Poll animation value at ~10fps instead of 60fps to reduce map rebuilds
    _animUpdateTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      _onAnimationTick();
    });

    _animController!.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _animUpdateTimer?.cancel();
        _techLocation = newPos;
        _techHeading = newHeading;
        _updateMarkers();
      }
    });

    _animController!.forward();
  }

  /// Called at ~10fps during animation. Interpolates position & heading.
  void _onAnimationTick() {
    if (_animStartPos == null || _animEndPos == null || _animation == null) return;

    final t = _animation!.value;
    final lat = _animStartPos!.latitude +
        (_animEndPos!.latitude - _animStartPos!.latitude) * t;
    final lng = _animStartPos!.longitude +
        (_animEndPos!.longitude - _animStartPos!.longitude) * t;

    // Interpolate heading (handle 360° wrap)
    double dh = _animEndHeading - _animStartHeading;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    final heading = _animStartHeading + dh * t;

    _techLocation = LatLng(lat, lng);
    _techHeading = heading;

    if (mounted) _updateMarkers();
  }

  /// Processes a buffered location update: animates marker and fetches route.
  void _processLocationUpdate() {
    if (_pendingTechLocation == null) return;
    _lastLocationProcessedAt = DateTime.now();

    final newPos = _pendingTechLocation!;
    final newHeading = _pendingTechHeading;
    _pendingTechLocation = null;

    // Small delay before starting animation to let the map settle
    Future.delayed(const Duration(milliseconds: 500), () {
      if (mounted) {
        _animateMarkerTo(newPos, newHeading);
        _fetchRoute(newPos);
      }
    });

    _animateToTech();
  }

  /// Fetches the real driving route from the Google Directions API.
  Future<void> _fetchRoute(LatLng techPos) async {
    if (_fetchingRoute || !_hasCustomerPoint) return;
    _fetchingRoute = true;

    try {
      final polylinePoints = PolylinePoints();
      final result = await polylinePoints.getRouteBetweenCoordinates(
        googleApiKey: AppConfig.googleMapsApiKey,
        request: PolylineRequest(
          origin: PointLatLng(techPos.latitude, techPos.longitude),
          destination: PointLatLng(_custLat!, _custLng!),
          mode: TravelMode.driving,
        ),
      );

      if (result.points.isNotEmpty && mounted) {
        _routePoints = result.points
            .map((p) => LatLng(p.latitude, p.longitude))
            .toList();
        _updateMarkers();
      }
    } catch (e) {
      _log('⚠️ Route fetch error: $e');
    } finally {
      _fetchingRoute = false;
    }
  }

  void _updateMarkers() {
    final markers = <Marker>{};

    // Customer location marker (red pin) — only for a real point.
    if (_hasCustomerPoint) {
      markers.add(
        Marker(
          markerId: const MarkerId('customer'),
          position: LatLng(_custLat!, _custLng!),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
          infoWindow: InfoWindow(title: 'tracking.your_location'.tr()),
        ),
      );
    }

    // Technician location marker (van icon with heading rotation)
    if (_techLocation != null) {
      markers.add(
        Marker(
          markerId: const MarkerId('technician'),
          position: _techLocation!,
          rotation: _techHeading,
          anchor: const Offset(0.5, 0.5),
          flat: true,
          icon: _vanIcon ?? BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
          infoWindow: InfoWindow(
              title: _techInfo['name']?.toString().trim().isNotEmpty == true
                  ? _techInfo['name'].toString()
                  : 'job_progress.technician'.tr()),
        ),
      );

      // Route polyline from tech → customer if en_route
      if (_phase == 'en_route' && _hasCustomerPoint) {
        final routePoints = _routePoints.isNotEmpty
            ? _routePoints
            : [_techLocation!, LatLng(_custLat!, _custLng!)];
        _polylines = {
          Polyline(
            polylineId: const PolylineId('route'),
            points: routePoints,
            color: const Color(0xFF8B1A1B),
            width: 4,
          ),
        };
      } else {
        _polylines = {};
      }
    }

    setState(() => _markers = markers);
  }

  void _animateToTech() {
    if (_techLocation != null && _mapController != null && !_hasCustomerPoint) {
      _mapController!.animateCamera(CameraUpdate.newLatLngZoom(_techLocation!, 14));
      return;
    }
    if (_techLocation != null && _mapController != null) {
      final custLat = _custLat!;
      final custLng = _custLng!;
      _mapController!.animateCamera(
        CameraUpdate.newLatLngBounds(
          LatLngBounds(
            southwest: LatLng(
              _techLocation!.latitude < custLat ? _techLocation!.latitude : custLat,
              _techLocation!.longitude < custLng ? _techLocation!.longitude : custLng,
            ),
            northeast: LatLng(
              _techLocation!.latitude > custLat ? _techLocation!.latitude : custLat,
              _techLocation!.longitude > custLng ? _techLocation!.longitude : custLng,
            ),
          ),
          80,
        ),
      );
    }
  }

  void _callDispatch() async {
    await PublicConfig.callSupport();
  }

  void _callTechnician() async {
    // Read the refreshed technician first: the navigation args are frozen at
    // push time and are empty whenever the assignment event was missed.
    final live = _techInfo['phone']?.toString().trim() ?? '';
    final fromArgs = widget.args.techInfo['phone']?.toString().trim() ?? '';
    final phone = live.isNotEmpty ? live : fromArgs;
    if (phone.isEmpty) {
      AppSnackBars.errorSnackBar('tracking.technician_phone_unavailable'.tr());
      return;
    }
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      AppSnackBars.errorSnackBar('tracking.call_failed'.tr());
    }
  }

  // ---------- Banner text per phase ----------
  String get _bannerText {
    switch (_phase) {
      case 'assigned':
        return 'realtime.assigned_banner'.tr();
      case 'returning':
        return 'home.garage_returning_title'.tr();
      case 'on_hold':
        final reason = _holdReason?.trim() ?? '';
        return reason.isEmpty
            ? 'realtime.on_hold_banner'.tr()
            : 'realtime.on_hold_reason'.tr(namedArgs: {'reason': reason});
      case 'en_route':
        return 'home.sit_tight'.tr();
      case 'arrived':
        return 'tracking.arrived'.tr();
      case 'in_progress':
        return 'home.job_in_progress'.tr();
      default:
        return 'tracking.tracking'.tr();
    }
  }

  String get _statusLabel => JobStatusLabels.labelFor(_phase);

  /// Straight-line ETA at ~40 km/h, labelled approximate. Null — hidden —
  /// without a real customer point (61) or with a stale position (59).
  int? get _etaMinutes {
    if (_techLocation == null || !_hasCustomerPoint || _locationStale) return null;
    final distanceMeters = Geolocator.distanceBetween(
      _techLocation!.latitude,
      _techLocation!.longitude,
      _custLat!,
      _custLng!,
    );
    final distanceKm = distanceMeters / 1000;
    return (distanceKm / 40 * 60).ceil().clamp(1, 999);
  }

  String _monthName(int m) {
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[m];
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:${dt.minute.toString().padLeft(2, '0')} $ampm';
  }

  Widget _buildMap() {
    if (kIsWeb && !isGoogleMapsAvailable) {
      return ColoredBox(
        color: const Color(0xFFE8E8E8),
        child: Center(
          child: Text(
            'Map unavailable',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 16),
          ),
        ),
      );
    }

    return GoogleMap(
      initialCameraPosition: CameraPosition(
        // The job's point, else the technician; only the camera falls back
        // to central Qatar — never the ETA.
        target: _hasCustomerPoint
            ? LatLng(_custLat!, _custLng!)
            : _techLocation ?? const LatLng(25.2854, 51.531),
        zoom: 14,
      ),
      markers: _markers,
      polylines: _polylines,
      myLocationEnabled: false,
      zoomControlsEnabled: false,
      mapToolbarEnabled: false,
      style: kMapStyle,
      onMapCreated: (controller) {
        _mapController = controller;
        Future.delayed(const Duration(milliseconds: 300), () {
          if (mounted) _animateToTech();
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: BlocListener<SosCubit, SosState>(
        // Only this job's events (two live jobs, scenario 62).
        listenWhen: (_, state) => _scope.matchesState(state),
        listener: (context, state) {
          if (_leaving) return;
          if (state is LocationUpdated) {
            _lastTechFixAt = state.at ?? DateTime.now();
            // Buffer location and throttle to 20-second intervals
            _pendingTechLocation = LatLng(state.latitude, state.longitude);
            _pendingTechHeading = state.heading;

            final now = DateTime.now();
            final elapsed = now.difference(_lastLocationProcessedAt);

            if (_techLocation == null || elapsed >= _locationUpdateInterval) {
              // First fix or enough time has passed — process now
              _pendingLocationTimer?.cancel();
              _processLocationUpdate();
            } else {
              // Schedule processing at the next 20s boundary
              _pendingLocationTimer?.cancel();
              final remaining = _locationUpdateInterval - elapsed;
              _pendingLocationTimer = Timer(remaining, () {
                if (_pendingTechLocation != null && mounted) {
                  _processLocationUpdate();
                }
              });
            }
          } else if (state is TechnicianAssigned) {
            // Dispatch reassigned the job (scenario 47): new technician, back
            // to the assigned phase, old pin dropped, details reloaded.
            setState(() {
              _phase = 'assigned';
              _holdReason = null;
              _techLocation = null;
              _routePoints = [];
              _lastTechFixAt = null;
              _techInfo = Map<String, dynamic>.from(state.technicianInfo);
            });
            _updateMarkers();
            _refreshTechnicianFromServer();
            AppSnackBars.successSnackBar('realtime.new_technician'.tr());
          } else if (state is TechnicianAccepted) {
            if (state.technicianInfo.isNotEmpty) {
              setState(() => _techInfo = {..._techInfo, ...state.technicianInfo});
            }
          } else if (state is TechnicianEnRoute) {
            setState(() {
              _phase = 'en_route';
              _holdReason = null;
              if (state.technicianInfo.isNotEmpty) {
                _techInfo = {..._techInfo, ...state.technicianInfo};
              }
            });
            _refreshTechnicianFromServer();
          } else if (state is JobReassigning) {
            // The technician handed the job back (scenario 46).
            AppSnackBars.errorSnackBar('realtime.finding_another'.tr());
            _openFindingTechnician('');
          } else if (state is JobOnHold) {
            setState(() {
              _phase = 'on_hold';
              _holdReason = state.reason;
            });
            _updateMarkers();
          } else if (state is JobResumed) {
            setState(() {
              _phase = SessionResume.trackingInitialPhase(state.jobStatus, null);
              _holdReason = null;
            });
            AppSnackBars.successSnackBar('realtime.resumed'.tr());
            _refreshTechnicianFromServer();
          } else if (state is TechnicianArrived) {
            setState(() => _phase = 'arrived');
            _updateMarkers();
            AppSnackBars.successSnackBar('tracking.arrived'.tr());
          } else if (state is JobStarted) {
            // Navigate to the job in progress screen
            final car = context.read<MyCarsCubit>().selectedCar;

            // Format date/time
            String dateText = '';
            if (state.dateTime != null) {
              try {
                final dt = DateTime.parse(state.dateTime!).toLocal();
                dateText = '${_monthName(dt.month)} ${dt.day}, ${dt.year} - ${_formatTime(dt)}';
              } catch (_) {}
            }
            if (dateText.isEmpty) {
              final now = DateTime.now();
              dateText = '${_monthName(now.month)} ${now.day}, ${now.year} - ${_formatTime(now)}';
            }

            // Format estimate time
            String estimateText = '';
            if (state.estimateTimeMinutes != null && state.estimateTimeMinutes! > 0) {
              final mins = state.estimateTimeMinutes!;
              if (mins >= 60) {
                final h = mins ~/ 60;
                final m = mins % 60;
                estimateText = m > 0 ? '${h}h ${m}min' : '${h}h';
              } else {
                estimateText = '$mins min';
              }
            }

            context.offNamed(
              Routes.jobInProgress,
              arguments: JobProgressArgs(
                userName:
                    context.read<SettingsCubit>().profile?.firstName ?? 'N/A',
                bannerTitle: 'home.job_in_progress'.tr(),
                bannerBody:
                    'job_progress.banner_body'.tr(),
                serviceTitle: state.issue,
                jobId: widget.args.jobId,
                dateText: dateText,
                estimatedTime: estimateText,
                statusPillText: JobStatusLabels.labelFor('in_progress'),
                technicianName: widget.args.techInfo['name'] ?? '',
                technicianPhone: widget.args.techInfo['phone'] ?? '',
                technicianAvatarUrl: widget.args.techInfo['photo'] ?? '',
                vehicleName:
                    '${car?.vehicleMake?.makeName ?? ""} ${car?.year ?? ""} ${car?.vehicleModel?.modelName ?? ""}',
                vehicleCode: car?.plateNumber ?? '',
                onCallDispatch: _callDispatch,
                onCallTechnician: _callTechnician,
              ),
            );
          } else if (state is JobCompleted) {
            if (state.paymentStatus == 'paid') {
              _showRatingSheet(state);
            } else {
              // Unpaid (e.g. completed by dispatch): the session routes it
              // to payment — rating is for paid jobs only (scenario 76).
              SessionSync.instance.resync(reason: 'completed', force: true);
            }
          } else if (state is JobCancelled) {
            _leaveForHome(state.cancelledBy == 'admin'
                ? 'realtime.job_cancelled_by_team'.tr()
                : 'job_progress.job_cancelled'.tr());
          } else if (state is JobAtGarage) {
            AppSnackBars.successSnackBar('home.garage_card_title'.tr());
          } else if (state is JobGarageReady) {
            AppSnackBars.successSnackBar('home.garage_returning_title'.tr());
          }
        },
        child: Stack(
          children: [
            // --------- Map ---------
            _buildMap(),

            // --------- Top banner (extends to screen top) ---------
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                padding:
                    EdgeInsets.only(
                      left: 16,
                      right: 16,
                      bottom: 14,
                      top: MediaQuery.of(context).padding.top + 14,
                    ),
                decoration: const BoxDecoration(
                  color: Color(0xFF8B1A1B),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _bannerText,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (_canCancelJob)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: TextButton(
                          onPressed: _cancelJob,
                          child: Text(
                            _cancelHasFee
                                ? 'home.cancel_job_fee'.tr()
                                : 'home.cancel_job'.tr(),
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                      ),
                    GestureDetector(
                      onTap: () => Navigator.of(context).maybePop(),
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.close,
                            color: Colors.white, size: 16),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // --------- Bottom sheet ---------
            DraggableScrollableSheet(
              initialChildSize: 0.42,
              minChildSize: 0.15,
              maxChildSize: 0.55,
              controller: _sheetController,
              builder: (context, scrollController) {
                return Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(20)),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x22000000),
                        blurRadius: 20,
                        offset: Offset(0, -4),
                      ),
                    ],
                  ),
                  child: ListView(
                    controller: scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      // Handle
                      Center(
                        child: Container(
                          margin: const EdgeInsets.only(top: 10, bottom: 16),
                          width: 40,
                          height: 6,
                          decoration: BoxDecoration(
                            color: const Color(0xFFD0D5DD),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),

                      // Status label with ETA inline
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _statusLabel,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF111827),
                              ),
                            ),
                          ),
                          // ETA pill: en route, real customer point, fresh
                          // position (scenarios 59, 61).
                          if (_phase == 'en_route' && _etaMinutes != null)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFF00A651),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                'realtime.eta_approx'.tr(
                                    namedArgs: {'minutes': '$_etaMinutes'}),
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            )
                          else if (_phase == 'en_route' && _locationStale)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF2F4F7),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                _lastTechFixAt == null
                                    ? 'realtime.location_stale_now'.tr()
                                    : 'realtime.location_stale'.tr(
                                        namedArgs: {'minutes': '${_staleMinutes < 1 ? 1 : _staleMinutes}'}),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF475467),
                                ),
                              ),
                            ),
                        ],
                      ),

                      const SizedBox(height: 8),
                      const Divider(color: Color(0xFFE5E7EB)),
                      const SizedBox(height: 8),

                      // Technician card
                      _TechnicianCard(
                        name: _techInfo['name']?.toString().trim().isNotEmpty == true
                            ? _techInfo['name'].toString()
                            : 'job_progress.technician'.tr(),
                        phone: _techInfo['phone']?.toString() ?? '',
                        photoUrl: _techInfo['photo']?.toString() ?? '',
                        rating: _parseDouble(_techInfo['rating']),
                        onCallTechnician: _callTechnician,
                      ),

                      const SizedBox(height: 12),

                      // Call dispatch row
                      InkWell(
                        onTap: _callDispatch,
                        borderRadius: BorderRadius.circular(22),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: const BoxDecoration(
                                color: Color(0xFFF2F4F7),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.phone,
                                  color: Color(0xFF344054), size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'tracking.call_dispatch_help'.tr(),
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF667085),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      const SizedBox(height: 24),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showRatingSheet(JobCompleted state) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => RatingBottomSheet(
        technicianName: (_techInfo['name'] ?? widget.args.techInfo['name'] ?? '').toString(),
        technicianPhotoUrl: (_techInfo['photo'] ?? widget.args.techInfo['photo'] ?? '').toString(),
        jobId: widget.args.jobId,
        onSubmitted: () {
          Navigator.of(context).pop(); // close sheet
          AppSnackBars.successSnackBar('job_progress.thank_you_review'.tr());
          context.offAllNamed(Routes.home);
        },
        onSkipped: () {
          Navigator.of(context).pop();
          context.offAllNamed(Routes.home);
        },
      ),
    );
  }

  double _parseDouble(dynamic v) {
    if (v == null) return 0;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }
}

// ---------- Technician Card ----------
class _TechnicianCard extends StatelessWidget {
  final String name;
  final String phone;
  final String photoUrl;
  final double rating;
  final VoidCallback onCallTechnician;

  const _TechnicianCard({
    required this.name,
    required this.phone,
    required this.photoUrl,
    required this.rating,
    required this.onCallTechnician,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Avatar
        CircleAvatar(
          radius: 32,
          backgroundColor: const Color(0xFFE5E7EB),
          backgroundImage:
              photoUrl.isNotEmpty ? NetworkImage(photoUrl) : null,
          child: photoUrl.isEmpty
              ? const Icon(Icons.person, color: Colors.grey)
              : null,
        ),
        const SizedBox(width: 14),

        // Info
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Name
              Row(
                children: [
                  const Icon(Icons.person_outline,
                      size: 18, color: Color(0xFF6B7280)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF111827),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),

              // Phone
              GestureDetector(
                onTap: onCallTechnician,
                child: Row(
                  children: [
                    const Icon(Icons.phone,
                        size: 18, color: Color(0xFF6B7280)),
                    const SizedBox(width: 6),
                    Text(
                      phone,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFF111827),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 6),

              // Rating — always show, default 5 if no reviews yet
              Row(
                children: [
                  Text(
                    '${(rating > 0 ? rating : 5.0).toStringAsFixed(1)}/5',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF111827),
                    ),
                  ),
                  const SizedBox(width: 6),
                  ...List.generate(5, (i) {
                    final effectiveRating = rating > 0 ? rating : 5.0;
                    return Icon(
                      i < effectiveRating.round()
                          ? Icons.star
                          : Icons.star_border,
                      size: 18,
                      color: const Color(0xFFF59E0B),
                    );
                  }),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
