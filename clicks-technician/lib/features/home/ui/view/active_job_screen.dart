import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/components/vehicle_make_model_fields.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/maps_launcher.dart';
import 'package:clicks_technician/core/helper/phone_launcher.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/complete_job_sheet.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/live_job_map.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/notifications_popup.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Uber-style map-first Active Job screen.
class ActiveJobScreen extends StatefulWidget {
  const ActiveJobScreen({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  State<ActiveJobScreen> createState() => _ActiveJobScreenState();
}

class _SheetSizes {
  const _SheetSizes({
    required this.initial,
    required this.min,
    required this.max,
  });

  final double initial;
  final double min;
  final double max;
}

_SheetSizes _sheetSizesFor(String status) {
  switch (status) {
    case 'en_route':
      // Compact peek — map-first while navigating.
      return const _SheetSizes(initial: 0.20, min: 0.18, max: 0.78);
    case 'accepted':
      return const _SheetSizes(initial: 0.30, min: 0.22, max: 0.78);
    default:
      return const _SheetSizes(initial: 0.30, min: 0.22, max: 0.78);
  }
}

class _ActiveJobScreenState extends State<ActiveJobScreen> {
  final DraggableScrollableController _sheetController =
      DraggableScrollableController();
  String? _lastStatus;

  HomeCubit get cubit => widget.cubit;

  @override
  void initState() {
    super.initState();
    _lastStatus = cubit.jobStatus;
    if (cubit.jobStatus == 'en_route') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _collapseIfEnRoute());
    }
  }

  @override
  void didUpdateWidget(ActiveJobScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    _collapseIfEnRoute();
  }

  void _collapseIfEnRoute() {
    final status = cubit.jobStatus;
    if (status == 'en_route' && _lastStatus != 'en_route') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_sheetController.isAttached) return;
        _sheetController.animateTo(
          _sheetSizesFor(status).initial,
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
        );
      });
    }
    _lastStatus = status;
  }

  @override
  void dispose() {
    _sheetController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = cubit.jobStatus;
    final title = switch (status) {
      'arrived' => 'You have Arrived!',
      'in_progress' => cubit.activeJob?['payment_status'] == 'paid'
          ? 'Job In Progress'
          : 'Collect Payment',
      'completed' => 'Job Completed',
      'en_route' => 'En Route',
      _ => 'Active Job',
    };
    final media = MediaQuery.of(context);
    final sizes = _sheetSizesFor(status);
    final bottomPad = (media.size.height * sizes.initial).clamp(140.0, 280.0);
    final compactEnRoute = status == 'en_route';

    return Scaffold(
      backgroundColor: const Color(0xFFE8EEF2),
      body: Stack(
        fit: StackFit.expand,
        children: [
          LiveJobMap(
            jobId: cubit.jobId,
            locationLabel: cubit.jobLocation,
            techLat: cubit.lastLatitude,
            techLng: cubit.lastLongitude,
            bottomPadding: bottomPad,
          ),
          SafeArea(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
              child: Row(
                children: [
                  Container(
                    padding:
                        EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.08),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: Text(
                      JobDisplay.statusLabel(status),
                      style: TextStyles.font12RegularGrey.copyWith(
                        color: ColorsManager.mainColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  InkWell(
                    onTap: () async {
                      await showNotificationsPopup(context);
                      if (context.mounted) {
                        context.read<HomeCubit>().fetchHomeMeta();
                      }
                    },
                    borderRadius: BorderRadius.circular(999),
                    child: Container(
                      padding: EdgeInsets.all(10.w),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 8,
                          ),
                        ],
                      ),
                      child: Icon(Icons.notifications_none_rounded, size: 20.sp),
                    ),
                  ),
                ],
              ),
            ),
          ),
          DraggableScrollableSheet(
            controller: _sheetController,
            initialChildSize: sizes.initial,
            minChildSize: sizes.min,
            maxChildSize: sizes.max,
            snap: true,
            snapSizes: compactEnRoute
                ? [sizes.min, 0.42, sizes.max]
                : [sizes.min, sizes.initial, sizes.max],
            builder: (context, scrollController) {
              return Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius:
                      BorderRadius.vertical(top: Radius.circular(22.r)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.16),
                      blurRadius: 24,
                      offset: const Offset(0, -4),
                    ),
                  ],
                ),
                child: ListView(
                  controller: scrollController,
                  padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 20.h),
                  children: [
                    Center(
                      child: Container(
                        width: 40.w,
                        height: 4.h,
                        margin: EdgeInsets.only(bottom: 12.h),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD0D5DD),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    Text(
                      title,
                      style: TextStyles.font16RegularBlack.copyWith(
                        fontWeight: FontWeight.bold,
                        fontSize: 20.sp,
                      ),
                    ),
                    SizedBox(height: 4.h),
                    Text(
                      cubit.customerName,
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: const Color(0xFF344054),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (cubit.customerPhone.isNotEmpty) ...[
                      SizedBox(height: 2.h),
                      Text(
                        cubit.customerPhone,
                        style: TextStyles.font12RegularGrey,
                      ),
                    ],
                    SizedBox(height: 14.h),
                    _Actions(cubit: cubit),
                    if (compactEnRoute) ...[
                      SizedBox(height: 10.h),
                      Text(
                        'Swipe up for job details',
                        textAlign: TextAlign.center,
                        style: TextStyles.font12RegularGrey.copyWith(
                          color: const Color(0xFF98A2B3),
                        ),
                      ),
                    ],
                    SizedBox(height: 16.h),
                    Text(
                      'Job details',
                      style: TextStyles.font12RegularGrey.copyWith(
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF667085),
                      ),
                    ),
                    SizedBox(height: 8.h),
                    _ClientBlock(cubit: cubit),
                    SizedBox(height: 10.h),
                    _VehicleBlock(cubit: cubit),
                    SizedBox(height: 10.h),
                    _LocationBlock(cubit: cubit),
                    if (cubit.jobPrice != null) ...[
                      SizedBox(height: 10.h),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Price', style: TextStyles.font14RegularGrey),
                          Text(
                            'QAR ${cubit.jobPrice!.toStringAsFixed(0)}',
                            style: TextStyles.font16RegularBlack.copyWith(
                              fontWeight: FontWeight.w700,
                              color: ColorsManager.mainColor,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ClientBlock extends StatelessWidget {
  const _ClientBlock({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    return _InfoCard(
      title: 'Client',
      onEdit: () => _showClientSheet(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(cubit.customerName,
              style: TextStyles.font14RegularGrey
                  .copyWith(color: Colors.black87, fontWeight: FontWeight.w600)),
          if (cubit.customerPhone.isNotEmpty) ...[
            SizedBox(height: 4.h),
            InkWell(
              onTap: () async {
                final ok = await launchTel(cubit.customerPhone);
                if (!ok) {
                  AppSnackBars.errorSnackBar('Could not open dialer');
                }
              },
              child: Row(
                children: [
                  Icon(Icons.phone_outlined,
                      size: 16.sp, color: ColorsManager.mainColor),
                  SizedBox(width: 6.w),
                  Text(
                    cubit.customerPhone,
                    style: TextStyles.font14RegularGrey.copyWith(
                      color: ColorsManager.mainColor,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _showClientSheet(BuildContext context) {
    final canEdit =
        cubit.jobStatus == 'arrived' || cubit.jobStatus == 'in_progress';
    final nameCtrl = TextEditingController(text: cubit.customerName);
    final phoneCtrl = TextEditingController(text: cubit.customerPhone);
    final issueCtrl = TextEditingController(text: cubit.jobIssue);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
              20.w, 20.h, 20.w, MediaQuery.of(ctx).viewInsets.bottom + 20.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Client details',
                  style: TextStyles.font16RegularBlack
                      .copyWith(fontWeight: FontWeight.bold)),
              SizedBox(height: 16.h),
              if (!canEdit) ...[
                Text('Name: ${cubit.customerName}',
                    style: TextStyles.font14RegularGrey
                        .copyWith(color: Colors.black87)),
                SizedBox(height: 8.h),
                Text('Phone: ${cubit.customerPhone}',
                    style: TextStyles.font14RegularGrey
                        .copyWith(color: Colors.black87)),
                SizedBox(height: 8.h),
                Text('Issue: ${cubit.jobIssue}',
                    style: TextStyles.font14RegularGrey
                        .copyWith(color: Colors.black87)),
                SizedBox(height: 12.h),
                Text('Editable after you arrive',
                    style: TextStyles.font12RegularGrey),
              ] else ...[
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(labelText: 'Name'),
                ),
                SizedBox(height: 8.h),
                TextField(
                  controller: phoneCtrl,
                  decoration: const InputDecoration(labelText: 'Phone'),
                ),
                SizedBox(height: 8.h),
                TextField(
                  controller: issueCtrl,
                  decoration: const InputDecoration(labelText: 'Issue'),
                  maxLines: 2,
                ),
                SizedBox(height: 12.h),
                AppButton(
                  onPressed: () async {
                    final ok = await cubit.updateJobDetails({
                      'clientName': nameCtrl.text.trim(),
                      'clientMobileNumber': phoneCtrl.text.trim(),
                      'issue': issueCtrl.text.trim(),
                    });
                    if (ctx.mounted) Navigator.pop(ctx);
                    if (cubit.signatureClearedBanner) {
                      // ignore: use_build_context_synchronously
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Customer must sign again after job edits',
                          ),
                        ),
                      );
                    }
                    if (!ok) {
                      // ignore: use_build_context_synchronously
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Update failed')),
                      );
                    }
                  },
                  label: 'Save',
                  margin: 0,
                  bgColor: ColorsManager.mainColor,
                  textColor: Colors.white,
                  height: 44.h,
                  radius: 10.r,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _VehicleBlock extends StatelessWidget {
  const _VehicleBlock({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final job = cubit.activeJob ?? <String, dynamic>{};
    return _InfoCard(
      title: 'Vehicle',
      onEdit: () => _showVehicleSheet(context, job),
      child: Text(
        JobDisplay.vehicleLine(job),
        style: TextStyles.font14RegularGrey
            .copyWith(color: Colors.black87, fontWeight: FontWeight.w500),
      ),
    );
  }

  void _showVehicleSheet(BuildContext context, Map<String, dynamic> job) {
    final canEdit =
        cubit.jobStatus == 'arrived' || cubit.jobStatus == 'in_progress';
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) => _VehicleEditSheet(
        cubit: cubit,
        job: job,
        canEdit: canEdit,
      ),
    );
  }
}

class _VehicleEditSheet extends StatefulWidget {
  const _VehicleEditSheet({
    required this.cubit,
    required this.job,
    required this.canEdit,
  });

  final HomeCubit cubit;
  final Map<String, dynamic> job;
  final bool canEdit;

  @override
  State<_VehicleEditSheet> createState() => _VehicleEditSheetState();
}

class _VehicleEditSheetState extends State<_VehicleEditSheet> {
  final _vehicleKey = GlobalKey<VehicleMakeModelFieldsState>();
  final _makeCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _yearCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _vinCtrl = TextEditingController();
  bool _useCatalog = true;

  @override
  void initState() {
    super.initState();
    final job = widget.job;
    _makeCtrl.text = (job['vehicleMake'] ?? '').toString();
    _modelCtrl.text = (job['vehicleModel'] ?? '').toString();
    _yearCtrl.text = job['vehicleYear']?.toString() ?? '';
    _plateCtrl.text = (job['licensePlate'] ?? '').toString();
    _vinCtrl.text = (job['vinNumber'] ?? '').toString();
  }

  @override
  void dispose() {
    _makeCtrl.dispose();
    _modelCtrl.dispose();
    _yearCtrl.dispose();
    _plateCtrl.dispose();
    _vinCtrl.dispose();
    super.dispose();
  }

  InputDecoration _deco(String label) => InputDecoration(labelText: label);

  Future<void> _save() async {
    final vs = _vehicleKey.currentState;
    final make = _useCatalog && vs != null ? vs.make : _makeCtrl.text.trim();
    final model = _useCatalog && vs != null ? vs.model : _modelCtrl.text.trim();
    if (make.isEmpty || model.isEmpty) {
      AppSnackBars.errorSnackBar('Select make and model');
      return;
    }

    final ok = await widget.cubit.updateJobDetails({
      'vehicleMake': make,
      'vehicleModel': model,
      if (_yearCtrl.text.trim().isNotEmpty)
        'vehicleYear': int.tryParse(_yearCtrl.text.trim()),
      'licensePlate': _plateCtrl.text.trim(),
      'vinNumber': _vinCtrl.text.trim(),
    });
    if (!mounted) return;
    Navigator.pop(context);
    if (widget.cubit.signatureClearedBanner) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Customer must sign again after job edits')),
      );
    }
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Update failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20.w,
          20.h,
          20.w,
          MediaQuery.of(context).viewInsets.bottom + 20.h,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Vehicle details',
              style: TextStyles.font16RegularBlack
                  .copyWith(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 16.h),
            if (!widget.canEdit) ...[
              Text(
                JobDisplay.vehicleLine(job),
                style: TextStyles.font14RegularGrey.copyWith(color: Colors.black87),
              ),
              SizedBox(height: 12.h),
              Text('Editable after you arrive', style: TextStyles.font12RegularGrey),
            ] else ...[
              VehicleMakeModelFields(
                key: _vehicleKey,
                initialMake: (job['vehicleMake'] ?? '').toString(),
                initialModel: (job['vehicleModel'] ?? '').toString(),
                onCatalogReady: (ok) => setState(() => _useCatalog = ok),
              ),
              if (!_useCatalog)
                VehicleMakeModelTextFields(
                  makeController: _makeCtrl,
                  modelController: _modelCtrl,
                ),
              TextField(
                controller: _yearCtrl,
                decoration: _deco('Year'),
                keyboardType: TextInputType.number,
              ),
              SizedBox(height: 12.h),
              TextField(
                controller: _plateCtrl,
                decoration: _deco('Plate'),
              ),
              SizedBox(height: 12.h),
              TextField(
                controller: _vinCtrl,
                decoration: _deco('VIN'),
              ),
              SizedBox(height: 12.h),
              AppButton(
                onPressed: _save,
                label: 'Save',
                margin: 0,
                bgColor: ColorsManager.mainColor,
                textColor: Colors.white,
                height: 44.h,
                radius: 10.r,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LocationBlock extends StatelessWidget {
  const _LocationBlock({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    return _InfoCard(
      title: 'Location',
      trailing: TextButton.icon(
        onPressed: () async {
          final ok = await openJobLocationInMaps(cubit.jobLocation);
          if (!ok) AppSnackBars.errorSnackBar('Could not open maps');
        },
        icon: Icon(Icons.navigation_outlined,
            size: 16.sp, color: ColorsManager.mainColor),
        label: Text('Navigate',
            style: TextStyles.font12RegularGrey
                .copyWith(color: ColorsManager.mainColor)),
      ),
      child: Text(
        cubit.jobLocation,
        style: TextStyles.font14RegularGrey.copyWith(color: Colors.black87),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.child,
    this.onEdit,
    this.trailing,
  });

  final String title;
  final Widget child;
  final VoidCallback? onEdit;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: ColorsManager.scaffoldColor,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: ColorsManager.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyles.font12RegularGrey
                      .copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              if (trailing != null) trailing!,
              if (onEdit != null)
                IconButton(
                  onPressed: onEdit,
                  icon: Icon(Icons.edit_outlined,
                      size: 18.sp, color: ColorsManager.mainColor),
                  visualDensity: VisualDensity.compact,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
            ],
          ),
          SizedBox(height: 6.h),
          child,
        ],
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    switch (cubit.jobStatus) {
      case 'accepted':
        return AppButton(
          isLoading: cubit.isLoadingAction,
          onPressed: cubit.isLoadingAction ? null : cubit.startEnRoute,
          label: 'Start En Route',
          margin: 0,
          width: double.infinity,
          bgColor: ColorsManager.mainColor,
          textColor: Colors.white,
          height: 48.h,
          radius: 10.r,
        );
      case 'en_route':
        return AppButton(
          isLoading: cubit.isLoadingAction,
          onPressed: cubit.isLoadingAction ? null : cubit.markArrived,
          label: "I've Arrived",
          margin: 0,
          width: double.infinity,
          bgColor: ColorsManager.mainColor,
          textColor: Colors.white,
          height: 48.h,
          radius: 10.r,
        );
      case 'arrived':
        final near = cubit.canStartJob;
        final ownJob = cubit.isOwnCreatedJob;
        final dist = cubit.distanceToJobMeters;
        final distLabel = ownJob
            ? 'Ready to start (GPS not required for your job)'
            : dist == null
                ? 'Waiting for GPS…'
                : near
                    ? 'You are near the job location'
                    : 'Move within ${HomeCubit.startMaxMeters.toInt()}m to start (${dist.round()}m away)';
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              distLabel,
              textAlign: TextAlign.center,
              style: TextStyles.font12RegularGrey.copyWith(
                color: near ? const Color(0xFF12B76A) : ColorsManager.greyColor,
              ),
            ),
            SizedBox(height: 8.h),
            AppButton(
              isLoading: cubit.isLoadingAction,
              onPressed: cubit.isLoadingAction || !near
                  ? null
                  : () async {
                      await cubit.startJob();
                      if (!context.mounted) return;
                      if (cubit.lastActionError != null) {
                        AppSnackBars.errorSnackBar(cubit.lastActionError!);
                      }
                    },
              label: 'Start Job',
              margin: 0,
              width: double.infinity,
              bgColor: ColorsManager.mainColor,
              textColor: Colors.white,
              height: 48.h,
              radius: 10.r,
            ),
          ],
        );
      case 'in_progress':
        final paid = cubit.activeJob?['payment_status'] == 'paid';
        if (!paid) {
          return AppButton(
            isLoading: cubit.isLoadingAction,
            onPressed:
                cubit.isLoadingAction ? null : () => _showPayment(context),
            label: 'Collect Payment',
            margin: 0,
            width: double.infinity,
            bgColor: ColorsManager.mainColor,
            textColor: Colors.white,
            height: 48.h,
            radius: 10.r,
          );
        }
        return AppButton(
          isLoading: cubit.isLoadingAction,
          onPressed: cubit.isLoadingAction
              ? null
              : () => _openComplete(context),
          label: 'Complete Job',
          margin: 0,
          width: double.infinity,
          bgColor: ColorsManager.mainColor,
          textColor: Colors.white,
          height: 48.h,
          radius: 10.r,
        );
      case 'completed':
        return Text(
          'Job completed',
          style: TextStyles.font14RegularGrey,
          textAlign: TextAlign.center,
        );
      default:
        return const SizedBox.shrink();
    }
  }

  void _openComplete(BuildContext context) {
    if (cubit.activeJob?['payment_status']?.toString() != 'paid') {
      AppSnackBars.errorSnackBar(
        'Collect payment before completing the job',
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BlocProvider.value(
          value: cubit,
          child: BeginTasksScreen(cubit: cubit),
        ),
      ),
    );
  }

  void _showPayment(BuildContext context) {
    final price = cubit.jobPrice;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.all(16.w),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Collect your Payment',
                  style: TextStyles.font16RegularBlack
                      .copyWith(fontWeight: FontWeight.bold),
                ),
                if (price != null) ...[
                  SizedBox(height: 8.h),
                  Text(
                    'Amount: ${price.toStringAsFixed(0)} QAR',
                    style: TextStyles.font14RegularGrey
                        .copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
                SizedBox(height: 12.h),
                ...[
                  ('cash', 'Cash'),
                  ('card', 'Card'),
                  ('wallet', 'Wallet'),
                  ('fawran', 'Fawran'),
                ].map(
                  (method) => ListTile(
                    title: Text(method.$2),
                    onTap: () {
                      Navigator.pop(ctx);
                      cubit.confirmPayment(paymentMethod: method.$1);
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

}
