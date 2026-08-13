import 'dart:async';

import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/helper/technician_location.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/services/service_request_api.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class ServiceWaitingArgs {
  final String requestId;
  final String serviceType;
  final String? serviceLabel;
  final String timing;
  final DateTime? scheduledFor;

  const ServiceWaitingArgs({
    required this.requestId,
    required this.serviceType,
    this.serviceLabel,
    required this.timing,
    this.scheduledFor,
  });
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
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _checkSession();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkSession() async {
    if (_navigating) return;
    try {
      final session = await SessionService.getCustomerSession();
      final job = session['active_job'];
      if (job is Map && mounted) {
        _goToJob(Map<String, dynamic>.from(job));
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
    double customerLat = pos?.latitude ?? 25.2854;
    double customerLng = pos?.longitude ?? 51.5310;
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
      context.offNamed(Routes.home);
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

  @override
  Widget build(BuildContext context) {
    final isScheduled = widget.args.timing == 'scheduled';
    final label = widget.args.serviceLabel ?? widget.args.serviceType;
    final statusLine = isScheduled
        ? 'services.scheduled_service'.tr(namedArgs: {'service': label})
        : 'services.submitted_service'.tr(namedArgs: {'service': label});

    return Scaffold(
      backgroundColor: Colors.white,
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
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.w),
            child: Column(
              children: [
                SizedBox(height: 48.h),
                Text(
                  isScheduled
                      ? 'services.booking_confirmed'.tr()
                      : 'services.waiting_for_dispatch'.tr(),
                  style: TextStyles.font28Bold.copyWith(fontSize: 28.sp),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 12.h),
                Container(
                  padding: EdgeInsets.symmetric(
                    horizontal: 12.w,
                    vertical: 6.h,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF3F3),
                    borderRadius: BorderRadius.circular(8.r),
                    border: Border.all(color: const Color(0xFFFFE0E0)),
                  ),
                  child: Text(
                    statusLine,
                    style: TextStyles.font12RegularBlack.copyWith(
                      color: ColorsManager.mainColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (isScheduled && widget.args.scheduledFor != null) ...[
                  SizedBox(height: 16.h),
                  Text(
                    DateFormat('EEE, MMM d · h:mm a')
                        .format(widget.args.scheduledFor!.toLocal()),
                    style: TextStyles.font16RegularBlack.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                SizedBox(height: 20.h),
                Text(
                  isScheduled
                      ? 'services.scheduled_waiting_body'.tr()
                      : 'services.quiet_waiting_body'.tr(),
                  style: TextStyles.font14RegularGrey,
                  textAlign: TextAlign.center,
                ),
                const Spacer(),
                if (!isScheduled)
                  Padding(
                    padding: EdgeInsets.only(bottom: 12.h),
                    child: SizedBox(
                      width: 28.w,
                      height: 28.w,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: ColorsManager.mainColor,
                      ),
                    ),
                  ),
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
                SizedBox(height: 12.h),
                SizedBox(
                  width: double.infinity,
                  height: 50.h,
                  child: OutlinedButton(
                    onPressed: _busy ? null : _cancel,
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: ColorsManager.mainColor),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10.r),
                      ),
                    ),
                    child: _busy
                        ? SizedBox(
                            width: 22.w,
                            height: 22.w,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: ColorsManager.mainColor,
                            ),
                          )
                        : Text(
                            'services.cancel_request'.tr(),
                            style: TextStyles.font14Medium.copyWith(
                              color: ColorsManager.mainColor,
                            ),
                          ),
                  ),
                ),
                SizedBox(height: 24.h),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
