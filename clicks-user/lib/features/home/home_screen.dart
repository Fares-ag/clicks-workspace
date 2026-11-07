import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:clicks_user/features/my_cars/models/car_response_model.dart';
import 'package:clicks_user/features/settings/ui/cubit/settings_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/components/clicks_logo.dart';
import '../../core/components/header_icon_button.dart';
import '../../core/helper/app_snack_bars.dart';
import '../../core/sos_services/customer_socket_service.dart';
import '../../core/theme/colors_manager.dart';
import '../../core/theme/text_styles.dart';
import 'confirm_location_sheet.dart';
import 'garage_job_card.dart';
import 'upcoming_booking_card.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(
                bottom: BorderSide(color: ColorsManager.washBorder),
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(16.w, 6.h, 16.w, 14.h),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SizedBox(
                      height: 44.h,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          const ClicksLogo(height: 24),
                          const Spacer(),
                          HeaderIconButton(
                            icon: Icons.notifications_outlined,
                            semanticsLabel: 'notifications.notifications'.tr(),
                            onTap: () => context.toNamed(Routes.notifications),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(height: 8.h),
                    Text(
                      "home.welcome".tr(),
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: ColorsManager.greyColor,
                      ),
                    ),
                    SizedBox(height: 2.h),
                    BlocBuilder<SettingsCubit, SettingsState>(
                      builder: (context, state) {
                        final p = context.read<SettingsCubit>().profile;
                        final name = p == null
                            ? ''
                            : '${p.firstName} ${p.lastName}'.trim();
                        return Text(
                          name.isEmpty ? 'Clicks' : name,
                          style: TextStyles.font20Bold.copyWith(
                            color: ColorsManager.blackColor,
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
          const _GarageSessionBanner(),
          SizedBox(height: 28.h),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.w),
            child: Column(
              children: [
                Text(
                  "home.having_emergency".tr(),
                  textAlign: TextAlign.center,
                  style: TextStyles.font28Bold.copyWith(fontSize: 26.sp),
                ),
                SizedBox(height: 6.h),
                Text(
                  "home.press_button_help".tr(),
                  textAlign: TextAlign.center,
                  style: TextStyles.font14RegularGrey.copyWith(fontSize: 14.sp),
                ),
              ],
            ),
          ),
          Expanded(
            child: Center(
              child: _SosHero(
                onTap: () {
                  openConfirmVehicleBottomSheet(
                    context,
                    null,
                    isEmergency: true,
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SosHero extends StatefulWidget {
  final VoidCallback onTap;
  const _SosHero({required this.onTap});

  @override
  State<_SosHero> createState() => _SosHeroState();
}

class _SosHeroState extends State<_SosHero>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduce = MediaQuery.of(context).disableAnimations;
    if (reduce) {
      _pulse.stop();
      _pulse.value = 0;
    } else if (!_pulse.isAnimating) {
      _pulse.repeat();
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final t = _pulse.value;
        return SizedBox(
          width: 280.w,
          height: 280.w,
          child: Stack(
            alignment: Alignment.center,
            children: [
              for (final scale in [1.32, 1.16])
                CustomPaint(
                  size: Size.square(220.w * (scale + 0.06 * t)),
                  painter: _SosPulseRingPainter(
                    color: ColorsManager.mainColor.withValues(
                      alpha: 0.14 * (1 - t * 0.45),
                    ),
                    strokeWidth: 10,
                  ),
                ),
              child!,
            ],
          ),
        );
      },
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: 220.w,
          height: 220.w,
          decoration: BoxDecoration(
            color: ColorsManager.mainColor,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: ColorsManager.mainColor.withValues(alpha: 0.28),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            "home.sos".tr(),
            style: TextStyles.font28Bold.copyWith(
              fontSize: 42.sp,
              color: Colors.white,
              letterSpacing: 1.2,
            ),
          ),
        ),
      ),
    );
  }
}

class _SosPulseRingPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;

  const _SosPulseRingPainter({
    required this.color,
    required this.strokeWidth,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.shortestSide - strokeWidth) / 2;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..color = color;
    canvas.drawCircle(center, radius, paint);
  }

  @override
  bool shouldRepaint(covariant _SosPulseRingPainter oldDelegate) {
    return color != oldDelegate.color || strokeWidth != oldDelegate.strokeWidth;
  }
}

Future<void> openConfirmVehicleBottomSheet(
  BuildContext context,
  String? serviceType, {
  bool isEmergency = true,
  String? serviceLabel,
}) async {
  context.read<MyCarsCubit>().selectCar(null);
  context.read<MyCarsCubit>().getCars();
  context.read<SosCubit>().reset();

  String? blockedVehicleId;
  try {
    final session = await SessionService.getCustomerSession();
    final fromSession = session['sos_blocked_vehicle_id']?.toString();
    if (fromSession != null && fromSession.isNotEmpty) {
      blockedVehicleId = fromSession;
    } else if (session['live_job'] is Map) {
      final cv = (session['live_job'] as Map)['customer_vehicle_id'];
      if (cv is Map) {
        blockedVehicleId = cv['_id']?.toString();
      } else if (cv != null) {
        blockedVehicleId = cv.toString();
      }
    }
  } catch (_) {}

  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
    ),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            16.w,
            8.h,
            16.w,
            16.h + MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40.w,
                  height: 4.h,
                  margin: EdgeInsets.only(bottom: 12.h),
                  decoration: BoxDecoration(
                    color: ColorsManager.border,
                    borderRadius: BorderRadius.circular(4.r),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        isEmergency
                            ? 'home.confirm_vehicle'.tr()
                            : 'services.confirm_vehicle'.tr(),
                        style: TextStyles.font16RegularBlack.copyWith(
                          fontWeight: FontWeight.w700,
                          fontSize: 18.sp,
                        ),
                      ),
                    ),
                    InkWell(
                      onTap: () => Navigator.pop(ctx),
                      borderRadius: BorderRadius.circular(20.r),
                      child: Container(
                        width: 36.w,
                        height: 36.w,
                        decoration: BoxDecoration(
                          color: ColorsManager.scaffoldColor,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(Icons.close,
                            size: 18.sp, color: ColorsManager.greyColor),
                      ),
                    ),
                  ],
                ),
                if (serviceType != null) ...[
                  SizedBox(height: 10.h),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 12.w,
                        vertical: 6.h,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(8.r),
                        border: Border.all(color: const Color(0xFFFECDCA)),
                      ),
                      child: Text(
                        '${'home.selected_service'.tr()}: ${serviceLabel ?? serviceType}',
                        style: TextStyles.font12RegularGrey.copyWith(
                          color: ColorsManager.mainColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ],
                SizedBox(height: 14.h),
                Row(
                  children: [
                    Text(
                      'home.select_vehicle'.tr(),
                      style: TextStyles.font14RegularGrey
                          .copyWith(fontWeight: FontWeight.w600, color: Colors.black87),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: () => context.toNamed(Routes.myCars),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'home.add_new_car'.tr(),
                        style: TextStyles.font14Medium.copyWith(
                          color: ColorsManager.mainColor,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 10.h),
                BlocBuilder<MyCarsCubit, MyCarsState>(
                  builder: (context, state) {
                    if (state is LoadingGetMyCarsState) {
                      return Padding(
                        padding: EdgeInsets.symmetric(vertical: 24.h),
                        child: CircularProgressIndicator(
                            color: ColorsManager.mainColor),
                      );
                    }
                    final cars = context.read<MyCarsCubit>().cars;
                    if (cars.isEmpty) {
                      return Padding(
                        padding: EdgeInsets.symmetric(vertical: 20.h),
                        child: Text(
                          'home.no_vehicles_found'.tr(),
                          style: TextStyles.font14RegularGrey,
                        ),
                      );
                    }

                    return Column(
                      children: cars.map((v) {
                        final selected =
                            context.read<MyCarsCubit>().selectedCar == v;
                        final blocked = blockedVehicleId != null &&
                            v.sId == blockedVehicleId;
                        return Padding(
                          padding: EdgeInsets.only(bottom: 10.h),
                          child: _VehicleSelectTile(
                            vehicle: v,
                            selected: selected && !blocked,
                            disabled: blocked,
                            onTap: blocked
                                ? null
                                : () =>
                                    context.read<MyCarsCubit>().selectCar(v),
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),
                SizedBox(height: 4.h),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'home.location_note'.tr(),
                    style: TextStyles.font12RegularGrey,
                  ),
                ),
                SizedBox(height: 16.h),
                BlocConsumer<SosCubit, SosState>(
                  listener: (listenerCtx, state) async {
                    if (state is SosConfirmLocation) {
                      // Confirm (and if needed, place) the pin before sending.
                      final cubit = context.read<SosCubit>();
                      final confirmed =
                          await showConfirmLocationSheet(listenerCtx, state);
                      if (confirmed == null) {
                        cubit.cancelLocationConfirm();
                        return;
                      }
                      await cubit.submitSOS(
                        latitude: confirmed.latitude,
                        longitude: confirmed.longitude,
                        accuracyM: state.accuracyM,
                        fixTime: state.fixTime,
                        pinMoved: confirmed.pinMoved,
                      );
                    } else if (state is SosInCall) {
                      // Recovered an SOS a dispatcher had already picked up.
                      context.pop();
                      context.toNamed(Routes.inCall);
                    } else if (state is SosCreated) {
                      context.pop();
                      context.toNamed(
                        Routes.timerSos,
                        arguments: {
                          'isEmergency': isEmergency,
                          'serviceType': serviceType,
                          'serviceLabel': serviceLabel,
                        },
                      );
                    } else if (state is SosError) {
                      AppSnackBars.errorSnackBar(state.message);
                    }
                  },
                  builder: (_, state) {
                    if (state is SosLoading) {
                      return Padding(
                        padding: EdgeInsets.symmetric(vertical: 12.h),
                        child: CircularProgressIndicator(
                            color: ColorsManager.mainColor),
                      );
                    }

                    return Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () {
                              context.read<SosCubit>().createSOS(
                                    serviceType: serviceType,
                                    skipVehicle: true,
                                  );
                            },
                            style: OutlinedButton.styleFrom(
                              padding: EdgeInsets.symmetric(vertical: 14.h),
                              side: BorderSide(color: ColorsManager.border),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10.r),
                              ),
                            ),
                            child: Text(
                              isEmergency
                                  ? 'home.skip_vehicle'.tr()
                                  : 'services.skip_vehicle'.tr(),
                              style: TextStyles.font14Medium
                                  .copyWith(color: Colors.black87),
                            ),
                          ),
                        ),
                        SizedBox(width: 12.w),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () {
                              final selectedCar =
                                  context.read<MyCarsCubit>().selectedCar;
                              if (selectedCar == null) return;
                              context.read<SosCubit>().createSOS(
                                    customerVehicleId: selectedCar.sId,
                                    serviceType: serviceType,
                                  );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: ColorsManager.mainColor,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: EdgeInsets.symmetric(vertical: 14.h),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10.r),
                              ),
                            ),
                            child: Text(
                              isEmergency
                                  ? 'home.confirm_and_proceed'.tr()
                                  : 'services.confirm_and_request'.tr(),
                              style: TextStyles.font14Medium
                                  .copyWith(color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _VehicleSelectTile extends StatelessWidget {
  const _VehicleSelectTile({
    required this.vehicle,
    required this.selected,
    required this.onTap,
    this.disabled = false,
  });

  final CarResponseModel vehicle;
  final bool selected;
  final VoidCallback? onTap;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final muted = disabled;
    return InkWell(
      borderRadius: BorderRadius.circular(12.r),
      onTap: onTap,
      child: Opacity(
        opacity: muted ? 0.55 : 1,
        child: Container(
        padding: EdgeInsets.all(12.w),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFFEF2F2) : Colors.white,
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: selected ? ColorsManager.mainColor : ColorsManager.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 22.w,
              height: 22.w,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected
                      ? ColorsManager.mainColor
                      : ColorsManager.border,
                  width: 2,
                ),
                color: selected ? ColorsManager.mainColor : Colors.transparent,
              ),
              child: selected
                  ? Icon(Icons.check, size: 14.sp, color: Colors.white)
                  : null,
            ),
            SizedBox(width: 12.w),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${vehicle.vehicleMake?.makeName ?? ''} ${vehicle.vehicleModel?.modelName ?? ''}'
                        .trim(),
                    style: TextStyles.font14RegularGrey.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                  SizedBox(height: 2.h),
                  Text(
                    'Year - ${vehicle.year}',
                    style: TextStyles.font12RegularGrey,
                  ),
                  Text(
                    'Plate Number - ${vehicle.plateNumber}',
                    style: TextStyles.font12RegularGrey,
                  ),
                  if (disabled) ...[
                    SizedBox(height: 4.h),
                    Text(
                      'home.vehicle_on_active_job'.tr(),
                      style: TextStyles.font12RegularGrey.copyWith(
                        color: ColorsManager.mainColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            SizedBox(width: 8.w),
            ClipRRect(
              borderRadius: BorderRadius.circular(8.r),
              child: Image.asset(
                'assets/images/car_example2.png',
                width: 88.w,
                height: 50.h,
                fit: BoxFit.cover,
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }
}

class _GarageSessionBanner extends StatefulWidget {
  const _GarageSessionBanner();

  @override
  State<_GarageSessionBanner> createState() => _GarageSessionBannerState();
}

class _GarageSessionBannerState extends State<_GarageSessionBanner> {
  Map<String, dynamic> _session = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final session = await SessionService.getCustomerSession();
      if (!mounted) return;
      setState(() => _session = session);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<SosCubit, SosState>(
      listener: (_, state) {
        if (state is JobAtGarage || state is JobGarageReady) {
          _load();
        }
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          GarageJobCard(session: _session),
          // A booking outside its active window lives here instead of
          // trapping the customer on the waiting screen (scenario 55).
          UpcomingBookingCard(session: _session),
        ],
      ),
    );
  }
}
