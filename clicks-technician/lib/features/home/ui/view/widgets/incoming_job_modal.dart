import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Figma Incoming Job overlay — shown globally over any tab.
class IncomingJobModal extends StatelessWidget {
  const IncomingJobModal({super.key, required this.cubit});

  final HomeCubit cubit;

  static String _localPhone(String raw) {
    var digits = raw.replaceAll(RegExp(r'\D'), '');
    // Only strip the 974 country code when the total is exactly 11 digits
    // (3 country code + 8 local). Guards against incorrectly stripping
    // numbers that merely happen to start with 974 in the local part.
    if (digits.startsWith('974') && digits.length == 11) {
      digits = digits.substring(3);
    }
    if (digits.length > 8) digits = digits.substring(digits.length - 8);
    return digits;
  }

  @override
  Widget build(BuildContext context) {
    final price = cubit.jobPrice;
    final job = cubit.activeJob ?? <String, dynamic>{};
    final phone = _localPhone(cubit.customerPhone);

    return Material(
      color: Colors.black.withValues(alpha: 0.55),
      child: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Container(
              margin: EdgeInsets.symmetric(horizontal: 20.w),
              padding: EdgeInsets.all(20.w),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20.r),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Incoming Job',
                    style: TextStyles.font16RegularBlack.copyWith(
                      fontWeight: FontWeight.bold,
                      fontSize: 20.sp,
                    ),
                  ),
                  SizedBox(height: 4.h),
                  Text(
                    'Customer Details',
                    style: TextStyles.font14RegularGrey
                        .copyWith(color: Colors.black87),
                  ),
                  SizedBox(height: 14.h),
                  Divider(height: 1.h, color: ColorsManager.border),
                  SizedBox(height: 14.h),
                  Row(
                    children: [
                      SvgPicture.asset(AssetsManager.userSvg, width: 16.w),
                      SizedBox(width: 8.w),
                      Expanded(
                        child: Text(
                          cubit.customerName,
                          style: TextStyles.font14RegularGrey
                              .copyWith(color: Colors.black87),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if (phone.isNotEmpty) ...[
                    SizedBox(height: 8.h),
                    Row(
                      children: [
                        SvgPicture.asset(AssetsManager.phoneSvg, width: 16.w),
                        SizedBox(width: 8.w),
                        Text(
                          phone,
                          style: TextStyles.font14RegularGrey
                              .copyWith(color: Colors.black87),
                        ),
                      ],
                    ),
                  ],
                  SizedBox(height: 12.h),
                  _kv('Location', cubit.jobLocation),
                  SizedBox(height: 8.h),
                  _kv('Issue', cubit.jobIssue),
                  SizedBox(height: 8.h),
                  _kv('Vehicle', JobDisplay.vehicleLine(job)),
                  if (price != null) ...[
                    SizedBox(height: 12.h),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Price', style: TextStyles.font14RegularGrey),
                        Container(
                          padding: EdgeInsets.symmetric(
                              horizontal: 10.w, vertical: 4.h),
                          decoration: BoxDecoration(
                            color: const Color(0xFF12B76A),
                            borderRadius: BorderRadius.circular(8.r),
                          ),
                          child: Text(
                            'QAR ${price.toStringAsFixed(0)}',
                            style: TextStyles.font12RegularBlack.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  SizedBox(height: 20.h),
                  AppButton(
                    isLoading: cubit.isLoadingAction,
                    onPressed: cubit.acceptJob,
                    label: 'notif.job_assigned.accept'.tr(),
                    margin: 0,
                    width: double.infinity,
                    bgColor: ColorsManager.mainColor,
                    textColor: Colors.white,
                    height: 48.h,
                    radius: 10.r,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 72.w,
          child: Text(k, style: TextStyles.font12RegularGrey),
        ),
        Expanded(
          child: Text(
            v,
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
