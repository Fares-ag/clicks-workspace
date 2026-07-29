import 'dart:io';

import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/features/auth/register/ui/cubit/register_cubit.dart';
import 'package:clicks_technician/features/auth/register/ui/view/widgets/register_choose_file_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../../../core/theme/text_styles.dart';

class RegisterStepFourView extends StatelessWidget {
  const RegisterStepFourView({super.key});

  @override
  Widget build(BuildContext context) {
    if (context.read<RegisterCubit>().fileOrderNumber != 0) {
      late File f;

      switch (context.read<RegisterCubit>().fileOrderNumber) {
        case 1:
          f = File(context.read<RegisterCubit>().profilePicture!.path);
          break;
        case 2:
          f = File(context.read<RegisterCubit>().drivingLicenseFront!.path);
          break;
        case 3:
          f = File(context.read<RegisterCubit>().drivingLicenseBack!.path);
          break;
        case 4:
          f = File(context.read<RegisterCubit>().workPermitFront!.path);
          break;
        case 5:
          f = File(context.read<RegisterCubit>().workPermitBack!.path);
          break;
        default:
      }

      return Column(
        children: [
          SizedBox(height: 32.h),
          Text(
            "Check your uploaded documents",
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.black,
              fontSize: 20.sp,
            ),
          ),
          SizedBox(height: 80.h),

          Container(
            height: 300.h,
            decoration: BoxDecoration(
              color: Color(0xffF9FAFB),
              borderRadius: BorderRadius.circular(7.r),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircleAvatar(radius: 60.r, backgroundImage: FileImage(f)),
                SizedBox(height: 12.h),
                Row(
                  children: [
                    SizedBox(width: 24.w),
                    Expanded(
                      child: AppButton(
                        onPressed: () {
                          switch (context
                              .read<RegisterCubit>()
                              .fileOrderNumber) {
                            case 1:
                              context.read<RegisterCubit>().profilePicture =
                                  null;
                              context.read<RegisterCubit>().validateStepFour();
                              context.read<RegisterCubit>().startChooseFile(0);
                              break;
                            case 2:
                              context
                                  .read<RegisterCubit>()
                                  .drivingLicenseFront = null;
                              context.read<RegisterCubit>().validateStepFour();
                              context.read<RegisterCubit>().startChooseFile(0);
                              break;
                            case 3:
                              context.read<RegisterCubit>().drivingLicenseBack =
                                  null;
                              context.read<RegisterCubit>().validateStepFour();
                              context.read<RegisterCubit>().startChooseFile(0);
                              break;
                            case 4:
                              context.read<RegisterCubit>().workPermitFront =
                                  null;
                              context.read<RegisterCubit>().validateStepFour();
                              context.read<RegisterCubit>().startChooseFile(0);
                              break;
                            case 5:
                              context.read<RegisterCubit>().workPermitBack =
                                  null;
                              context.read<RegisterCubit>().validateStepFour();
                              context.read<RegisterCubit>().startChooseFile(0);
                              break;
                            default:
                          }
                        },
                        label: "Retake",
                        bgColor: Colors.white,
                        margin: 0,
                        borderColor: Color.fromARGB(255, 215, 215, 215),
                        fontWeight: FontWeight.w400,
                        fontSize: 14.sp,
                        elevation: 0,
                        height: 45.h,
                        textColor: Colors.black,
                      ),
                    ),
                    SizedBox(width: 13.w),
                    Expanded(
                      child: AppButton(
                        onPressed: () {
                          context.read<RegisterCubit>().startChooseFile(0);
                        },
                        label: "Confirm",
                        bgColor: ColorsManager.mainColor,
                        textColor: Colors.white,
                        margin: 0,
                        fontWeight: FontWeight.w400,
                        fontSize: 14.sp,
                        elevation: 0,
                        height: 45.h,
                      ),
                    ),
                    SizedBox(width: 24.w),
                  ],
                ),
              ],
            ),
          ),
        ],
      );
    }

    return SingleChildScrollView(
      child: Column(
        children: [
          SizedBox(height: 32.h),
          Text(
            "Final Step! Upload your documents to complete your registration",
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.bold,
              color: Colors.black,
              fontSize: 20.sp,
            ),
          ),
          SizedBox(height: 14.h),

          RegisterChooseFileView(
            label: "Profile Picture",
            chosenFile: context.read<RegisterCubit>().profilePicture,
            chooseFile: (XFile? fileChosen) {
              if (fileChosen != null) {
                context.read<RegisterCubit>().startChooseFile(1);
              }
              context.read<RegisterCubit>().profilePicture = fileChosen;
              context.read<RegisterCubit>().validateStepFour();
            },
          ),
          SizedBox(height: 14.h),
          RegisterChooseFileView(
            label: "Driver License (Front)",
            chosenFile: context.read<RegisterCubit>().drivingLicenseFront,

            chooseFile: (XFile? fileChosen) {
              if (fileChosen != null) {
                context.read<RegisterCubit>().startChooseFile(2);
              }
              context.read<RegisterCubit>().drivingLicenseFront = fileChosen;
              context.read<RegisterCubit>().validateStepFour();
            },
          ),
          SizedBox(height: 14.h),
          RegisterChooseFileView(
            label: "Driver License (Back)",
            chosenFile: context.read<RegisterCubit>().drivingLicenseBack,

            chooseFile: (XFile? fileChosen) {
              if (fileChosen != null) {
                context.read<RegisterCubit>().startChooseFile(3);
              }
              context.read<RegisterCubit>().drivingLicenseBack = fileChosen;
              context.read<RegisterCubit>().validateStepFour();
            },
          ),
          SizedBox(height: 14.h),
          RegisterChooseFileView(
            label: "Work Permit (Front)",
            chosenFile: context.read<RegisterCubit>().workPermitFront,

            chooseFile: (XFile? fileChosen) {
              if (fileChosen != null) {
                context.read<RegisterCubit>().startChooseFile(4);
              }
              context.read<RegisterCubit>().workPermitFront = fileChosen;
              context.read<RegisterCubit>().validateStepFour();
            },
          ),
          SizedBox(height: 14.h),
          RegisterChooseFileView(
            label: "Work Permit (Back)",
            chosenFile: context.read<RegisterCubit>().workPermitBack,

            chooseFile: (XFile? fileChosen) {
              if (fileChosen != null) {
                context.read<RegisterCubit>().startChooseFile(5);
              }
              context.read<RegisterCubit>().workPermitBack = fileChosen;
              context.read<RegisterCubit>().validateStepFour();
            },
          ),
        ],
      ),
    );
  }
}
