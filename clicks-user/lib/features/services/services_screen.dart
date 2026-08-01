import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/services/service_request_sheet.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
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
      icon: Icons.battery_charging_full,
    ),
    _ServiceOption(
      serviceType: 'Oil Change',
      titleKey: 'services.oil_change',
      icon: Icons.opacity,
    ),
    _ServiceOption(
      serviceType: 'Full Service',
      titleKey: 'services.full_service',
      icon: Icons.build,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Interior',
      titleKey: 'services.car_wash_interior',
      icon: Icons.event_seat,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Exterior',
      titleKey: 'services.car_wash_exterior',
      icon: Icons.local_car_wash,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Full',
      titleKey: 'services.car_wash_full',
      icon: Icons.directions_car,
    ),
    _ServiceOption(
      serviceType: 'Tyre Change',
      titleKey: 'services.tire_change',
      icon: Icons.donut_large,
    ),
    _ServiceOption(
      serviceType: 'Car Wash - Full Polish',
      titleKey: 'services.car_wash_full_polish',
      icon: Icons.star,
    ),
    _ServiceOption(
      serviceType: 'Car Tinting',
      titleKey: 'services.car_tinting',
      icon: Icons.gradient,
    ),
    _ServiceOption(
      serviceType: 'Breakdown Vehicle',
      titleKey: 'services.breakdown_vehicle',
      icon: Icons.report_problem,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final selectedService = _services.where(
      (service) => service.serviceType == _selectedServiceType,
    );

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shape: const Border(
          bottom: BorderSide(color: Color(0xFFD0D5DD), width: 1),
        ),
        centerTitle: false,
        title: Text(
          'services.title'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),
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
                      style: TextStyles.font14RegularGrey,
                    ),
                    SizedBox(height: 18.h),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        mainAxisSpacing: 12.h,
                        crossAxisSpacing: 12.w,
                        childAspectRatio: 1.14,
                      ),
                      itemCount: _services.length,
                      itemBuilder: (context, index) {
                        final service = _services[index];
                        final isSelected =
                            service.serviceType == _selectedServiceType;

                        return _ServiceCard(
                          service: service,
                          isSelected: isSelected,
                          onTap: () {
                            setState(() {
                              _selectedServiceType = service.serviceType;
                            });
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
                  child: Text('services.request_service'.tr()),
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
  final VoidCallback onTap;

  const _ServiceCard({
    required this.service,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final foreground = isSelected ? ColorsManager.mainColor : Colors.black87;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12.r),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: EdgeInsets.all(14.w),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFFEF2F2) : Colors.white,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: isSelected ? ColorsManager.mainColor : ColorsManager.border,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 42.w,
                  height: 42.w,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? ColorsManager.mainColor.withValues(alpha: 0.1)
                        : const Color(0xFFF2F4F7),
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                  child: Icon(service.icon, color: foreground, size: 22.sp),
                ),
                const Spacer(),
                Icon(
                  isSelected
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                  color: isSelected
                      ? ColorsManager.mainColor
                      : ColorsManager.hintColor,
                  size: 20.sp,
                ),
              ],
            ),
            const Spacer(),
            Text(
              service.titleKey.tr(),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyles.font14RegularGrey.copyWith(
                color: foreground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
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
