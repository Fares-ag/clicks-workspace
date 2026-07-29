import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:clicks_user/features/my_cars/models/car_response_model.dart';
import 'package:clicks_user/features/my_cars/models/make_response_model.dart';
import 'package:clicks_user/features/my_cars/models/model_response_model.dart';
import 'package:clicks_user/features/settings/ui/cubit/settings_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/helper/assets_manager.dart';
import '../../core/theme/text_styles.dart';

// ═══════════════════════════════════════════════════════════════════════════════
// My Cars Screen
// ═══════════════════════════════════════════════════════════════════════════════

class MyCarsScreen extends StatelessWidget {
  const MyCarsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    context.read<MyCarsCubit>().getCars();
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shape: const Border(
          bottom: BorderSide(color: Color(0xFFD0D5DD), width: 1.0),
        ),
        title: Text(
          'my_cars.my_cars'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 20.sp,
          ),
        ),
        actions: [
          InkWell(
            onTap: () => _showAddCarBottomSheet(context),
            child: Container(
              padding: EdgeInsets.only(bottom: 2.h),
              margin: EdgeInsetsDirectional.only(end: 16.w),
              decoration: const BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: ColorsManager.mainColor),
                ),
              ),
              child: Text(
                'my_cars.add_new_car'.tr(),
                style: TextStyles.font14Medium.copyWith(
                  color: ColorsManager.mainColor,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: BlocConsumer<MyCarsCubit, MyCarsState>(
          listener: (context, state) {
            if (state is SuccessDeleteMyCarsState) {
              _showDeleteSuccessScreen(context);
            } else if (state is ErrorDeleteMyCarsState) {
              AppSnackBars.errorSnackBar(state.message);
            }
          },
          builder: (context, state) {
            if (state is LoadingGetMyCarsState) {
              return const Center(child: CircularProgressIndicator());
            }

            final cars = context.read<MyCarsCubit>().cars;

            if (cars.isEmpty) {
              return _buildEmptyState(context);
            }

            return _buildCarList(context, cars);
          },
        ),
      ),
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 24.w),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'my_cars.no_cars_found'.tr(),
              textAlign: TextAlign.center,
              style: TextStyles.font16RegularBlack.copyWith(
                fontWeight: FontWeight.w600,
                fontSize: 18.sp,
              ),
            ),
            SizedBox(height: 24.h),
            Image.asset(
              AssetsManager.noCarsImage,
              width: 280.w,
              fit: BoxFit.contain,
            ),
          ],
        ),
      ),
    );
  }

  // ── Car list ─────────────────────────────────────────────────────────────────

  Widget _buildCarList(BuildContext context, List<CarResponseModel> cars) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 16.h),
      children: [
        SizedBox(height: 12.h),
        Row(
          children: [
            SvgPicture.asset(AssetsManager.carSvg, width: 22.w, height: 22.w),
            SizedBox(width: 10.w),
            Text(
              'my_cars.vehicle_details'.tr(),
              style: TextStyles.font14Medium.copyWith(
                color: const Color(0xFF252525),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        SizedBox(height: 14.h),
        ...cars.map((car) => _CarCard(car: car)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Car Card
// ═══════════════════════════════════════════════════════════════════════════════

class _CarCard extends StatefulWidget {
  const _CarCard({required this.car});
  final CarResponseModel car;

  @override
  State<_CarCard> createState() => _CarCardState();
}

class _CarCardState extends State<_CarCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: Container(
        margin: EdgeInsets.only(bottom: 12.h),
        decoration: BoxDecoration(
          color: _expanded
              ? ColorsManager.mainColor.withValues(alpha: 0.05)
              : Colors.white,
          border: Border.all(
            color: _expanded
                ? ColorsManager.mainColor.withValues(alpha: 0.35)
                : ColorsManager.border,
          ),
          borderRadius: BorderRadius.circular(12.r),
        ),
        padding: EdgeInsets.all(14.w),
        child: Column(
          children: [
            // ── Top row: info + image ──
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title + Insured badge
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              "${widget.car.vehicleMake?.makeName ?? ""} ${widget.car.vehicleModel?.modelName ?? ""}",
                              style: TextStyles.font14Medium.copyWith(
                                color: const Color(0xFF252525),
                              ),
                            ),
                          ),
                          if (widget.car.isInsured) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFECFDF3),
                                borderRadius: BorderRadius.circular(12),
                                border:
                                    Border.all(color: const Color(0xFFA7F3D0)),
                              ),
                              child: Text(
                                'my_cars.insured'.tr(),
                                style: TextStyle(
                                  fontFamily: 'HelveticaNeue',
                                  fontSize: 11.sp,
                                  fontWeight: FontWeight.w500,
                                  color: const Color(0xFF039855),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      SizedBox(height: 11.h),
                      // Details
                      Text(
                        'my_cars.year_dash'.tr(namedArgs: {'year': widget.car.year?.toString() ?? 'N/A'}),
                        style: TextStyles.font13Regular,
                      ),
                      Text(
                        'my_cars.plate_dash'.tr(namedArgs: {'plate': widget.car.plateNumber ?? 'N/A'}),
                        style: TextStyles.font13Regular,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.asset(
                    AssetsManager.carExample2Image,
                    width: 76,
                    height: 72,
                    fit: BoxFit.cover,
                  ),
                ),
              ],
            ),

            // ── Bottom row: Edit + Trash ──
            SizedBox(height: 12.h),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                GestureDetector(
                  onTap: () => _showEditCarBottomSheet(context, widget.car),
                  child: Text(
                    'common.edit'.tr(),
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w500,
                      color: const Color(0xFF252525),
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => _showDeleteCarDialog(context, widget.car),
                  child: SvgPicture.asset(
                    AssetsManager.trashSvg,
                    width: 20,
                    height: 20,
                    colorFilter: const ColorFilter.mode(
                      Color(0xFF494949),
                      BlendMode.srcIn,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Delete Car Dialog
// ═══════════════════════════════════════════════════════════════════════════════

void _showDeleteCarDialog(BuildContext context, CarResponseModel car) {
  showModalBottomSheet(
    context: context,
    useSafeArea: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Close X
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: GestureDetector(
                onTap: () => Navigator.pop(ctx),
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.grey.shade200,
                  child: const Icon(Icons.close, color: Colors.grey, size: 18),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('my_cars.delete_car_q'.tr(), style: TextStyles.font18Bold),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'my_cars.delete_confirm_msg'.tr(),
                style: TextStyles.font14RegularGrey,
              ),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1, color: Color(0xFFE5E5E5)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: Colors.grey.shade300),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: Text(
                      'common.cancel'.tr(),
                      style: TextStyles.font14Medium.copyWith(
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () {
                      Navigator.pop(ctx);
                      context.read<MyCarsCubit>().deleteVehicle(car.sId!);
                    },
                    child: Text(
                      'common.confirm'.tr(),
                      style: TextStyles.font14Medium.copyWith(
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Delete Success Screen (full-screen red overlay)
// ═══════════════════════════════════════════════════════════════════════════════

void _showDeleteSuccessScreen(BuildContext context) {
  showDialog(
    context: context,
    barrierDismissible: false,
    barrierColor: ColorsManager.mainColor,
    builder: (ctx) {
      return Dialog.fullscreen(
        backgroundColor: ColorsManager.mainColor,
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'my_cars.car_deleted_success'.tr(),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 22.sp,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      height: 1.4,
                    ),
                  ),
                  SizedBox(height: 32.h),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black87,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        minimumSize: const Size.fromHeight(50),
                      ),
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(
                        'common.ok'.tr(),
                        style: TextStyles.font16Medium.copyWith(
                          color: Colors.black87,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Add Car Bottom Sheet
// ═══════════════════════════════════════════════════════════════════════════════

void _showAddCarBottomSheet(BuildContext context) {
  context.read<MyCarsCubit>().getMakes();
  final globalKey = GlobalKey<FormState>();
  final cubit = context.read<MyCarsCubit>();
  cubit.colorController.clear();
  cubit.yearController.clear();
  cubit.plateNumberController.clear();
  cubit.vinNumberController.clear();

  showModalBottomSheet(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      return _AddEditCarForm(formKey: globalKey, isEdit: false);
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edit Car Bottom Sheet
// ═══════════════════════════════════════════════════════════════════════════════

void _showEditCarBottomSheet(BuildContext context, CarResponseModel car) {
  context.read<MyCarsCubit>().getMakes();
  final globalKey = GlobalKey<FormState>();
  final cubit = context.read<MyCarsCubit>();
  cubit.colorController.text = car.vehicleColor ?? "";
  cubit.yearController.text = car.year?.toString() ?? "";
  cubit.plateNumberController.text = car.plateNumber ?? "";
  cubit.vinNumberController.text = car.vinNumber ?? "";

  showModalBottomSheet(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      return _AddEditCarForm(formKey: globalKey, isEdit: true, car: car);
    },
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Add / Edit Car Form Widget
// ═══════════════════════════════════════════════════════════════════════════════

class _AddEditCarForm extends StatelessWidget {
  const _AddEditCarForm({
    required this.formKey,
    required this.isEdit,
    this.car,
  });

  final GlobalKey<FormState> formKey;
  final bool isEdit;
  final CarResponseModel? car;

  InputBorder _outline([Color? c]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: c ?? const Color(0xFFE5E5E5)),
      );

  TextStyle _hintStyle() => TextStyle(
        fontFamily: 'HelveticaNeue',
        fontSize: 14.sp,
        fontWeight: FontWeight.w400,
        color: Colors.grey,
      );

  InputDecoration _inputDeco([String? hint]) => InputDecoration(
        hintText: hint,
        hintStyle: _hintStyle(),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        border: _outline(),
        enabledBorder: _outline(),
        focusedBorder: _outline(Colors.black87),
        errorBorder: _outline(Colors.red),
      );

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return BlocConsumer<MyCarsCubit, MyCarsState>(
      listener: (context, state) {
        if (state is ErrorAddMyCarsState) {
          AppSnackBars.errorSnackBar(state.message);
        } else if (state is SuccessAddMyCarsState) {
          AppSnackBars.successSnackBar(
            isEdit ? 'my_cars.vehicle_updated'.tr() : 'my_cars.vehicle_added'.tr(),
          );
          context.read<MyCarsCubit>().getCars();
          context.pop();
        }
        // Edit mode: preselect dropdowns as data loads
        if (isEdit && car != null) {
          if (state is SuccessGetMakesMyCarsState) {
            final cubit = context.read<MyCarsCubit>();
            final match =
                cubit.makes.where((e) => e.sId == car!.vehicleMake?.sId);
            if (match.isNotEmpty) cubit.selectMake(match.first);
          } else if (state is SuccessGetModelsMyCarsState) {
            final cubit = context.read<MyCarsCubit>();
            final match =
                cubit.models.where((e) => e.sId == car!.vehicleModel?.sId);
            if (match.isNotEmpty) cubit.selectModel(match.first);
          }
        }
      },
      builder: (context, state) {
        if (state is LoadingGetMakesMyCarsState ||
            state is LoadingAddMyCarsState) {
          return const SizedBox(
            height: 200,
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final cubit = context.read<MyCarsCubit>();

        return Padding(
          padding: EdgeInsets.fromLTRB(16, 8, 16, 16 + bottomInset),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Close button
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: CircleAvatar(
                        radius: 16,
                        backgroundColor: Colors.grey.shade100,
                        child: const Icon(
                          Icons.close,
                          color: Colors.grey,
                          size: 18,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Title
                  Text(
                    isEdit ? 'my_cars.edit_vehicle'.tr() : 'my_cars.add_new_vehicle'.tr(),
                    style: TextStyles.font18Bold,
                  ),
                  const SizedBox(height: 20),

                  // ── Vehicle Make ──
                  _label('my_cars.vehicle_make'.tr()),
                  DropdownButtonFormField<MakeResponseModel?>(
                    initialValue: cubit.selectedMake,
                    isExpanded: true,
                    dropdownColor: Colors.white,
                    menuMaxHeight: 250,
                    borderRadius: BorderRadius.circular(8),
                    icon: const Icon(Icons.keyboard_arrow_down_rounded),
                    decoration: _inputDeco('my_cars.select_make'.tr()),
                    items: cubit.makes
                        .map((e) => DropdownMenuItem(
                              value: e,
                              child: Text(e.makeName ?? "",
                                  style: TextStyles.font14Regular),
                            ))
                        .toList(),
                    onChanged: (v) => cubit.selectMake(v),
                    validator: (v) =>
                        v == null ? 'my_cars.please_select_make'.tr() : null,
                  ),
                  const SizedBox(height: 16),

                  // ── Vehicle Model ──
                  _label('my_cars.vehicle_model'.tr()),
                  state is LoadingGetModelsMyCarsState
                      ? const Center(child: CircularProgressIndicator())
                      : DropdownButtonFormField<ModelResponseModel?>(
                          initialValue: cubit.selectedModel,
                          isExpanded: true,
                          dropdownColor: Colors.white,
                          menuMaxHeight: 250,
                          borderRadius: BorderRadius.circular(8),
                          icon:
                              const Icon(Icons.keyboard_arrow_down_rounded),
                          decoration: _inputDeco('my_cars.select_model'.tr()),
                          items: cubit.models
                              .map((e) => DropdownMenuItem(
                                    value: e,
                                    child: Text(e.modelName ?? "",
                                        style: TextStyles.font14Regular),
                                  ))
                              .toList(),
                          onChanged: (v) => cubit.selectModel(v),
                          validator: (v) =>
                              v == null ? 'my_cars.please_select_model'.tr() : null,
                        ),
                  const SizedBox(height: 16),

                  // ── Year ──
                  _label('my_cars.year'.tr()),
                  TextFormField(
                    controller: cubit.yearController,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      hintText: 'my_cars.enter_year'.tr(),
                      hintStyle: _hintStyle(),
                      border: _outline(),
                      enabledBorder: _outline(),
                      focusedBorder: _outline(Colors.black87),
                      errorBorder: _outline(Colors.red),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                    validator: (v) =>
                        (v?.trim().isEmpty ?? true) ? 'my_cars.year_required'.tr() : null,
                  ),
                  const SizedBox(height: 16),

                  // ── Vehicle Color ──
                  _label('my_cars.vehicle_color'.tr()),
                  TextFormField(
                    controller: cubit.colorController,
                    decoration: InputDecoration(
                      hintText: 'my_cars.enter_color'.tr(),
                      hintStyle: _hintStyle(),
                      border: _outline(),
                      enabledBorder: _outline(),
                      focusedBorder: _outline(Colors.black87),
                      errorBorder: _outline(Colors.red),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                    validator: (v) =>
                        (v?.trim().isEmpty ?? true) ? 'my_cars.color_required'.tr() : null,
                  ),
                  const SizedBox(height: 16),

                  // ── Plate Number ──
                  _label('my_cars.plate_number'.tr()),
                  TextFormField(
                    controller: cubit.plateNumberController,
                    decoration: InputDecoration(
                      hintText: 'my_cars.enter_plate'.tr(),
                      hintStyle: _hintStyle(),
                      border: _outline(),
                      enabledBorder: _outline(),
                      focusedBorder: _outline(Colors.black87),
                      errorBorder: _outline(Colors.red),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                    validator: (v) => (v?.trim().isEmpty ?? true)
                        ? 'my_cars.plate_required'.tr()
                        : null,
                  ),
                  const SizedBox(height: 16),

                  // ── VIN Number ──
                  _label('my_cars.vin_number'.tr()),
                  TextFormField(
                    controller: cubit.vinNumberController,
                    decoration: InputDecoration(
                      hintText: 'my_cars.enter_vin'.tr(),
                      hintStyle: _hintStyle(),
                      border: _outline(),
                      enabledBorder: _outline(),
                      focusedBorder: _outline(Colors.black87),
                      errorBorder: _outline(Colors.red),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // ── Save button ──
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: ColorsManager.mainColor,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        minimumSize: const Size.fromHeight(48),
                      ),
                      onPressed: () {
                        if (formKey.currentState!.validate()) {
                          if (isEdit && car != null) {
                            cubit.updateVehicle(car!.sId!);
                          } else {
                            cubit.addVehicle(
                              context.read<SettingsCubit>().profile!.id!,
                            );
                          }
                        }
                      },
                      child: Text(
                        'common.save'.tr(),
                        style: TextStyles.fontAppButton.copyWith(
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: TextStyles.font14Medium.copyWith(
            color: const Color(0xFF252525),
          ),
        ),
      );
}
