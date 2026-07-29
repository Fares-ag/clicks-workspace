import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/status/ui/cubit/status_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

class RejectedStatusWidget extends StatelessWidget {
  const RejectedStatusWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<StatusCubit>();
    final name = cubit.displayName.isNotEmpty ? cubit.displayName : 'Technician';
    final phone = cubit.displayPhone.isNotEmpty ? cubit.displayPhone : '—';
    final email = cubit.displayEmail.isNotEmpty ? cubit.displayEmail : '—';
    final reason = cubit.rejectionReason.isNotEmpty
        ? cubit.rejectionReason
        : 'Application rejected';

    return Container(
      height: 370.h,
      width: MediaQuery.sizeOf(context).width,
      margin: EdgeInsets.only(left: 16.w, right: 16.w, top: 70.h),
      padding: EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          Text(
            "Your Application",
            style: TextStyles.font24Medium.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          SizedBox(height: 20.h),
          Text(
            "Details",
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              fontSize: 18.sp,
            ),
          ),
          SizedBox(height: 20.h),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                spacing: 6.w,
                children: [
                  SvgPicture.asset(AssetsManager.userSvg),

                  Text(name, style: TextStyles.font16RegularBlack),
                ],
              ),
              Row(
                spacing: 6.w,
                children: [
                  SvgPicture.asset(AssetsManager.phoneSvg),
                  Text(phone, style: TextStyles.font16RegularBlack),
                ],
              ),
            ],
          ),
          Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Email", style: TextStyles.font16RegularBlack),
              Flexible(
                child: Text(
                  email,
                  style: TextStyles.font16RegularBlack,
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
          Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Status", style: TextStyles.font16RegularBlack),
              Container(
                padding: EdgeInsets.symmetric(vertical: 2.h, horizontal: 10.w),
                decoration: BoxDecoration(
                  color: Color(0xfff04438),
                  borderRadius: BorderRadius.circular(6.r),
                ),
                child: Text(
                  "Rejected",
                  style: TextStyles.font14Medium.copyWith(color: Colors.white),
                ),
              ),
            ],
          ),
          Divider(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Reason", style: TextStyles.font16RegularBlack),
              Expanded(
                child: Text(
                  reason,
                  style: TextStyles.font16RegularBlack,
                  textAlign: TextAlign.end,
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
