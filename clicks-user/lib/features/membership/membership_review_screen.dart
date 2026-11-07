import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/routing/app_page_route.dart';
import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/home/skipcash_checkout_screen.dart';
import 'package:clicks_user/features/membership/membership_api.dart';
import 'package:clicks_user/features/membership/membership_cubit.dart';
import 'package:clicks_user/features/membership/membership_models.dart';
import 'package:clicks_user/features/membership/membership_ui.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:clicks_user/features/my_cars/models/car_response_model.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class MembershipReviewArgs {
  final String planId;
  final String interval;

  const MembershipReviewArgs({required this.planId, required this.interval});
}

class MembershipReviewScreen extends StatefulWidget {
  const MembershipReviewScreen({super.key, required this.args});

  final MembershipReviewArgs args;

  @override
  State<MembershipReviewScreen> createState() => _MembershipReviewScreenState();
}

class _MembershipReviewScreenState extends State<MembershipReviewScreen> {
  String? _vehicleId;
  var _paying = false;

  @override
  void initState() {
    super.initState();
    final cars = context.read<MyCarsCubit>();
    if (cars.cars.isEmpty) {
      cars.getCars();
    } else {
      _vehicleId = cars.cars.first.sId;
    }
  }

  MembershipPlan? _plan(MembershipState state) {
    for (final plan in state.plans) {
      if (plan.id == widget.args.planId) return plan;
    }
    return null;
  }

  Future<void> _pay(MembershipPlan plan) async {
    if (!plan.canCheckout) {
      AppSnackBars.errorSnackBar('membership.checkout_preview_unavailable'.tr());
      return;
    }
    final vehicleId = _vehicleId;
    if (vehicleId == null || vehicleId.isEmpty) {
      AppSnackBars.errorSnackBar('membership.pick_vehicle'.tr());
      return;
    }
    setState(() => _paying = true);
    try {
      final session = await MembershipApi.checkout(
        planId: plan.id,
        interval: widget.args.interval,
        vehicleId: vehicleId,
      );
      if (!mounted) return;
      if (session.alreadyPaid) {
        await context.read<MembershipCubit>().load();
        if (!mounted) return;
        Navigator.of(context).popUntil(
          (route) => route.settings.name == Routes.membershipHub || route.isFirst,
        );
        return;
      }
      final payUrl = session.payUrl;
      final subId = session.subscriptionId ?? '';
      if (payUrl == null || payUrl.isEmpty || subId.isEmpty) {
        AppSnackBars.errorSnackBar('membership.pay_failed'.tr());
        return;
      }
      final arabic = context.locale.languageCode == 'ar';
      final sku = plan.skuFor(widget.args.interval);
      final paid = await Navigator.of(context).push<bool>(
        AppPageRoute(
          page: SkipcashCheckoutScreen(
            args: SkipcashCheckoutArgs(
              jobId: '',
              payUrl: payUrl,
              returnUrl: session.returnUrl ?? '',
              // Stop polling once the payment is settled either way; a paid
              // duplicate is reported below instead of looking like success.
              checkPaid: () async =>
                  (await MembershipApi.status(subId))?.isSettled ?? false,
              summaryTitle: 'membership.review_plan'.tr(
                namedArgs: {'plan': plan.localizedName(arabic)},
              ),
              summaryAmount: sku != null
                  ? priceLine(sku.priceQar, widget.args.interval)
                  : null,
            ),
          ),
        ),
      );
      if (paid == true && mounted) {
        final result = await MembershipApi.status(subId);
        if (!mounted) return;
        if (result != null && result.isPaidDuplicate) {
          AppSnackBars.errorSnackBar(
            result.message ?? 'membership.paid_duplicate'.tr(),
          );
        }
        await context.read<MembershipCubit>().load();
        if (!mounted) return;
        Navigator.of(context).popUntil(
          (route) => route.settings.name == Routes.membershipHub || route.isFirst,
        );
      } else if (paid == false && mounted) {
        AppSnackBars.errorSnackBar('membership.pay_failed'.tr());
      }
    } catch (err) {
      if (mounted) {
        final msg = err.toString().replaceFirst('Exception: ', '');
        if (msg.toUpperCase().contains('SKIPCASH')) {
          AppSnackBars.errorSnackBar('membership.skipcash_disabled'.tr());
        } else {
          AppSnackBars.errorSnackBar(msg);
        }
      }
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final arabic = context.locale.languageCode == 'ar';
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: ClicksAppHeader(
        title: 'membership.review_title'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: BlocBuilder<MembershipCubit, MembershipState>(
        builder: (context, state) {
          final plan = _plan(state);
          final sku = plan?.skuFor(widget.args.interval);
          final benefits = plan != null && sku != null
              ? planBenefitLines(plan, sku)
              : const <String>[];
          final canCheckout = plan != null &&
              plan.canCheckout &&
              !state.previewCatalog &&
              state.skipcashEnabled;
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: EdgeInsets.fromLTRB(20.w, 8.h, 20.w, 16.h),
                  children: [
                    if (state.previewCatalog) ...[
                      const MembershipPreviewBanner(),
                      SizedBox(height: 16.h),
                    ] else if (!state.skipcashEnabled) ...[
                      const MembershipSkipcashBanner(),
                      SizedBox(height: 16.h),
                    ],
                    if (plan != null && sku != null)
                      _SummaryCard(
                        planName: plan.localizedName(arabic),
                        price: priceLine(sku.priceQar, widget.args.interval),
                        interval: widget.args.interval,
                        vehicleId: _vehicleId,
                        onVehicle: (id) => setState(() => _vehicleId = id),
                      ),
                    if (benefits.isNotEmpty) ...[
                      SizedBox(height: 20.h),
                      for (final line in benefits)
                        MembershipBenefitRow(label: line),
                    ],
                    SizedBox(height: 8.h),
                    Text(
                      'membership.skipcash_note'.tr(),
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: const Color(0xFF667085),
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              MembershipStickyCta(
                label: plan != null && sku != null
                    ? 'membership.pay_amount'.tr(namedArgs: {
                        'price': '${sku.priceQar}',
                      })
                    : 'membership.pay'.tr(),
                loading: _paying,
                enabled: canCheckout && !_paying,
                onPressed: plan == null || !canCheckout
                    ? null
                    : () => _pay(plan),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.planName,
    required this.price,
    required this.interval,
    required this.vehicleId,
    required this.onVehicle,
  });

  final String planName;
  final String price;
  final String interval;
  final String? vehicleId;
  final ValueChanged<String?> onVehicle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 8.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: const Color(0xFFD0D5DD)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'membership.review_plan'.tr(namedArgs: {'plan': planName}),
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF344054),
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6.h),
          Text(
            price,
            style: TextStyles.font20Bold.copyWith(fontSize: 26.sp),
          ),
          SizedBox(height: 16.h),
          Text(
            'membership.vehicle'.tr(),
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF667085),
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6.h),
          BlocBuilder<MyCarsCubit, MyCarsState>(
            builder: (context, carsState) {
              final cars = context.read<MyCarsCubit>().cars;
              if (cars.isNotEmpty && vehicleId == null) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  onVehicle(cars.first.sId);
                });
              }
              if (cars.isEmpty) {
                return Padding(
                  padding: EdgeInsets.only(bottom: 12.h),
                  child: Text('membership.no_vehicles'.tr()),
                );
              }
              final value = cars.any((c) => c.sId == vehicleId)
                  ? vehicleId
                  : cars.first.sId;
              return DropdownButtonFormField<String>(
                value: value,
                icon: Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: ColorsManager.greyColor,
                ),
                decoration: const InputDecoration(
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
                items: [
                  for (final car in cars)
                    DropdownMenuItem(
                      value: car.sId,
                      child: Text(_carLabel(car)),
                    ),
                ],
                onChanged: onVehicle,
              );
            },
          ),
          Divider(height: 20.h, color: const Color(0xFFEAECF0)),
          _MetaLine(
            label: 'membership.review_start'.tr(),
            value: 'membership.review_start_today'.tr(),
          ),
          SizedBox(height: 8.h),
          _MetaLine(
            label: 'membership.review_renews_label'.tr(),
            value: interval == 'year'
                ? 'membership.review_renews_year'.tr()
                : 'membership.review_renews_month'.tr(),
          ),
          SizedBox(height: 8.h),
        ],
      ),
    );
  }

  String _carLabel(CarResponseModel car) {
    final make = car.vehicleMake?.makeName ?? '';
    final model = car.vehicleModel?.modelName ?? '';
    final plate = car.plateNumber ?? '';
    return [make, model, plate].where((s) => s.isNotEmpty).join(' ');
  }
}

class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: TextStyles.font14RegularGrey.copyWith(
            color: const Color(0xFF667085),
          ),
        ),
        SizedBox(width: 6.w),
        Expanded(
          child: Text(
            value,
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF101828),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}
