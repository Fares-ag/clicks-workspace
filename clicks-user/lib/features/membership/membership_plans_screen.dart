import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/membership/membership_cubit.dart';
import 'package:clicks_user/features/membership/membership_models.dart';
import 'package:clicks_user/features/membership/membership_ui.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class MembershipPlansScreen extends StatefulWidget {
  const MembershipPlansScreen({super.key});

  @override
  State<MembershipPlansScreen> createState() => _MembershipPlansScreenState();
}

class _MembershipPlansScreenState extends State<MembershipPlansScreen> {
  String? _selectedPlanId;

  @override
  void initState() {
    super.initState();
    context.read<MembershipCubit>().load();
  }

  String? _resolvedPlanId(List<MembershipPlan> plans) {
    if (plans.any((p) => p.id == _selectedPlanId)) return _selectedPlanId;
    for (final plan in plans) {
      if (isRecommendedPlan(plan)) return plan.id;
    }
    return plans.isEmpty ? null : plans.last.id;
  }

  @override
  Widget build(BuildContext context) {
    final arabic = context.locale.languageCode == 'ar';
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: ClicksAppHeader(
        title: 'membership.title'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: BlocBuilder<MembershipCubit, MembershipState>(
        builder: (context, state) {
          final selectedId = _resolvedPlanId(state.plans);
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.fromLTRB(20.w, 8.h, 20.w, 16.h),
                  children: [
                    Text(
                      'membership.plans_title'.tr(),
                      style: TextStyles.font20Bold.copyWith(
                        fontSize: 26.sp,
                        height: 1.2,
                      ),
                    ),
                    SizedBox(height: 6.h),
                    Text(
                      'membership.plans_subtitle'.tr(),
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: const Color(0xFF667085),
                        height: 1.4,
                      ),
                    ),
                    if (state.previewCatalog) ...[
                      const MembershipPreviewBanner(),
                      SizedBox(height: 16.h),
                    ],
                    SizedBox(height: 20.h),
                    MembershipSegmentedToggle(
                      interval: state.interval,
                      onChanged: context.read<MembershipCubit>().setInterval,
                    ),
                    SizedBox(height: 20.h),
                    for (final plan in state.plans)
                      _PlanCard(
                        plan: plan,
                        interval: state.interval,
                        arabic: arabic,
                        selected: plan.id == selectedId,
                        onSelect: () => setState(() => _selectedPlanId = plan.id),
                      ),
                  ],
                ),
              ),
              MembershipStickyCta(
                label: 'membership.continue'.tr(),
                enabled: selectedId != null,
                onPressed: () {
                  final id = selectedId;
                  if (id == null) return;
                  context.toNamed(
                    Routes.membershipReview,
                    arguments: {
                      'planId': id,
                      'interval': state.interval,
                    },
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.interval,
    required this.arabic,
    required this.selected,
    required this.onSelect,
  });

  final MembershipPlan plan;
  final String interval;
  final bool arabic;
  final bool selected;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final sku = plan.skuFor(interval);
    if (sku == null) return const SizedBox.shrink();
    final recommended = isRecommendedPlan(plan);
    final highlighted = selected;
    final wash = selected || recommended;
    final benefits = planBenefitLines(plan, sku);

    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onSelect,
          borderRadius: BorderRadius.circular(16.r),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 12.h),
            decoration: BoxDecoration(
              color: wash ? ColorsManager.wash : Colors.white,
              borderRadius: BorderRadius.circular(16.r),
              border: Border.all(
                color: selected
                    ? ColorsManager.mainColor
                    : recommended
                        ? ColorsManager.mainColor.withValues(alpha: 0.45)
                        : const Color(0xFFD0D5DD),
                width: selected ? 1.6 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        plan.localizedName(arabic),
                        style: TextStyles.font18Bold.copyWith(
                          color: highlighted
                              ? ColorsManager.mainColor
                              : Colors.black,
                        ),
                      ),
                    ),
                    Text(
                      priceLine(sku.priceQar, interval),
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: highlighted
                            ? ColorsManager.mainColor
                            : const Color(0xFF667085),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(width: 10.w),
                    _RadioMark(selected: selected, accent: wash),
                  ],
                ),
                if (recommended) ...[
                  SizedBox(height: 10.h),
                  MembershipBadge(label: 'membership.recommended'.tr()),
                ],
                SizedBox(height: 14.h),
                Text(
                  'membership.whats_covered'.tr(),
                  style: TextStyles.font14RegularGrey.copyWith(
                    color: const Color(0xFF344054),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 6.h),
                for (final line in benefits)
                  MembershipBenefitRow(
                    label: line,
                    emphasized: highlighted,
                  ),
                SizedBox(height: 4.h),
                Text(
                  plan.coversEmergency
                      ? 'membership.covers_emergency'.tr()
                      : 'membership.not_covered'.tr(namedArgs: {
                          'types': plan.excludedServiceTypes.join(', '),
                        }),
                  style: TextStyles.font14RegularGrey.copyWith(
                    fontSize: 12.sp,
                    color: const Color(0xFF667085),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RadioMark extends StatelessWidget {
  const _RadioMark({required this.selected, required this.accent});

  final bool selected;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    if (selected) {
      return Container(
        width: 24.w,
        height: 24.w,
        decoration: const BoxDecoration(
          color: ColorsManager.mainColor,
          shape: BoxShape.circle,
        ),
        child: Icon(Icons.check_rounded, size: 16.sp, color: Colors.white),
      );
    }
    return Container(
      width: 24.w,
      height: 24.w,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: accent ? ColorsManager.mainColor : const Color(0xFFD0D5DD),
          width: 1.6,
        ),
      ),
    );
  }
}
