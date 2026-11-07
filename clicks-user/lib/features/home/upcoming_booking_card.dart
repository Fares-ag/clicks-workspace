import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Home card for a scheduled booking that is not yet inside its active
/// window (the server sends it as `upcoming_booking`). Tapping it opens the
/// booking details, where the customer can still cancel it.
class UpcomingBookingCard extends StatelessWidget {
  final Map<String, dynamic> session;

  const UpcomingBookingCard({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    final raw = session['upcoming_booking'];
    if (raw is! Map) return const SizedBox.shrink();
    final booking = Map<String, dynamic>.from(raw);
    final when = DateTime.tryParse(booking['scheduled_for']?.toString() ?? '')
        ?.toLocal();
    final service = booking['service_type']?.toString() ?? '';
    final whenLabel =
        when == null ? '' : DateFormat('EEE, MMM d · h:mm a').format(when);

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 4.h),
      child: Material(
        color: ColorsManager.wash,
        borderRadius: BorderRadius.circular(14.r),
        child: InkWell(
          borderRadius: BorderRadius.circular(14.r),
          onTap: () => context.toNamed(
            Routes.serviceWaiting,
            arguments: ServiceWaitingArgs.fromBooking(booking),
          ),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14.r),
              border: Border.all(color: ColorsManager.washBorder),
            ),
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),
            child: Row(
              children: [
                Icon(Icons.event_available_outlined,
                    color: ColorsManager.mainColor, size: 26.sp),
                SizedBox(width: 12.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'dispatch.upcoming_booking_title'.tr(),
                        style: TextStyles.font14Medium.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 2.h),
                      Text(
                        'dispatch.upcoming_booking_body'.tr(
                          namedArgs: {'service': service, 'when': whenLabel},
                        ),
                        style: TextStyles.font12RegularGrey,
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: ColorsManager.greyColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
