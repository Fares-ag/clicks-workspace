import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Home banner for a live job that is at the garage or returning for drop-off.
class GarageJobCard extends StatelessWidget {
  final Map<String, dynamic> session;

  const GarageJobCard({super.key, required this.session});

  static bool shouldShow(Map<String, dynamic> session) {
    final kind = session['session_kind']?.toString();
    if (kind == 'at_garage' || kind == 'returning') return true;
    final job = session['live_job'];
    if (job is! Map) return false;
    final phase = job['garage'] is Map ? job['garage']['phase']?.toString() : null;
    return phase == 'at_garage' || phase == 'returning';
  }

  @override
  Widget build(BuildContext context) {
    if (!shouldShow(session)) return const SizedBox.shrink();

    final job = session['live_job'] is Map
        ? Map<String, dynamic>.from(session['live_job'] as Map)
        : session['active_job'] is Map
            ? Map<String, dynamic>.from(session['active_job'] as Map)
            : <String, dynamic>{};
    final garage = job['garage'] is Map
        ? Map<String, dynamic>.from(job['garage'] as Map)
        : <String, dynamic>{};
    final returning = garage['phase']?.toString() == 'returning' ||
        session['session_kind']?.toString() == 'returning';
    final reason = garage['reason']?.toString().isNotEmpty == true
        ? garage['reason'].toString()
        : job['hold_reason']?.toString() ?? '';
    final name = garage['name']?.toString() ?? '';
    final readyRaw = garage['expected_ready_at']?.toString() ??
        job['scheduled_return_at']?.toString() ??
        '';
    DateTime? readyAt = DateTime.tryParse(readyRaw);

    final title = returning
        ? 'home.garage_returning_title'.tr()
        : 'home.garage_card_title'.tr();
    final subtitleParts = <String>[
      if (name.isNotEmpty) name,
      if (reason.isNotEmpty) reason,
    ];

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 4.h),
      child: Material(
        color: ColorsManager.wash,
        borderRadius: BorderRadius.circular(14.r),
        child: InkWell(
          onTap: () => SessionResume.go(
            context,
            session,
            replace: false,
          ),
          borderRadius: BorderRadius.circular(14.r),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14.r),
              border: Border.all(color: ColorsManager.washBorder),
            ),
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 16.h),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 44.w,
                  height: 44.w,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: ColorsManager.mainColor.withValues(alpha: 0.25),
                    ),
                  ),
                  child: Icon(
                    returning
                        ? Icons.directions_car_filled_outlined
                        : Icons.garage_outlined,
                    color: ColorsManager.mainColor,
                    size: 22.sp,
                  ),
                ),
                SizedBox(width: 14.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: TextStyles.font14Medium.copyWith(
                          color: ColorsManager.mainColor,
                        ),
                      ),
                      if (subtitleParts.isNotEmpty) ...[
                        SizedBox(height: 6.h),
                        Text(
                          subtitleParts.join(' · '),
                          style: TextStyles.font16RegularBlack.copyWith(
                            fontWeight: FontWeight.w600,
                            height: 1.3,
                          ),
                        ),
                      ],
                      if (!returning && readyAt != null) ...[
                        SizedBox(height: 4.h),
                        Text(
                          'home.garage_ready_date'.tr(namedArgs: {
                            'date': DateFormat('EEE, MMM d · h:mm a')
                                .format(readyAt.toLocal()),
                          }),
                          style: TextStyles.font14RegularGrey,
                        ),
                      ],
                      SizedBox(height: 8.h),
                      Text(
                        'services.view_status'.tr(),
                        style: TextStyles.font12RegularGrey.copyWith(
                          color: ColorsManager.mainColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Icon(
                  Icons.chevron_right_rounded,
                  color: ColorsManager.mainColor,
                  size: 26.sp,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
