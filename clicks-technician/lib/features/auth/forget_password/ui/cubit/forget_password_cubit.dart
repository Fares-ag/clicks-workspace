import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';

import '../../../../../core/api/dio_helper.dart';
import '../../../../../core/api/end_points/end_points.dart';
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

  String _normalizedPhone() {
    var phone = phoneController.text.trim().replaceAll(RegExp(r'[\s-]'), '');
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    if (RegExp(r'^\d{8}$').hasMatch(digits)) {
      return '+974$digits';
    }
    if (phone.isNotEmpty &&
        !phone.startsWith('+') &&
        RegExp(r'^\d+$').hasMatch(phone)) {
      phone = '+$phone';
    }
    return phone;
  }

  void changeOTPview() {
    showOTPView = !showOTPView;
    emit(ShowOTPViewForgetPasswordSteps(showOTPView));
  }

  void validateStepOne() {
    emit(StartValidationsForgetPasswordSteps());
    String phoneNumber = phoneController.text.trim();
    stepOneValid = false;
    if (phoneNumber.isEmpty) {
      emit(EndValidationsForgetPasswordSteps());
      return;
    }
    final digits = phoneNumber.replaceAll(RegExp(r'\D'), '');
    final subscriber = digits.length == 8
        ? digits
        : (phoneNumber.startsWith('+974')
            ? phoneNumber.substring(4)
            : (digits.startsWith('974') && digits.length == 11
                ? digits.substring(3)
                : ''));
    if (subscriber.isNotEmpty) {
      stepOneValid =
          PhoneValidationService.validateSubscriberNumber(subscriber);
    }
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
        url: EndPoints.forgotPassword,
        auth: false,
        data: {"phone": _normalizedPhone()},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        showOTPView = true;
        emit(ShowOTPViewForgetPasswordSteps(true));
      } else {
        emit(ForgetPasswordError(DioHelper.errorMessage(res) ?? "Failed to send OTP"));
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
        data: {"phone": _normalizedPhone(), "otp": otpController.text.trim()},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        nextStep();
      } else {
        emit(ForgetPasswordError(DioHelper.errorMessage(res) ?? "Invalid OTP"));
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
      emit(ForgetPasswordError(errorStepTwo ?? "Please enter a valid password"));
      return;
    }
    isLoading = true;
    emit(ForgetPasswordLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.resetPassword,
        auth: false,
        data: {
          "phone": _normalizedPhone(),
          "otp": otpController.text.trim(),
          "new_password": passwordController.text,
          "confirm_password": confirmPasswordController.text,
        },
      );
      isLoading = false;
      if (res.statusCode == 200) {
        emit(ForgetPasswordSuccess());
      } else {
        emit(ForgetPasswordError(DioHelper.errorMessage(res) ?? "Reset failed"));
      }
    } catch (_) {
      isLoading = false;
      emit(ForgetPasswordError("Reset failed"));
    }
  }
}
