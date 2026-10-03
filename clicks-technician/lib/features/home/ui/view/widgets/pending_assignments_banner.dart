import 'package:clicks_technician/core/config/job_fulfill_status.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/open_active_job_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Compact "N job(s) waiting for accept" banner shown on Home when dispatch
/// assigns more jobs while the technician is busy on another one.
///
/// Reads [HomeCubit.hasIncomingAssignedJob] / [HomeCubit.pendingAssignedJobs];
/// tapping opens a sheet listing the assigned jobs with an Accept button each
/// (see [showPendingAssignmentsSheet]).
class PendingAssignmentsBanner extends StatelessWidget {
  const PendingAssignmentsBanner({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final count = cubit.pendingAssignedJobs.length;
    if (count == 0 || !cubit.hasIncomingAssignedJob) {
      return const SizedBox.shrink();
    }
    final label =
        count == 1 ? '1 job waiting for accept' : '$count jobs waiting for accept';

    return Material(
      color: const Color(0xFF7A1A1A),
      borderRadius: BorderRadius.circular(12.r),
      child: InkWell(
        borderRadius: BorderRadius.circular(12.r),
        onTap: () => showPendingAssignmentsSheet(context, cubit),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 12.h),
          child: Row(
            children: [
              Icon(
                Icons.notifications_active_rounded,
                color: Colors.white,
                size: 20.sp,
              ),
              SizedBox(width: 10.w),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyles.font14RegularGrey.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14.sp,
                  ),
                ),
              ),
              Text(
                'View',
                style: TextStyles.font12RegularGrey.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.white, size: 20.sp),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bottom sheet listing assigned jobs from the queue, each with Accept.
Future<void> showPendingAssignmentsSheet(
  BuildContext context,
  HomeCubit cubit,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
    ),
    builder: (_) => _PendingAssignmentsSheet(cubit: cubit),
  );
}

class _PendingAssignmentsSheet extends StatelessWidget {
  const _PendingAssignmentsSheet({required this.cubit});

  final HomeCubit cubit;

  String _idOf(Map<String, dynamic> job) =>
      (job['_id'] ?? job['job_id'] ?? '').toString();

  bool _busyOnAnotherJob(String jobId) {
    return cubit.activeJobs.any((j) {
      if (_idOf(j) == jobId) return false;
      final status = (j['job_status'] ?? j['status'] ?? '').toString();
      return JobFulfillStatus.isBlocking(
        status,
        paymentStatus: j['payment_status']?.toString(),
      );
    });
  }

  Future<void> _accept(BuildContext context, Map<String, dynamic> job) async {
    final id = _idOf(job);
    if (id.isEmpty) return;
    final busyElsewhere = _busyOnAnotherJob(id);
    final ok = await cubit.acceptJobById(id);
    if (!context.mounted) return;
    if (!ok) {
      AppSnackBars.errorSnackBar(
        cubit.lastActionError ?? 'Could not accept this job',
      );
      return;
    }
    Navigator.of(context).pop();
    if (busyElsewhere) {
      // Keep working the current job; the accepted one is reachable from
      // Activity → Continue job.
      AppSnackBars.successSnackBar('Job accepted — find it under Activity');
      return;
    }
    await cubit.focusJob(id);
    if (!context.mounted) return;
    await openActiveJobScreen(context, cubit);
  }

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<HomeCubit, HomeState>(
      bloc: cubit,
      builder: (context, _) {
        final jobs = cubit.pendingAssignedJobs;
        return SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 16.h),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 40.w,
                    height: 4.h,
                    decoration: BoxDecoration(
                      color: ColorsManager.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
                SizedBox(height: 12.h),
                Text(
                  jobs.isEmpty
                      ? 'No jobs waiting for accept'
                      : 'Jobs waiting for accept',
                  style: TextStyles.font16RegularBlack.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 16.sp,
                  ),
                ),
                SizedBox(height: 8.h),
                if (jobs.isEmpty)
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 12.h),
                    child: Text(
                      'Every assignment has been accepted.',
                      style: TextStyles.font14RegularGrey,
                    ),
                  )
                else
                  ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: 0.6.sh),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: jobs.length,
                      separatorBuilder: (_, __) => SizedBox(height: 8.h),
                      itemBuilder: (context, i) => _PendingJobRow(
                        job: jobs[i],
                        busy: cubit.isLoadingAction,
                        onAccept: () => _accept(context, jobs[i]),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _PendingJobRow extends StatelessWidget {
  const _PendingJobRow({
    required this.job,
    required this.busy,
    required this.onAccept,
  });

  final Map<String, dynamic> job;
  final bool busy;
  final Future<void> Function() onAccept;

  @override
  Widget build(BuildContext context) {
    final customer = (job['clientName'] ?? job['customerName'] ?? 'Customer')
        .toString();
    final location = (job['location'] ?? '').toString();
    final issue = (job['issue'] ?? '').toString();
    final price = double.tryParse((job['price'] ?? '').toString());

    return Container(
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: ColorsManager.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        customer,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyles.font14RegularGrey.copyWith(
                          color: ColorsManager.blackColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (price != null)
                      Text(
                        'QAR ${price.toStringAsFixed(0)}',
                        style: TextStyles.font12RegularGrey.copyWith(
                          color: ColorsManager.blackColor,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
                if (issue.isNotEmpty) ...[
                  SizedBox(height: 2.h),
                  Text(
                    issue,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyles.font12RegularGrey,
                  ),
                ],
                if (location.isNotEmpty) ...[
                  SizedBox(height: 2.h),
                  Text(
                    location,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyles.font12RegularGrey.copyWith(
                      color: ColorsManager.greyColor,
                    ),
                  ),
                ],
              ],
            ),
          ),
          SizedBox(width: 10.w),
          SizedBox(
            height: 36.h,
            child: ElevatedButton(
              onPressed: busy ? null : onAccept,
              style: ElevatedButton.styleFrom(
                backgroundColor: ColorsManager.mainColor,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: Text(
                'Accept',
                style: TextStyles.font14RegularGrey.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
