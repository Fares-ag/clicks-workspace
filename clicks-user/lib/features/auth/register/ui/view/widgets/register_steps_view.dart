import 'package:easy_localization/easy_localization.dart';
import '../../../../../../core/helper/extensions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../../../core/theme/text_styles.dart';
import '../../cubit/register_cubit.dart';

class RegisterStepsView extends StatelessWidget {
  const RegisterStepsView({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(height: 12.h),
        LinearProgressIndicator(
          value: context.read<RegisterCubit>().step / 5,
          borderRadius: BorderRadius.circular(4.r),
          minHeight: 8.h,
        ),
        SizedBox(height: 30.h),

        Stack(
          children: [
            // Back icon positioned at the left
            Positioned(
              left: 16,
              top: 0,
              bottom: 0,
              child: GestureDetector(
                onTap: () {
                  if (context.read<RegisterCubit>().step == 1) {
                    if (context.read<RegisterCubit>().showOTPView) {
                      context.read<RegisterCubit>().changeOTPview();
                    } else {
                      _showExitDialog(context);
                    }
                  } else {
                    context.read<RegisterCubit>().previousStep();
                  }
                },
                child: Icon(
                  Icons.arrow_back_ios,
                  size: 18,
                  color: Colors.black,
                ),
              ),
            ),
            // Text centered across the entire width
            Center(
              child: Text(
                'auth.sign_up'.tr(),
                style: TextStyles.font16RegularBlack.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Colors.black,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showExitDialog(BuildContext context) async {
    var exit = await showGeneralDialog<bool>(
      context: context,
      barrierDismissible: false,
      barrierLabel: '',
      barrierColor: Colors.black54,
      transitionDuration: Duration(milliseconds: 300),
      pageBuilder: (context, animation1, animation2) {
        return Container();
      },
      transitionBuilder: (context, animation1, animation2, widget) {
        return ScaleTransition(
          scale: Tween<double>(begin: 0.5, end: 1.0).animate(
            CurvedAnimation(parent: animation1, curve: Curves.elasticOut),
          ),
          child: AlertDialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(25),
            ),
            elevation: 15,
            backgroundColor: Colors.white,
            contentPadding: EdgeInsets.all(25),
            title: Column(
              children: [
                Container(
                  padding: EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.exit_to_app_rounded,
                    color: Colors.red,
                    size: 35,
                  ),
                ),
                SizedBox(height: 15),
                Text(
                  'auth.close_registration'.tr(),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 22,
                    color: Colors.black87,
                  ),
                ),
              ],
            ),
            content: Text(
              'auth.leave_confirm'.tr(),
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey[600],
                height: 1.4,
              ),
            ),
            actions: [
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(color: Colors.grey[300]!),
                        ),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop(false);
                      },
                      child: Text(
                        'auth.no_stay'.tr(),
                        style: TextStyle(
                          color: Colors.grey[700],
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: 15),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                        foregroundColor: Colors.white,
                        padding: EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        elevation: 5,
                      ),
                      onPressed: () {
                        Navigator.of(context).pop(true);
                      },
                      child: Text(
                        'auth.sure_exit'.tr(),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
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

    if (exit != null && exit == true) {
      if (context.mounted) context.pop();
    }
  }
}
