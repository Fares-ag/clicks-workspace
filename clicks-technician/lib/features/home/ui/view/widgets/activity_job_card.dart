import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Figma activity list card — date, status pill, job id, vehicle, view details.
class ActivityJobCard extends StatelessWidget {
  const ActivityJobCard({
    super.key,
    required this.job,
    required this.onViewDetails,
  });

  final Map<String, dynamic> job;
  final VoidCallback onViewDetails;

  @override
  Widget build(BuildContext context) {
    final status = (job['job_status'] ?? job['status'] ?? '').toString();
    final statusLabel = JobDisplay.statusLabel(status);
    final statusColor = JobDisplay.statusColor(status);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: ColorsManager.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      padding: EdgeInsets.all(14.w),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.calendar_today_outlined,
                size: 16.sp,
                color: ColorsManager.greyColor,
              ),
              SizedBox(width: 6.w),
              Expanded(
                child: Text(
                  JobDisplay.formatWhen(job),
                  style: TextStyles.font12RegularGrey.copyWith(
                    color: ColorsManager.greyColor,
                    fontSize: 13.sp,
                  ),
                ),
              ),
              _StatusPill(label: statusLabel, color: statusColor),
            ],
          ),
          SizedBox(height: 12.h),
          Text(
            'Job Id: ${JobDisplay.ocId(job)}',
            style: TextStyles.font14RegularGrey.copyWith(
              color: ColorsManager.blackColor,
              fontWeight: FontWeight.w700,
              fontSize: 15.sp,
            ),
          ),
          SizedBox(height: 6.h),
          Text(
            JobDisplay.vehicleLine(job),
            style: TextStyles.font14RegularGrey.copyWith(
              color: ColorsManager.blackColor,
              fontSize: 14.sp,
              height: 1.35,
            ),
          ),
          if (_affordance(status, job) != null) ...[
            SizedBox(height: 8.h),
            Text(
              _affordance(status, job)!,
              style: TextStyles.font12RegularGrey.copyWith(
                color: ColorsManager.mainColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          SizedBox(height: 14.h),
          SizedBox(
            width: double.infinity,
            height: 44.h,
            child: ElevatedButton(
              onPressed: onViewDetails,
              style: ElevatedButton.styleFrom(
                backgroundColor: ColorsManager.mainColor,
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8.r),
                ),
              ),
              child: Text(
                'view details',
                style: TextStyles.font14RegularGrey.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 14.sp,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String? _affordance(String status, Map<String, dynamic> job) {
    if (['accepted', 'en_route', 'arrived', 'in_progress'].contains(status)) {
      return 'Active';
    }
    if (status == 'completed' &&
        (job['payment_status']?.toString() ?? '') != 'paid') {
      return 'Needs payment';
    }
    return null;
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(99.r),
      ),
      child: Text(
        label,
        style: TextStyles.font12RegularGrey.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w600,
          fontSize: 11.sp,
        ),
      ),
    );
  }
}
