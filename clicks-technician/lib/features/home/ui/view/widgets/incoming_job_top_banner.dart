import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Urgent incoming-job alert — compact card at top-right.
class IncomingJobTopBanner extends StatelessWidget {
  const IncomingJobTopBanner({
    super.key,
    required this.cubit,
    required this.onExpand,
    this.onAccept,
  });

  final HomeCubit cubit;
  final VoidCallback onExpand;
  final Future<void> Function()? onAccept;

  @override
  Widget build(BuildContext context) {
    final issue =
        cubit.jobIssue.trim().isEmpty ? 'New assignment' : cubit.jobIssue;
    final location = cubit.jobLocation;
    final price = cubit.jobPrice;

    return SafeArea(
      bottom: false,
      child: Align(
        alignment: Alignment.topRight,
        child: Padding(
          padding: EdgeInsets.only(top: 8.h, right: 12.w),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 300.w),
            child: Material(
              elevation: 14,
              shadowColor: ColorsManager.mainColor.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(16.r),
              color: Colors.transparent,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF7A1A1A), Color(0xFF5C1515)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(16.r),
                  border:
                      Border.all(color: const Color(0xFFFFB4B4), width: 1.5),
                ),
                child: InkWell(
                  onTap: onExpand,
                  borderRadius: BorderRadius.circular(16.r),
                  child: Padding(
                    padding: EdgeInsets.all(12.w),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.notifications_active_rounded,
                              color: Colors.white,
                              size: 18.sp,
                            ),
                            SizedBox(width: 6.w),
                            Expanded(
                              child: Text(
                                'notif.job_assigned.title'.tr(),
                                style: TextStyles.font12RegularGrey.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13.sp,
                                ),
                              ),
                            ),
                            if (price != null)
                              Text(
                                'QAR ${price.toStringAsFixed(0)}',
                                style: TextStyles.font12RegularGrey.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                          ],
                        ),
                        SizedBox(height: 6.h),
                        Text(
                          issue,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyles.font12RegularGrey.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        SizedBox(height: 2.h),
                        Text(
                          location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyles.font12RegularGrey.copyWith(
                            color: Colors.white.withValues(alpha: 0.88),
                            fontSize: 11.sp,
                          ),
                        ),
                        SizedBox(height: 8.h),
                        SizedBox(
                          width: double.infinity,
                          height: 34.h,
                          child: AppButton(
                            onPressed: cubit.isLoadingAction
                                ? null
                                : () async {
                                    if (onAccept != null) {
                                      await onAccept!();
                                    } else {
                                      await cubit.acceptJob();
                                    }
                                  },
                            label: 'notif.job_assigned.accept'.tr(),
                            isLoading: cubit.isLoadingAction,
                            fontSize: 12.sp,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
