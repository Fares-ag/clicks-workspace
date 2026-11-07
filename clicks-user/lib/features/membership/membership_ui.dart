import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/membership/membership_models.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

bool isRecommendedPlan(MembershipPlan plan) =>
    plan.code.toLowerCase() == 'plus';

String priceLine(num price, String interval) {
  return interval == 'year'
      ? 'membership.price_year'.tr(namedArgs: {'price': '$price'})
      : 'membership.price_month'.tr(namedArgs: {'price': '$price'});
}

bool _isWash(MembershipIncluded row) =>
    row.bucket.toLowerCase().contains('wash') ||
    (row.serviceTypes.isNotEmpty &&
        row.serviceTypes.every((t) => t.toLowerCase().contains('wash')));

String includedServiceName(MembershipIncluded row) {
  if (_isWash(row)) return 'membership.wash_label'.tr();
  if (row.serviceTypes.isNotEmpty) return row.serviceTypes.first;
  return row.bucket;
}

String includedBenefitLabel(MembershipIncluded row) {
  return 'membership.benefit_visit'.tr(namedArgs: {
    'count': '${row.quota}',
    'service': includedServiceName(row),
  });
}

List<String> planBenefitLines(MembershipPlan plan, MembershipPlanInterval sku) {
  return [
    for (final row in sku.included) includedBenefitLabel(row),
    if (plan.discountPercent > 0)
      'membership.discount_line'.tr(namedArgs: {
        'percent': '${plan.discountPercent}',
      }),
  ];
}

class MembershipSegmentedToggle extends StatelessWidget {
  const MembershipSegmentedToggle({
    super.key,
    required this.interval,
    required this.onChanged,
  });

  final String interval;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(4.w),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F2F2),
        borderRadius: BorderRadius.circular(12.r),
      ),
      child: Row(
        children: [
          _seg('month', 'membership.month'.tr()),
          _seg('year', 'membership.year'.tr()),
        ],
      ),
    );
  }

  Widget _seg(String value, String label) {
    final selected = interval == value;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => onChanged(value),
          borderRadius: BorderRadius.circular(10.r),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            height: 44.h,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? Colors.white : Colors.transparent,
              borderRadius: BorderRadius.circular(10.r),
              boxShadow: selected
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 8,
                        offset: const Offset(0, 1),
                      ),
                    ]
                  : null,
            ),
            child: Text(
              label,
              style: TextStyles.font14RegularGrey.copyWith(
                color: selected ? ColorsManager.mainColor : Colors.black87,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MembershipBenefitRow extends StatelessWidget {
  const MembershipBenefitRow({
    super.key,
    required this.label,
    this.emphasized = false,
  });

  final String label;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final color = emphasized ? ColorsManager.mainColor : const Color(0xFF667085);
    return Padding(
      padding: EdgeInsets.only(bottom: 10.h),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_rounded, size: 18.sp, color: color),
          SizedBox(width: 10.w),
          Expanded(
            child: Text(
              label,
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF344054),
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MembershipStickyCta extends StatelessWidget {
  const MembershipStickyCta({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.outlined = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool enabled;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final canTap = enabled && !loading && onPressed != null;
    return SafeArea(
      top: false,
      child: Container(
        padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 12.h),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: ColorsManager.washBorder)),
        ),
        child: SizedBox(
          width: double.infinity,
          height: 52.h,
          child: ElevatedButton(
            onPressed: canTap ? onPressed : null,
            style: ElevatedButton.styleFrom(
              elevation: 0,
              backgroundColor:
                  outlined ? Colors.white : ColorsManager.mainColor,
              foregroundColor:
                  outlined ? ColorsManager.mainColor : Colors.white,
              disabledBackgroundColor: const Color(0xFFE4E7EC),
              disabledForegroundColor: const Color(0xFF98A2B3),
              side: outlined
                  ? const BorderSide(color: ColorsManager.mainColor, width: 1.5)
                  : BorderSide.none,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14.r),
              ),
            ),
            child: loading
                ? SizedBox(
                    width: 22.w,
                    height: 22.w,
                    child: const CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    label,
                    style: TextStyles.font16Medium.copyWith(
                      fontWeight: FontWeight.w700,
                      color: outlined
                          ? ColorsManager.mainColor
                          : (canTap ? Colors.white : const Color(0xFF98A2B3)),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class MembershipSkipcashBanner extends StatelessWidget {
  const MembershipSkipcashBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(14.w, 12.h, 14.w, 12.h),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F4F7),
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFD0D5DD)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.credit_card_off_outlined,
              size: 20.sp, color: const Color(0xFF475467)),
          SizedBox(width: 10.w),
          Expanded(
            child: Text(
              'membership.skipcash_disabled_note'.tr(),
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF344054),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MembershipPreviewBanner extends StatelessWidget {
  const MembershipPreviewBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(14.w, 12.h, 14.w, 12.h),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFAEB),
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: const Color(0xFFFEDF89)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 20.sp, color: const Color(0xFFB54708)),
          SizedBox(width: 10.w),
          Expanded(
            child: Text(
              'membership.preview_catalog_note'.tr(),
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF7A2E0E),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MembershipBadge extends StatelessWidget {
  const MembershipBadge({
    super.key,
    required this.label,
    this.filled = true,
  });

  final String label;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: filled ? ColorsManager.mainColor : ColorsManager.wash,
        borderRadius: BorderRadius.circular(6.r),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyles.font12RegularBlack.copyWith(
          color: filled ? Colors.white : ColorsManager.mainColor,
          fontWeight: FontWeight.w700,
          fontSize: 11.sp,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
