import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/membership/membership_cubit.dart';
import 'package:clicks_user/features/membership/membership_models.dart';
import 'package:clicks_user/features/services/service_request_sheet.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  String? _selectedServiceType;

  static const List<_ServiceOption> _services = [
    _ServiceOption(
      serviceType: 'Battery Change',
      titleKey: 'services.battery_change',
      icon: Icons.battery_charging_full_outlined,
    ),
    _ServiceOption(
      serviceType: 'Oil Change',
      titleKey: 'services.oil_change',
      icon: Icons.water_drop_outlined,
    ),
    _ServiceOption(
      serviceType: 'Full Service',
      titleKey: 'services.full_service',
      icon: Icons.build_outlined,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Interior',
      titleKey: 'services.car_wash_interior',
      icon: Icons.airline_seat_recline_normal_outlined,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Exterior',
      titleKey: 'services.car_wash_exterior',
      icon: Icons.local_car_wash_outlined,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Full',
      titleKey: 'services.car_wash_full',
      icon: Icons.directions_car_outlined,
    ),
    _ServiceOption(
      serviceType: 'Tyre Change',
      titleKey: 'services.tire_change',
      icon: Icons.tire_repair,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Full Polish',
      titleKey: 'services.car_wash_full_polish',
      icon: Icons.auto_awesome_outlined,
    ),
    _ServiceOption(
      serviceType: 'Car Tinting',
      titleKey: 'services.car_tinting',
      icon: Icons.layers_outlined,
    ),
    _ServiceOption(
      serviceType: 'Breakdown Vehicle',
      titleKey: 'services.breakdown_vehicle',
      icon: Icons.car_crash_outlined,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final selectedService = _services.where(
      (service) => service.serviceType == _selectedServiceType,
    );

    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(title: 'services.title'.tr()),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(16.w, 18.h, 16.w, 20.h),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'services.heading'.tr(),
                      style: TextStyles.font24Medium.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 20.sp,
                      ),
                    ),
                    SizedBox(height: 8.h),
                    Text(
                      'services.description'.tr(),
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: ColorsManager.greyColor,
                        height: 1.45,
                      ),
                    ),
                    SizedBox(height: 20.h),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        mainAxisSpacing: 12.h,
                        crossAxisSpacing: 12.w,
                        mainAxisExtent: 148.h,
                      ),
                      itemCount: _services.length,
                      itemBuilder: (context, index) {
                        final service = _services[index];
                        final isSelected =
                            service.serviceType == _selectedServiceType;

                        return BlocBuilder<MembershipCubit, MembershipState>(
                          builder: (context, membership) {
                            final cover = membership.enabled
                                ? membership.coverFor(service.serviceType)
                                : MembershipCover.none;
                            return _ServiceCard(
                              service: service,
                              isSelected: isSelected,
                              cover: cover,
                              onTap: () {
                                setState(() {
                                  _selectedServiceType = service.serviceType;
                                });
                              },
                            );
                          },
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
            Container(
              padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 16.h),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: ColorsManager.border)),
              ),
              child: SizedBox(
                width: double.infinity,
                height: 50.h,
                child: ElevatedButton(
                  onPressed:
                      selectedService.isEmpty
                          ? null
                          : () {
                            openServiceRequestBottomSheet(
                              context,
                              serviceType: selectedService.first.serviceType,
                              serviceLabel: selectedService.first.titleKey.tr(),
                            );
                          },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ColorsManager.mainColor,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    disabledBackgroundColor: Colors.grey.shade300,
                    disabledForegroundColor: Colors.grey.shade600,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10.r),
                    ),
                  ),
                  child: Text(
                    selectedService.isEmpty
                        ? 'services.request_service'.tr()
                        : 'services.request_service_named'.tr(namedArgs: {
                            'service': selectedService.first.titleKey.tr(),
                          }),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  final _ServiceOption service;
  final bool isSelected;
  final MembershipCover cover;
  final VoidCallback onTap;

  const _ServiceCard({
    required this.service,
    required this.isSelected,
    required this.cover,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final titleColor =
        isSelected ? ColorsManager.mainColor : ColorsManager.blackColor;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14.r),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
          padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
          decoration: BoxDecoration(
            color: isSelected ? ColorsManager.wash : ColorsManager.card,
            borderRadius: BorderRadius.circular(14.r),
            border: Border.all(
              color: isSelected
                  ? ColorsManager.mainColor
                  : ColorsManager.cardBorder,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40.w,
                    height: 40.w,
                    decoration: BoxDecoration(
                      color: isSelected
                          ? ColorsManager.mainColor.withValues(alpha: 0.10)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(11.r),
                      border: Border.all(color: ColorsManager.cardBorder),
                    ),
                    child: Icon(
                      service.icon,
                      color: isSelected
                          ? ColorsManager.mainColor
                          : ColorsManager.greyColor,
                      size: 21.sp,
                    ),
                  ),
                  if (isSelected) ...[
                    const Spacer(),
                    Icon(
                      Icons.check_circle_rounded,
                      color: ColorsManager.mainColor,
                      size: 22.sp,
                    ),
                  ],
                ],
              ),
              SizedBox(height: 10.h),
              Text(
                service.titleKey.tr(),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyles.font14Medium.copyWith(
                  color: titleColor,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                  fontSize: 13.5.sp,
                ),
              ),
              if (cover.kind != MembershipCoverKind.none) ...[
                SizedBox(height: 6.h),
                Container(
                  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 3.h),
                  decoration: BoxDecoration(
                    color: ColorsManager.mainColor.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(6.r),
                  ),
                  child: Text(
                    cover.kind == MembershipCoverKind.included
                        ? 'membership.pill_included'.tr(namedArgs: {
                            'plan': cover.planName,
                          })
                        : 'membership.pill_discount'.tr(namedArgs: {
                            'percent': '${cover.discountPercent}',
                            'plan': cover.planName,
                          }),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyles.font14RegularGrey.copyWith(
                      color: ColorsManager.mainColor,
                      fontSize: 10.sp,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ServiceOption {
  final String serviceType;
  final String titleKey;
  final IconData icon;

  const _ServiceOption({
    required this.serviceType,
    required this.titleKey,
    required this.icon,
  });
}
