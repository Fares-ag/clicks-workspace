import 'package:bloc/bloc.dart';
import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

import '../../../../../core/helper/password_validator.dart';
import '../../../register/logic/services/phone_validation_service.dart';

part 'forget_password_state.dart';

class ForgetPasswordCubit extends Cubit<ForgetPasswordState> {
  ForgetPasswordCubit() : super(ForgetPasswordInitial());

  int step = 1;
  bool isLoading = false;

  void changeStep(int newstep) {
    step = newstep;
    emit(ChangeProgressForgetPassword(step));
  }

  void nextStep() {
    step++;
    emit(ChangeProgressForgetPassword(step));
  }

  void previousStep() {
    step--;
    emit(ChangeProgressForgetPassword(step));
  }

  final phoneController = TextEditingController();
  bool stepOneValid = false;
  bool showOTPView = false;

  String get _phone {
    final raw = phoneController.text.trim().replaceAll(RegExp(r'[\s-]'), '');
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (RegExp(r'^\d{8}$').hasMatch(digits)) return '+974$digits';
    if (raw.isNotEmpty && !raw.startsWith('+') && RegExp(r'^\d+$').hasMatch(raw)) {
      return '+$raw';
    }
    return raw;
  }

  void changeOTPview() {
    showOTPView = !showOTPView;
    emit(ShowOTPViewForgetPasswordSteps(showOTPView));
  }

  void validateStepOne() {
    emit(StartValidationsForgetPasswordSteps());
    final phoneNumber = _phone;
    stepOneValid = false;
    if (phoneNumber.isEmpty) {
      emit(EndValidationsForgetPasswordSteps());
      return;
    }
    final digits = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    // Only strip the 974 country code when the total is exactly 11 digits
    // (3 country code + 8 local). Guards against incorrectly stripping
    // numbers that merely happen to start with 974 in the local part.
    final subscriber = digits.length == 8
        ? digits
        : (digits.startsWith('974') && digits.length == 11
            ? digits.substring(3)
            : digits);
    stepOneValid = PhoneValidationService.validateSubscriberNumber(subscriber);
    emit(EndValidationsForgetPasswordSteps());
  }

  Future<void> sendResetOtp() async {
    validateStepOne();
    if (!stepOneValid) {
      emit(ForgetPasswordError("Please enter a valid phone number"));
      return;
    }
    isLoading = true;
    emit(ForgetPasswordLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.forgetPassword,
        auth: false,
        data: {"phone_number": _phone},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        showOTPView = true;
        emit(ShowOTPViewForgetPasswordSteps(true));
      } else {
        final msg = res.data is Map ? res.data['error']?.toString() : null;
        emit(ForgetPasswordError(msg ?? "Failed to send OTP"));
      }
    } catch (_) {
      isLoading = false;
      emit(ForgetPasswordError("Failed to send OTP"));
    }
  }

  final otpController = TextEditingController();
  bool stepOTPValid = false;

  void validateOTP() {
    emit(StartValidationsForgetPasswordSteps());
    stepOTPValid = otpController.text.trim().length == 6;
    emit(EndValidationsForgetPasswordSteps());
  }

  Future<void> verifyResetOtp() async {
    validateOTP();
    if (!stepOTPValid) {
      emit(ForgetPasswordError("Please enter the 6-digit OTP"));
      return;
    }
    isLoading = true;
    emit(ForgetPasswordLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.verifyResetOtp,
        auth: false,
        data: {"phone_number": _phone, "otp": otpController.text.trim()},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        nextStep();
      } else {
        final msg = res.data is Map ? res.data['error']?.toString() : null;
        emit(ForgetPasswordError(msg ?? "Invalid OTP"));
      }
    } catch (_) {
      isLoading = false;
      emit(ForgetPasswordError("OTP verification failed"));
    }
  }

  final passwordController = TextEditingController();
  final confirmPasswordController = TextEditingController();

  bool stepTwoValid = false;
  String? errorStepTwo;

  void validateStepTwo() {
    emit(StartValidationsForgetPasswordSteps());
    stepTwoValid = false;
    if (!PasswordValidator.isValid(passwordController.text)) {
      errorStepTwo = PasswordValidator.validate(passwordController.text);
      emit(EndValidationsForgetPasswordSteps());
      return;
    }
    if (passwordController.text != confirmPasswordController.text) {
      errorStepTwo = "*Password does not match";
      emit(EndValidationsForgetPasswordSteps());
      return;
    }
    stepTwoValid = true;
    errorStepTwo = null;
    emit(EndValidationsForgetPasswordSteps());
  }

  Future<void> resetPassword() async {
    validateStepTwo();
    if (!stepTwoValid) {
      emit(ForgetPasswordError(errorStepTwo ?? "Invalid password"));
      return;
    }
    isLoading = true;
    emit(ForgetPasswordLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.resetPassword,
        auth: false,
        data: {
          "phone_number": _phone,
          "otp": otpController.text.trim(),
          "new_password": passwordController.text,
          "confirm_password": confirmPasswordController.text,
        },
      );
      isLoading = false;
      if (res.statusCode == 200) {
        emit(ForgetPasswordSuccess());
      } else {
        final msg = res.data is Map ? res.data['error']?.toString() : null;
        emit(ForgetPasswordError(msg ?? "Reset failed"));
      }
    } catch (_) {
      isLoading = false;
      emit(ForgetPasswordError("Reset failed"));
    }
  }
}
