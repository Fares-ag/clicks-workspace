import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:clicks_user/features/my_cars/models/car_response_model.dart';
import 'package:clicks_user/features/services/service_request_api.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:clicks_user/features/welcome/logic/services/welcome_service.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:geolocator/geolocator.dart';

Future<void> openServiceRequestBottomSheet(
  BuildContext context, {
  required String serviceType,
  String? serviceLabel,
}) async {
  context.read<MyCarsCubit>().selectCar(null);
  context.read<MyCarsCubit>().getCars();

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
    ),
    builder: (ctx) {
      return _ServiceRequestSheet(
        serviceType: serviceType,
        serviceLabel: serviceLabel,
      );
    },
  );
}

class _ServiceRequestSheet extends StatefulWidget {
  final String serviceType;
  final String? serviceLabel;

  const _ServiceRequestSheet({
    required this.serviceType,
    this.serviceLabel,
  });

  @override
  State<_ServiceRequestSheet> createState() => _ServiceRequestSheetState();
}

class _ServiceRequestSheetState extends State<_ServiceRequestSheet> {
  String _timing = 'immediate';
  DateTime? _scheduledFor;
  bool _submitting = false;

  Future<void> _pickSchedule() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(hours: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))),
    );
    if (time == null || !mounted) return;
    setState(() {
      _scheduledFor = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      _timing = 'scheduled';
    });
  }

  Future<void> _submit({required bool skipVehicle}) async {
    if (_submitting) return;
    if (_timing == 'scheduled' && _scheduledFor == null) {
      AppSnackBars.errorSnackBar('services.pick_schedule'.tr());
      return;
    }
    if (_timing == 'scheduled' &&
        _scheduledFor != null &&
        _scheduledFor!.isBefore(DateTime.now())) {
      AppSnackBars.errorSnackBar('services.schedule_in_future'.tr());
      return;
    }

    String? vehicleId;
    if (!skipVehicle) {
      final selected = context.read<MyCarsCubit>().selectedCar;
      if (selected == null) {
        AppSnackBars.errorSnackBar('home.select_vehicle'.tr());
        return;
      }
      vehicleId = selected.sId;
    }

    setState(() => _submitting = true);
    try {
      Position position;
      final sos = context.read<SosCubit>();
      try {
        position = await WelcomeService.determinePosition().timeout(
          const Duration(seconds: 12),
        );
      } catch (_) {
        if (sos.lastKnownPosition != null) {
          position = sos.lastKnownPosition!;
        } else {
          throw Exception(
            'Failed to get location. Allow location access and try again.',
          );
        }
      }
      sos.lastKnownPosition = position;

      final result = await ServiceRequestApi.create(
        serviceType: widget.serviceType,
        timing: _timing,
        latitude: position.latitude,
        longitude: position.longitude,
        customerVehicleId: vehicleId,
        skipVehicle: skipVehicle,
        scheduledFor: _scheduledFor,
      );

      final sr = result['service_request'];
      final id = sr is Map
          ? (sr['id'] ?? sr['_id'])?.toString()
          : null;
      if (id == null || id.isEmpty) {
        throw Exception('Invalid service request response');
      }

      if (!mounted) return;
      Navigator.pop(context);
      context.toNamed(
        Routes.serviceWaiting,
        arguments: ServiceWaitingArgs(
          requestId: id,
          serviceType: widget.serviceType,
          serviceLabel: widget.serviceLabel,
          timing: _timing,
          scheduledFor: _scheduledFor,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      AppSnackBars.errorSnackBar(e.toString().replaceFirst('Exception: ', ''));
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16.w,
          8.h,
          16.w,
          16.h + MediaQuery.of(context).viewInsets.bottom,
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
                      'services.confirm_vehicle'.tr(),
                      style: TextStyles.font16RegularBlack.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 18.sp,
                      ),
                    ),
                  ),
                  InkWell(
                    onTap: () => Navigator.pop(context),
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
                    '${'home.selected_service'.tr()}: ${widget.serviceLabel ?? widget.serviceType}',
                    style: TextStyles.font12RegularGrey.copyWith(
                      color: ColorsManager.mainColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
              SizedBox(height: 16.h),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'services.when_needed'.tr(),
                  style: TextStyles.font14RegularGrey.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
              ),
              SizedBox(height: 8.h),
              Row(
                children: [
                  Expanded(
                    child: _TimingChip(
                      label: 'services.timing_now'.tr(),
                      selected: _timing == 'immediate',
                      onTap: () => setState(() {
                        _timing = 'immediate';
                        _scheduledFor = null;
                      }),
                    ),
                  ),
                  SizedBox(width: 10.w),
                  Expanded(
                    child: _TimingChip(
                      label: _scheduledFor == null
                          ? 'services.timing_schedule'.tr()
                          : DateFormat('MMM d, h:mm a')
                              .format(_scheduledFor!),
                      selected: _timing == 'scheduled',
                      onTap: _pickSchedule,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 14.h),
              Row(
                children: [
                  Text(
                    'home.select_vehicle'.tr(),
                    style: TextStyles.font14RegularGrey.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
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
                  final cars = context.read<MyCarsCubit>().cars;
                  final selected = context.read<MyCarsCubit>().selectedCar;
                  if (state is LoadingGetMyCarsState && cars.isEmpty) {
                    return Padding(
                      padding: EdgeInsets.symmetric(vertical: 24.h),
                      child: CircularProgressIndicator(
                        color: ColorsManager.mainColor,
                      ),
                    );
                  }
                  if (cars.isEmpty) {
                    return Padding(
                      padding: EdgeInsets.symmetric(vertical: 16.h),
                      child: Text(
                        'home.no_vehicles_found'.tr(),
                        style: TextStyles.font14RegularGrey,
                      ),
                    );
                  }
                  return Column(
                    children: cars
                        .map(
                          (car) => Padding(
                            padding: EdgeInsets.only(bottom: 8.h),
                            child: _VehicleTile(
                              vehicle: car,
                              selected: selected?.sId == car.sId,
                              onTap: () =>
                                  context.read<MyCarsCubit>().selectCar(car),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              SizedBox(height: 8.h),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'home.location_note'.tr(),
                  style: TextStyles.font12RegularGrey,
                ),
              ),
              SizedBox(height: 16.h),
              if (_submitting)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 12.h),
                  child: CircularProgressIndicator(
                    color: ColorsManager.mainColor,
                  ),
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _submit(skipVehicle: true),
                        style: OutlinedButton.styleFrom(
                          padding: EdgeInsets.symmetric(vertical: 14.h),
                          side: BorderSide(color: ColorsManager.border),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10.r),
                          ),
                        ),
                        child: Text(
                          'services.skip_vehicle'.tr(),
                          style: TextStyles.font14Medium
                              .copyWith(color: Colors.black87),
                        ),
                      ),
                    ),
                    SizedBox(width: 12.w),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => _submit(skipVehicle: false),
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
                          'services.confirm_and_request'.tr(),
                          style: TextStyles.font14Medium
                              .copyWith(color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimingChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TimingChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10.r),
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 12.h, horizontal: 10.w),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFFEF2F2) : Colors.white,
          borderRadius: BorderRadius.circular(10.r),
          border: Border.all(
            color: selected ? ColorsManager.mainColor : ColorsManager.border,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyles.font12RegularGrey.copyWith(
            color: selected ? ColorsManager.mainColor : Colors.black87,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _VehicleTile extends StatelessWidget {
  final CarResponseModel vehicle;
  final bool selected;
  final VoidCallback onTap;

  const _VehicleTile({
    required this.vehicle,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final make = vehicle.vehicleMake?.makeName ?? '';
    final model = vehicle.vehicleModel?.modelName ?? '';
    return InkWell(
      borderRadius: BorderRadius.circular(12.r),
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.all(12.w),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12.r),
          border: Border.all(
            color: selected ? ColorsManager.mainColor : ColorsManager.border,
            width: selected ? 1.5 : 1,
          ),
          color: selected ? const Color(0xFFFEF2F2) : Colors.white,
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.check_circle : Icons.radio_button_unchecked,
              color: selected
                  ? ColorsManager.mainColor
                  : ColorsManager.hintColor,
              size: 22.sp,
            ),
            SizedBox(width: 10.w),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$make $model'.trim(),
                    style: TextStyles.font14Medium.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'home.plate_label'
                        .tr(namedArgs: {'plate': vehicle.plateNumber ?? '—'}),
                    style: TextStyles.font12RegularGrey,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
