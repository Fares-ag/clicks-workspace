import 'package:clicks_technician/core/components/app_button.dart';
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
class ActiveJobScreen extends StatelessWidget {
  const ActiveJobScreen({super.key, required this.cubit});

  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final status = cubit.jobStatus;
    final title = switch (status) {
      'arrived' => 'You have Arrived!',
      'in_progress' => 'Job In Progress',
      'completed' => 'Collect Payment',
      'en_route' => 'En Route',
      _ => 'Active Job',
    };
    final media = MediaQuery.of(context);
    // Keep ~70% of the screen as map; sheet starts compact.
    final sheetHeight = media.size.height * 0.30;
    final bottomPad = sheetHeight.clamp(180.0, 280.0);

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
            initialChildSize: 0.30,
            minChildSize: 0.22,
            maxChildSize: 0.78,
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
    final makeCtrl = TextEditingController(
        text: (job['vehicleMake'] ?? '').toString());
    final modelCtrl = TextEditingController(
        text: (job['vehicleModel'] ?? '').toString());
    final yearCtrl = TextEditingController(
        text: job['vehicleYear']?.toString() ?? '');
    final plateCtrl = TextEditingController(
        text: (job['licensePlate'] ?? '').toString());
    final vinCtrl =
        TextEditingController(text: (job['vinNumber'] ?? '').toString());

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(
                20.w, 20.h, 20.w, MediaQuery.of(ctx).viewInsets.bottom + 20.h),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Vehicle details',
                    style: TextStyles.font16RegularBlack
                        .copyWith(fontWeight: FontWeight.bold)),
                SizedBox(height: 16.h),
                if (!canEdit) ...[
                  Text(JobDisplay.vehicleLine(job),
                      style: TextStyles.font14RegularGrey
                          .copyWith(color: Colors.black87)),
                  SizedBox(height: 12.h),
                  Text('Editable after you arrive',
                      style: TextStyles.font12RegularGrey),
                ] else ...[
                  TextField(
                      controller: makeCtrl,
                      decoration: const InputDecoration(labelText: 'Make')),
                  TextField(
                      controller: modelCtrl,
                      decoration: const InputDecoration(labelText: 'Model')),
                  TextField(
                      controller: yearCtrl,
                      decoration: const InputDecoration(labelText: 'Year'),
                      keyboardType: TextInputType.number),
                  TextField(
                      controller: plateCtrl,
                      decoration: const InputDecoration(labelText: 'Plate')),
                  TextField(
                      controller: vinCtrl,
                      decoration: const InputDecoration(labelText: 'VIN')),
                  SizedBox(height: 12.h),
                  AppButton(
                    onPressed: () async {
                      final ok = await cubit.updateJobDetails({
                        'vehicleMake': makeCtrl.text.trim(),
                        'vehicleModel': modelCtrl.text.trim(),
                        if (yearCtrl.text.trim().isNotEmpty)
                          'vehicleYear': int.tryParse(yearCtrl.text.trim()),
                        'licensePlate': plateCtrl.text.trim(),
                        'vinNumber': vinCtrl.text.trim(),
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
        );
      },
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
        return AppButton(
          isLoading: cubit.isLoadingAction,
          onPressed: cubit.isLoadingAction
              ? null
              : () async {
                  await cubit.startJob();
                  if (context.mounted) _openComplete(context);
                },
          label: 'Start Job',
          margin: 0,
          width: double.infinity,
          bgColor: ColorsManager.mainColor,
          textColor: Colors.white,
          height: 48.h,
          radius: 10.r,
        );
      case 'in_progress':
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
        final paid = cubit.activeJob?['payment_status'] == 'paid';
        if (paid) {
          return Text('Payment received', style: TextStyles.font14RegularGrey);
        }
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
      default:
        return const SizedBox.shrink();
    }
  }

  void _openComplete(BuildContext context) {
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
                ...['cash', 'card', 'wallet'].map(
                  (method) => ListTile(
                    title: Text(method[0].toUpperCase() + method.substring(1)),
                    onTap: () {
                      Navigator.pop(ctx);
                      cubit.confirmPayment(paymentMethod: method);
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
