import 'package:bloc/bloc.dart';
import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:easy_localization/easy_localization.dart';
import '../../../../../../core/helper/password_validator.dart';
import '../../../../../../features/auth/register/logic/services/phone_validation_service.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/cupertino.dart';

part 'register_state.dart';

class RegisterCubit extends Cubit<RegisterState> {
  RegisterCubit() : super(RegisterInitial());

  int step = 1;

  void changeStep(int newstep) {
    step = newstep;
    emit(ChangeProgressRegister(step));
  }

  void nextStep() {
    step++;
    emit(ChangeProgressRegister(step));
  }

  void previousStep() {
    step--;
    emit(ChangeProgressRegister(step));
  }

  final phoneController = TextEditingController();
  bool stepOneValid = false;
  bool showOTPView = false;
  void changeOTPview() {
    showOTPView = !showOTPView;

    emit(ShowOTPViewRegisterSteps(showOTPView));
  }

  String _normalizedPhone() {
    final raw = phoneController.text.trim().replaceAll(RegExp(r'[\s-]'), '');
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (RegExp(r'^\d{8}$').hasMatch(digits)) return '+974$digits';
    if (raw.isNotEmpty && !raw.startsWith('+') && RegExp(r'^\d+$').hasMatch(raw)) {
      return '+$raw';
    }
    return raw;
  }

  void validateStepOne() {
    emit(StartValidationsRegisterSteps());
    String phoneNumber = phoneController.text.trim();
    stepOneValid = false;

    if (phoneNumber.isEmpty) {
      stepOneValid = false;
      emit(EndValidationsRegisterSteps());
      return;
    }

    // Prefer 8-digit local Qatar; otherwise validate remaining digits.
    // Only strip the 974 country code when the total is exactly 11 digits
    // (3 country code + 8 local). Guards against incorrectly stripping
    // numbers that merely happen to start with 974 in the local part.
    final digits = phoneNumber.replaceAll(RegExp(r'[^\d]'), '');
    final subscriber = digits.length == 8
        ? digits
        : (digits.startsWith('974') && digits.length == 11
            ? digits.substring(3)
            : digits);
    stepOneValid = PhoneValidationService.validateSubscriberNumber(subscriber);
    emit(EndValidationsRegisterSteps());
  }

  final otpController = TextEditingController();
  bool stepOTPValid = false;
  bool isSendingOtp = false;
  bool isVerifyingOtp = false;
  String? otpError;

  Future<void> sendOtpToPhone() async {
    isSendingOtp = true;
    otpError = null;
    emit(StartValidationsRegisterSteps());
    try {
      final response = await DioHelper.postData(
        url: EndPoints.sendOtp,
        auth: false,
        data: {"phone_number": _normalizedPhone()},
      );
      if (response.statusCode == 200) {
        changeOTPview();
      } else if (response.statusCode == 429) {
        otpError = 'auth.too_many_otp_attempts'.tr();
        emit(ErrorRegisterState(otpError!));
      } else {
        otpError = response.data["error"] ?? 'auth.please_try_again'.tr();
        emit(ErrorRegisterState(otpError!));
      }
    } catch (e) {
      otpError = 'auth.please_try_again'.tr();
      emit(ErrorRegisterState(otpError!));
    } finally {
      isSendingOtp = false;
      emit(EndValidationsRegisterSteps());
    }
  }

  Future<void> verifyOtpCode() async {
    isVerifyingOtp = true;
    otpError = null;
    emit(StartValidationsRegisterSteps());
    try {
      final response = await DioHelper.postData(
        url: EndPoints.verifyOtp,
        auth: false,
        data: {
          "phone_number": _normalizedPhone(),
          "otp": otpController.text.trim(),
        },
      );
      if (response.statusCode == 200) {
        nextStep();
      } else {
        otpError = response.data["error"] ?? 'auth.invalid_otp'.tr();
        emit(ErrorRegisterState(otpError!));
      }
    } catch (e) {
      otpError = 'auth.invalid_otp'.tr();
      emit(ErrorRegisterState(otpError!));
    } finally {
      isVerifyingOtp = false;
      emit(EndValidationsRegisterSteps());
    }
  }

  void validateOTP() {
    emit(StartValidationsRegisterSteps());
    stepOTPValid = false;
    if (otpController.text.isEmpty) {
      emit(EndValidationsRegisterSteps());
      return;
    } else if (otpController.text.length != 6) {
      emit(EndValidationsRegisterSteps());
      return;
    }
    stepOTPValid = true;
    emit(EndValidationsRegisterSteps());
  }

  final emailController = TextEditingController();
  bool stepTwoValid = false;

  void validateStepTwo() {
    emit(StartValidationsRegisterSteps());
    stepTwoValid = false;

    final String email = emailController.text.trim();
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

    if (!emailRegex.hasMatch(email) || email.isEmpty) {
      stepTwoValid = false;
      emit(EndValidationsRegisterSteps());

      return;
    }

    stepTwoValid = true;
    emit(EndValidationsRegisterSteps());
  }

  final firstNameController = TextEditingController();
  final lastNameController = TextEditingController();
  final passwordController = TextEditingController();
  final confirmPasswordController = TextEditingController();

  bool stepThreeValid = false;
  String? errorStepThree;
  void validateStepThree() {
    emit(StartValidationsRegisterSteps());
    stepThreeValid = false;

    if (firstNameController.text.isEmpty) {
      stepThreeValid = false;
      errorStepThree = "*First Name is Required";
      emit(EndValidationsRegisterSteps());
      return;
    }
    if (lastNameController.text.isEmpty) {
      stepThreeValid = false;
      errorStepThree = "*Last Name is Required";
      emit(EndValidationsRegisterSteps());
      return;
    }

    if (!PasswordValidator.isValid(passwordController.text)) {
      stepThreeValid = false;
      errorStepThree = PasswordValidator.validate(passwordController.text);
      emit(EndValidationsRegisterSteps());
      return;
    }

    if (passwordController.text != confirmPasswordController.text) {
      stepThreeValid = false;
      errorStepThree = "*Password does not match";
      emit(EndValidationsRegisterSteps());
      return;
    }
    stepThreeValid = true;
    errorStepThree = null;
    emit(EndValidationsRegisterSteps());
  }

  bool stepFourValid = false;

  void createAccount() async {
    emit(LoadingRegisterState());
    try {
      var response = await DioHelper.postData(
        url: EndPoints.register,
        auth: false,
        data: {
          "phone_number": _normalizedPhone(),
          "first_name": firstNameController.text,
          "last_name": lastNameController.text,
          "email": emailController.text,
          "password": passwordController.text,
        },
      );
     
      if (response.statusCode == 201) {
        emit(SuccessRegisterState());
      } else {
        emit(ErrorRegisterState(response.data["error"]));
      }
    } catch (e) {
      emit(ErrorRegisterState('auth.please_try_again'.tr()));
    }
  }
}
