import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/status/ui/cubit/status_cubit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

class PendingStatusWidget extends StatelessWidget {
  const PendingStatusWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<StatusCubit>();
    final name = cubit.displayName.isNotEmpty ? cubit.displayName : 'Technician';
    final phone = cubit.displayPhone.isNotEmpty ? cubit.displayPhone : '—';
    final email = cubit.displayEmail.isNotEmpty ? cubit.displayEmail : '—';

    return Container(
      height: 300.h,
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
            style: TextStyles.font24Medium.copyWith(fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 20),
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
                  color: Color(0xfff79009),
                  borderRadius: BorderRadius.circular(6.r),
                ),
                child: Text(
                  "Pending",
                  style: TextStyles.font14Medium.copyWith(color: Colors.white),
                ),
              ),
            ],
          ),
          Divider(),
        ],
      ),
    );
  }
}
