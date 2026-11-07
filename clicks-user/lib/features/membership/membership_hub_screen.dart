import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/membership/membership_api.dart';
import 'package:clicks_user/features/membership/membership_cubit.dart';
import 'package:clicks_user/features/membership/membership_models.dart';
import 'package:clicks_user/features/membership/membership_ui.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class MembershipHubScreen extends StatefulWidget {
  const MembershipHubScreen({super.key});

  @override
  State<MembershipHubScreen> createState() => _MembershipHubScreenState();
}

class _MembershipHubScreenState extends State<MembershipHubScreen> {
  @override
  void initState() {
    super.initState();
    context.read<MembershipCubit>().load();
  }

  Future<void> _cancel(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('membership.cancel_title'.tr()),
        content: Text('membership.cancel_body'.tr()),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('membership.keep'.tr()),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              'membership.cancel'.tr(),
              style: const TextStyle(color: ColorsManager.mainColor),
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await MembershipApi.cancel(id);
      if (!mounted) return;
      await context.read<MembershipCubit>().load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: ClicksAppHeader(
        title: 'membership.title'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: BlocBuilder<MembershipCubit, MembershipState>(
        builder: (context, state) {
          if (state.loading) {
            return Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            );
          }
          if (!state.enabled) {
            return Center(child: Text('membership.unavailable'.tr()));
          }
          final active = state.active;
          final expired = state.mine.where((s) => s.isExpired).toList();
          if (active == null) {
            return _EmptyHub(
              renew: expired.isNotEmpty,
              onChoose: () {
                if (expired.isNotEmpty) {
                  context.read<MembershipCubit>().setInterval(
                        expired.first.interval,
                      );
                }
                context.toNamed(Routes.membershipPlans);
              },
            );
          }
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 16.h),
                  children: [
                    _ActiveCard(membership: active),
                    SizedBox(height: 8.h),
                    _HubRow(
                      label: 'membership.renew_plan'.tr(),
                      onTap: () {
                        context.read<MembershipCubit>().setInterval(
                              active.interval,
                            );
                        context.toNamed(Routes.membershipPlans);
                      },
                    ),
                  ],
                ),
              ),
              MembershipStickyCta(
                label: 'membership.cancel'.tr(),
                outlined: true,
                onPressed: () => _cancel(active.id),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EmptyHub extends StatelessWidget {
  const _EmptyHub({required this.renew, required this.onChoose});

  final bool renew;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Padding(
            padding: EdgeInsets.fromLTRB(24.w, 32.h, 24.w, 16.h),
            child: Column(
              children: [
                Container(
                  width: 72.w,
                  height: 72.w,
                  decoration: const BoxDecoration(
                    color: ColorsManager.wash,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.workspace_premium_outlined,
                    color: ColorsManager.mainColor,
                    size: 34.sp,
                  ),
                ),
                SizedBox(height: 20.h),
                Text(
                  'membership.hub_empty_title'.tr(),
                  textAlign: TextAlign.center,
                  style: TextStyles.font20Bold,
                ),
                SizedBox(height: 8.h),
                Text(
                  'membership.hub_empty_body'.tr(),
                  textAlign: TextAlign.center,
                  style: TextStyles.font14RegularGrey.copyWith(
                    color: const Color(0xFF667085),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ),
        MembershipStickyCta(
          label: renew ? 'membership.renew'.tr() : 'membership.choose_plan'.tr(),
          onPressed: onChoose,
        ),
      ],
    );
  }
}

class _ActiveCard extends StatelessWidget {
  const _ActiveCard({required this.membership});

  final CustomerMembership membership;

  @override
  Widget build(BuildContext context) {
    final vehicleBits = [
      if ((membership.vehiclePlate ?? '').isNotEmpty) membership.vehiclePlate!,
    ];
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(18.w, 18.h, 18.w, 16.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFD0D5DD)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          MembershipBadge(
            label: membership.planCode.toUpperCase().isEmpty
                ? membership.planName.toUpperCase()
                : membership.planCode.toUpperCase(),
          ),
          SizedBox(height: 12.h),
          Text(
            membership.planName,
            style: TextStyles.font20Bold.copyWith(fontSize: 24.sp),
          ),
          SizedBox(height: 4.h),
          Text(
            priceLine(membership.priceQar, membership.interval),
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF667085),
            ),
          ),
          if (vehicleBits.isNotEmpty) ...[
            SizedBox(height: 8.h),
            Text(
              vehicleBits.join(' · '),
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF344054),
              ),
            ),
          ],
          if ((membership.endDate ?? '').isNotEmpty) ...[
            SizedBox(height: 4.h),
            Text(
              'membership.renews'.tr(namedArgs: {
                'date': _fmt(membership.endDate),
              }),
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF667085),
              ),
            ),
          ],
          SizedBox(height: 12.h),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
            decoration: BoxDecoration(
              color: const Color(0xFFECFDF3),
              borderRadius: BorderRadius.circular(20.r),
            ),
            child: Text(
              'membership.active'.tr(),
              style: TextStyles.font12RegularBlack.copyWith(
                color: const Color(0xFF039855),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (membership.included.isNotEmpty) ...[
            SizedBox(height: 18.h),
            for (final row in membership.included) _UsageRow(membership: membership, row: row),
          ],
        ],
      ),
    );
  }

  String _fmt(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    try {
      return DateFormat.yMMMd().format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso;
    }
  }
}

class _UsageRow extends StatelessWidget {
  const _UsageRow({required this.membership, required this.row});

  final CustomerMembership membership;
  final MembershipIncluded row;

  @override
  Widget build(BuildContext context) {
    final used = membership.usage
        .where((u) =>
            (row.bucket.isNotEmpty && u.bucket == row.bucket) ||
            row.serviceTypes.contains(u.serviceType))
        .fold<int>(0, (sum, u) => sum + u.used);
    final quota = row.quota <= 0 ? 1 : row.quota;
    final progress = (used / quota).clamp(0.0, 1.0);
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'membership.used_of'.tr(namedArgs: {
              'label': includedServiceName(row),
              'used': '$used',
              'quota': '$quota',
            }),
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF667085),
            ),
          ),
          SizedBox(height: 8.h),
          ClipRRect(
            borderRadius: BorderRadius.circular(4.r),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6.h,
              backgroundColor: const Color(0xFFE4E7EC),
              color: ColorsManager.mainColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _HubRow extends StatelessWidget {
  const _HubRow({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: EdgeInsets.symmetric(horizontal: 4.w, vertical: 18.h),
          decoration: const BoxDecoration(
            border: Border(
              top: BorderSide(color: Color(0xFFEAECF0)),
              bottom: BorderSide(color: Color(0xFFEAECF0)),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyles.font16RegularBlack.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: ColorsManager.listTileArrowForward,
                size: 22.sp,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
