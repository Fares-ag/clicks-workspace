// lib/core/components/success_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../theme/colors_manager.dart';
import 'app_button.dart';

class SuccessScreen extends StatelessWidget {
  const SuccessScreen({
    super.key,
    required this.message,
    required this.buttonLabel,
    required this.onButtonPressed,
    this.backgroundColor,
    this.messageColor,
    this.buttonBgColor,
    this.buttonTextColor,
    this.icon,
    this.subtitle,
    this.subtitleColor,
    this.preventBackButton = true,
  });

  final String message;
  final String? subtitle;
  final String buttonLabel;
  final VoidCallback onButtonPressed;
  final Color? backgroundColor;
  final Color? messageColor;
  final Color? subtitleColor;
  final Color? buttonBgColor;
  final Color? buttonTextColor;
  final Widget? icon;
  final bool preventBackButton;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !preventBackButton,
      child: Scaffold(
        backgroundColor: backgroundColor ?? ColorsManager.mainColor,
        body: SafeArea(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 24.h),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Spacer(),

                // Icon (if provided)
                if (icon != null) ...[
                  icon!,
                  SizedBox(height: 24.h),
                ],

                // Main Message
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 24.sp,
                    fontWeight: FontWeight.w600,
                    color: messageColor ?? Colors.white,
                  ),
                  textAlign: TextAlign.center,
                ),

                // Subtitle (if provided)
                if (subtitle != null) ...[
                  SizedBox(height: 12.h),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 16.sp,
                      fontWeight: FontWeight.w400,
                      color: subtitleColor ?? Colors.white.withValues(alpha: 0.8),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],

                Spacer(),

                // Action Button
                SizedBox(
                  width: double.infinity,
                  child: AppButton(
                    onPressed: onButtonPressed,
                    label: buttonLabel,
                    bgColor: buttonBgColor ?? Colors.white,
                    textColor: buttonTextColor ?? Colors.black,
                    height: 50.h,
                    margin: 0,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
