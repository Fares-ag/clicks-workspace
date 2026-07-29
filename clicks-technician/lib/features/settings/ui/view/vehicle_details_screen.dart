import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Read-only vehicle details for assigned technician vehicle.
class VehicleDetailsScreen extends StatelessWidget {
  const VehicleDetailsScreen({
    super.key,
    this.vehicle,
    this.error,
  });

  final Map<String, dynamic>? vehicle;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.scaffoldColor,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Vehicle Details',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.all(16.w),
        child: vehicle == null
            ? Center(
                child: Padding(
                  padding: EdgeInsets.only(top: 80.h),
                  child: Column(
                    children: [
                      Icon(Icons.directions_car_outlined,
                          size: 48.sp, color: ColorsManager.greyColor),
                      SizedBox(height: 12.h),
                      Text(
                        error ?? 'No vehicle assigned',
                        textAlign: TextAlign.center,
                        style: TextStyles.font14RegularGrey,
                      ),
                    ],
                  ),
                ),
              )
            : Container(
                width: double.infinity,
                padding: EdgeInsets.all(16.w),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12.r),
                  border: Border.all(color: ColorsManager.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _VehicleRow(
                      label: 'Name',
                      value: (vehicle!['name'] ?? '—').toString(),
                    ),
                    _VehicleRow(
                      label: 'Year',
                      value: (vehicle!['year'] ?? '—').toString(),
                    ),
                    _VehicleRow(
                      label: 'Plate number',
                      value: (vehicle!['plateNumber'] ?? '—').toString(),
                    ),
                    _VehicleRow(
                      label: 'Color',
                      value: (vehicle!['color'] ?? '—').toString(),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _VehicleRow extends StatelessWidget {
  const _VehicleRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100.w,
            child: Text(label, style: TextStyles.font12RegularGrey),
          ),
          Expanded(
            child: Text(
              value.isEmpty ? '—' : value,
              style: TextStyles.font14RegularGrey.copyWith(
                color: Colors.black87,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
