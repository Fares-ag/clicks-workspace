import 'dart:async';

import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/components/clicks_card.dart';
import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/helper/technician_location.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/sos_services/sos_support_contact.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/home/job_in_progress_screen.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/services/service_request_api.dart';
import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';

class ServiceWaitingArgs {
  final String requestId;
  final String serviceType;
  final String? serviceLabel;
  final String timing;
  final DateTime? scheduledFor;
  final String? vehicleName;
  final String? vehiclePlate;

  const ServiceWaitingArgs({
    required this.requestId,
    required this.serviceType,
    this.serviceLabel,
    required this.timing,
    this.scheduledFor,
    this.vehicleName,
    this.vehiclePlate,
  });

  factory ServiceWaitingArgs.fromBooking(Map<String, dynamic> data) {
    return ServiceWaitingArgs(
      requestId: data['_id']?.toString() ?? data['id']?.toString() ?? '',
      serviceType: data['service_type']?.toString() ?? '',
      serviceLabel: data['service_label']?.toString(),
      timing: data['timing']?.toString() ?? 'immediate',
      scheduledFor:
          DateTime.tryParse(data['scheduled_for']?.toString() ?? '')?.toLocal(),
      vehicleName: vehicleNameFromBooking(data),
      vehiclePlate: vehiclePlateFromBooking(data),
    );
  }
}

String? vehicleNameFromBooking(Map<String, dynamic> data) {
  final v = data['vehicle'];
  if (v is Map) {
    final name = [v['make'], v['model']]
        .where((e) => e != null && '$e'.trim().isNotEmpty && '$e' != 'Unknown')
        .join(' ')
        .trim();
    if (name.isNotEmpty) return name;
  }
  final nested = data['customer_vehicle_id'];
  if (nested is Map) {
    final make = nested['vehicle_make'];
    final model = nested['vehicle_model'];
    final makeName = make is Map ? make['makeName']?.toString() ?? '' : '';
    final modelName = model is Map ? model['modelName']?.toString() ?? '' : '';
    final name = '$makeName $modelName'.trim();
    if (name.isNotEmpty) return name;
  }
  return null;
}

String? vehiclePlateFromBooking(Map<String, dynamic> data) {
  final v = data['vehicle'];
  if (v is Map) {
    final plate = v['plate']?.toString().trim() ?? '';
    if (plate.isNotEmpty && plate != 'Unknown') return plate;
  }
  final nested = data['customer_vehicle_id'];
  if (nested is Map) {
    final plate = nested['plate_number']?.toString().trim() ?? '';
    if (plate.isNotEmpty) return plate;
  }
  return null;
}

class ServiceWaitingScreen extends StatefulWidget {
  final ServiceWaitingArgs args;
  const ServiceWaitingScreen({super.key, required this.args});

  @override
  State<ServiceWaitingScreen> createState() => _ServiceWaitingScreenState();
}

class _ServiceWaitingScreenState extends State<ServiceWaitingScreen> {
  Timer? _pollTimer;
  bool _busy = false;
  bool _navigating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<SosCubit>().socketService.ensureConnected();
      _checkSession();
    });
    // A scheduled booking days away doesn't need a 5-second poll.
    final every = widget.args.timing == 'scheduled'
        ? const Duration(seconds: 30)
        : const Duration(seconds: 5);
    _pollTimer = Timer.periodic(every, (_) {
      if (mounted) _checkSession();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  /// True while the server still lists this request as open — either as the
  /// active session or as an upcoming booking.
  bool _requestStillOpen(Map<String, dynamic> session) {
    final id = widget.args.requestId;
    if (id.isEmpty) return true;
    String? idOf(dynamic m) =>
        m is Map ? (m['_id'] ?? m['id'])?.toString() : null;
    if (idOf(session['active_service_request']) == id) return true;
    final upcoming = session['upcoming_bookings'];
    if (upcoming is List && upcoming.any((b) => idOf(b) == id)) return true;
    return false;
  }

  Future<void> _checkSession() async {
    if (_navigating) return;
    try {
      final session = await SessionService.getCustomerSession();
      if (!mounted) return;
      final job = session['live_job'] is Map
          ? session['live_job']
          : session['active_job'];
      if (job is Map) {
        if (job['job_status']?.toString() == 'pending' ||
            job['job_status']?.toString() == 'on_hold') {
          // Job exists but no technician yet: "Finding a technician".
          _pollTimer?.cancel();
          _navigating = true;
          await SessionResume.go(context, session);
          return;
        }
        _goToJob(Map<String, dynamic>.from(job));
        return;
      }
      // The request finished (job completed/cancelled, or cancelled by
      // dispatch): stop polling and leave instead of waiting forever
      // (scenario 54).
      if (session['session_kind'] != null || session.containsKey('upcoming_bookings')) {
        if (!_requestStillOpen(session)) {
          _pollTimer?.cancel();
          _navigating = true;
          AppSnackBars.successSnackBar('dispatch.request_finished'.tr());
          context.offAllNamed(Routes.home);
        }
      }
    } catch (_) {}
  }

  void _goToJob(Map<String, dynamic> job) {
    if (_navigating || !mounted) return;
    final status = job['job_status']?.toString() ?? '';
    final jobId = job['_id']?.toString() ?? job['id']?.toString() ?? '';
    if (jobId.isEmpty) return;

    final tech = job['assignedTechnician'];
    final techMap = tech is Map
        ? Map<String, dynamic>.from(tech)
        : <String, dynamic>{};
    final first = techMap['firstName']?.toString() ?? '';
    final last = techMap['lastName']?.toString() ?? '';
    final (techLat, techLng) = TechnicianLocation.latLngFrom(techMap);

    final sosCubit = context.read<SosCubit>();
    final pos = sosCubit.lastKnownPosition;
    // The job's own pin first, then the phone's last fix. Never a made-up
    // Doha point: with no coordinates the tracking screen hides the ETA
    // (scenario 61).
    double? customerLat = pos?.latitude;
    double? customerLng = pos?.longitude;
    final loc = job['location'];
    if (loc is Map && loc['coordinates'] is List) {
      final coords = loc['coordinates'] as List;
      if (coords.length >= 2) {
        customerLng = (coords[0] as num).toDouble();
        customerLat = (coords[1] as num).toDouble();
      }
    }

    _navigating = true;
    if (status == 'in_progress') {
      final tech = SessionResume.techInfoFromJob(job);
      context.offNamed(
        Routes.jobInProgress,
        arguments: JobProgressArgs(
          userName: '',
          bannerTitle: 'home.job_in_progress'.tr(),
          bannerBody: 'job_progress.banner_body'.tr(),
          jobId: jobId,
          jobReference: job['job_reference']?.toString() ?? '',
          statusPillText: JobStatusLabels.labelFor('in_progress'),
          technicianName: tech['name'] ?? '',
          technicianPhone: tech['phone'] ?? '',
          technicianAvatarUrl: tech['photo'] ?? '',
          vehicleName: SessionResume.vehicleName(job),
          vehicleCode: '',
          onCallDispatch: SosSupportContact.call,
          onCallTechnician: () async {
            final phone = tech['phone'] ?? '';
            if (phone.isEmpty) return;
            final uri = Uri.parse('tel:$phone');
            if (await canLaunchUrl(uri)) await launchUrl(uri);
          },
        ),
      );
      return;
    }

    context.offNamed(
      Routes.technicianTracking,
      arguments: TrackingArgs(
        jobId: jobId,
        techInfo: {
          'name': '$first $last'.trim(),
          'phone': techMap['phone']?.toString() ?? '',
          'photo': techMap['profilePicture']?.toString() ?? '',
          if (techLat != null) 'latitude': techLat,
          if (techLng != null) 'longitude': techLng,
        },
        customerLat: customerLat,
        customerLng: customerLng,
        initialPhase: status == 'arrived' ? 'arrived' : 'en_route',
        techLat: techLat,
        techLng: techLng,
      ),
    );
  }

  Future<void> _confirmCancel() async {
    if (_busy) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      useSafeArea: true,
      backgroundColor: ColorsManager.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 24.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40.w,
                height: 4.h,
                decoration: BoxDecoration(
                  color: ColorsManager.cardBorder,
                  borderRadius: BorderRadius.circular(2.r),
                ),
              ),
              SizedBox(height: 16.h),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  'services.cancel_request_title'.tr(),
                  style: TextStyles.font16RegularBlack.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 18.sp,
                  ),
                ),
              ),
              SizedBox(height: 8.h),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  'services.cancel_request_body'.tr(),
                  style: TextStyles.font14Regular.copyWith(
                    color: ColorsManager.greyColor,
                    height: 1.4,
                  ),
                ),
              ),
              SizedBox(height: 24.h),
              SizedBox(
                width: double.infinity,
                height: 48.h,
                child: FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  style: FilledButton.styleFrom(
                    backgroundColor: ColorsManager.mainColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12.r),
                    ),
                  ),
                  child: Text('services.confirm_cancel_request'.tr()),
                ),
              ),
              SizedBox(height: 8.h),
              SizedBox(
                width: double.infinity,
                height: 48.h,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text(
                    'services.keep_request'.tr(),
                    style: TextStyles.font14Medium.copyWith(
                      color: ColorsManager.greyColor,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
    if (confirmed != true || !mounted) return;
    await _cancel();
  }

  Future<void> _cancel() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ServiceRequestApi.cancel(widget.args.requestId);
      if (!mounted) return;
      AppSnackBars.successSnackBar('services.request_cancelled'.tr());
      context.offAllNamed(Routes.home);
    } catch (e) {
      if (!mounted) return;
      AppSnackBars.errorSnackBar(e.toString().replaceFirst('Exception: ', ''));
      setState(() => _busy = false);
    }
  }

  void _goHome() {
    context.offAllNamed(Routes.home);
  }

  String get _shortRequestId {
    final id = widget.args.requestId;
    if (id.isEmpty) return '';
    final tail = id.length > 6 ? id.substring(id.length - 6) : id;
    return '#${tail.toUpperCase()}';
  }

  String _whenLabel(BuildContext context) {
    final when = widget.args.scheduledFor;
    if (when == null) return 'services.as_soon_as_possible'.tr();
    final locale = context.locale.toString();
    try {
      return DateFormat('EEE, MMM d · h:mm a', locale).format(when.toLocal());
    } catch (_) {
      return DateFormat('EEE, MMM d · h:mm a').format(when.toLocal());
    }
  }

  String? get _vehicleLine {
    final name = widget.args.vehicleName?.trim() ?? '';
    final plate = widget.args.vehiclePlate?.trim() ?? '';
    if (name.isEmpty && plate.isEmpty) return null;
    if (name.isEmpty) return plate;
    if (plate.isEmpty) return name;
    return '$name · $plate';
  }

  @override
  Widget build(BuildContext context) {
    final isScheduled = widget.args.timing == 'scheduled';
    final label = widget.args.serviceLabel ?? widget.args.serviceType;
    final canPop = Navigator.of(context).canPop();

    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        automaticallyImplyLeading: canPop,
      ),
      body: BlocListener<SosCubit, SosState>(
        listener: (context, state) {
          if (state is TechnicianAssigned ||
              state is TechnicianAccepted ||
              state is TechnicianEnRoute ||
              state is TechnicianArrived) {
            _checkSession();
          } else if (state is JobCancelled) {
            AppSnackBars.errorSnackBar('services.request_cancelled'.tr());
            context.offAllNamed(Routes.home);
          }
        },
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(16.w, 20.h, 16.w, 16.h),
                  child: Column(
                    children: [
                      ClicksIconWell(
                        icon: isScheduled
                            ? Icons.check_circle_outlined
                            : Icons.hourglass_empty_outlined,
                        size: 64,
                      ),
                      SizedBox(height: 16.h),
                      Text(
                        isScheduled
                            ? 'services.booking_confirmed'.tr()
                            : 'services.waiting_for_dispatch'.tr(),
                        style: TextStyles.font28Bold.copyWith(fontSize: 24.sp),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: 6.h),
                      Text(
                        isScheduled
                            ? 'services.booking_pending'.tr()
                            : 'services.arranging_now'.tr(),
                        style: TextStyles.font12RegularBlack.copyWith(
                          color: ColorsManager.greyColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (!isScheduled) ...[
                        SizedBox(height: 16.h),
                        SizedBox(
                          width: 22.w,
                          height: 22.w,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: ColorsManager.mainColor,
                          ),
                        ),
                      ],
                      SizedBox(height: 24.h),
                      ClicksCard(
                        padding: EdgeInsets.symmetric(
                          horizontal: 16.w,
                          vertical: 8.h,
                        ),
                        child: Builder(
                          builder: (context) {
                            final rows = <({String label, String value})>[
                              (
                                label: 'services.detail_service'.tr(),
                                value: label,
                              ),
                              (
                                label: 'services.detail_when'.tr(),
                                value: _whenLabel(context),
                              ),
                              if (_vehicleLine != null)
                                (
                                  label: 'services.detail_vehicle'.tr(),
                                  value: _vehicleLine!,
                                ),
                              (
                                label: 'services.detail_location'.tr(),
                                value: 'services.location_saved'.tr(),
                              ),
                              if (_shortRequestId.isNotEmpty)
                                (
                                  label: 'services.detail_request_id'.tr(),
                                  value: _shortRequestId,
                                ),
                            ];
                            return Column(
                              children: [
                                for (var i = 0; i < rows.length; i++)
                                  _BookingDetailRow(
                                    label: rows[i].label,
                                    value: rows[i].value,
                                    last: i == rows.length - 1,
                                  ),
                              ],
                            );
                          },
                        ),
                      ),
                      SizedBox(height: 16.h),
                      Text(
                        isScheduled
                            ? 'services.scheduled_waiting_body'.tr()
                            : 'services.quiet_waiting_body'.tr(),
                        style: TextStyles.font14Regular.copyWith(
                          color: ColorsManager.greyColor,
                          height: 1.45,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 16.h),
                child: Column(
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 50.h,
                      child: FilledButton(
                        onPressed: _busy ? null : _goHome,
                        style: FilledButton.styleFrom(
                          backgroundColor: ColorsManager.mainColor,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10.r),
                          ),
                        ),
                        child: Text(
                          'services.go_to_home'.tr(),
                          style: TextStyles.font14Medium.copyWith(
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    SizedBox(height: 4.h),
                    SizedBox(
                      width: double.infinity,
                      height: 48.h,
                      child: TextButton(
                        onPressed: _busy ? null : _confirmCancel,
                        child: _busy
                            ? SizedBox(
                                width: 20.w,
                                height: 20.w,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: ColorsManager.mainColor,
                                ),
                              )
                            : Text(
                                'services.cancel_request'.tr(),
                                style: TextStyles.font14Medium.copyWith(
                                  color: ColorsManager.greyColor,
                                ),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BookingDetailRow extends StatelessWidget {
  final String label;
  final String value;
  final bool last;

  const _BookingDetailRow({
    required this.label,
    required this.value,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(vertical: 12.h),
      decoration: last
          ? null
          : const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: ColorsManager.cardBorder),
              ),
            ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88.w,
            child: Text(
              label,
              style: TextStyles.font12RegularBlack.copyWith(
                color: ColorsManager.greyColor,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyles.font14Medium.copyWith(
                fontWeight: FontWeight.w600,
                color: ColorsManager.blackColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
