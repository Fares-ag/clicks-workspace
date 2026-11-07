import 'dart:async';

import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/sos_services/sos_support_contact.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/home/job_cancel_api.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class FindingTechnicianArgs {
  final String jobId;
  final String jobReference;
  const FindingTechnicianArgs({required this.jobId, this.jobReference = ''});
}

/// A job exists but no technician is assigned yet (`pending`) — dispatch
/// created it without one, or the technician handed it back. Without this
/// the customer saw Home and raised a second SOS (scenarios 45, 48).
class FindingTechnicianScreen extends StatefulWidget {
  final FindingTechnicianArgs args;
  const FindingTechnicianScreen({super.key, required this.args});

  @override
  State<FindingTechnicianScreen> createState() =>
      _FindingTechnicianScreenState();
}

class _FindingTechnicianScreenState extends State<FindingTechnicianScreen> {
  Timer? _poll;
  bool _busy = false;
  bool _navigating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<SosCubit>().socketService.ensureConnected();
    });
    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _check());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// Leave as soon as the job is no longer pending (assigned, cancelled...).
  Future<void> _check() async {
    if (_navigating || !mounted) return;
    try {
      final session = await SessionService.getCustomerSession();
      if (!mounted) return;
      SosSupportContact.updateFrom(session);
      final job = session['live_job'];
      final stillPending = job is Map &&
          (job['_id'] ?? job['id'])?.toString() == widget.args.jobId &&
          job['job_status']?.toString() == 'pending';
      if (stillPending) return;
      _navigating = true;
      _poll?.cancel();
      await SessionResume.go(context, session);
    } catch (_) {}
  }

  Future<void> _cancel() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await JobCancelApi.cancelCustomer(
        jobId: widget.args.jobId,
        reason: 'no_longer_needed',
      );
      if (!mounted) return;
      _navigating = true;
      _poll?.cancel();
      AppSnackBars.successSnackBar('dispatch.job_cancelled'.tr());
      context.offAllNamed(Routes.home);
    } catch (e) {
      if (!mounted) return;
      AppSnackBars.errorSnackBar(e.toString().replaceFirst('Exception: ', ''));
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: BlocListener<SosCubit, SosState>(
        listener: (context, state) {
          if (state is TechnicianAssigned ||
              state is TechnicianAccepted ||
              state is TechnicianEnRoute ||
              state is JobCancelled) {
            _check();
          }
        },
        child: SafeArea(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.w),
            child: Column(
              children: [
                SizedBox(height: 56.h),
                Text(
                  'dispatch.finding_technician_title'.tr(),
                  style: TextStyles.font28Bold.copyWith(fontSize: 28.sp),
                  textAlign: TextAlign.center,
                ),
                if (widget.args.jobReference.isNotEmpty) ...[
                  SizedBox(height: 8.h),
                  Text('#${widget.args.jobReference}',
                      style: TextStyles.font14RegularGrey),
                ],
                SizedBox(height: 16.h),
                Text(
                  'dispatch.finding_technician_body'.tr(),
                  style: TextStyles.font14RegularGrey,
                  textAlign: TextAlign.center,
                ),
                const Spacer(),
                SizedBox(
                  width: 32.w,
                  height: 32.w,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: ColorsManager.mainColor,
                  ),
                ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 50.h,
                  child: FilledButton.icon(
                    onPressed: SosSupportContact.call,
                    icon: const Icon(Icons.phone, color: Colors.white),
                    style: FilledButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10.r),
                      ),
                    ),
                    label: Text(
                      'dispatch.call_us_now'.tr(),
                      style:
                          TextStyles.font14Medium.copyWith(color: Colors.white),
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
                            'dispatch.cancel_free'.tr(),
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
