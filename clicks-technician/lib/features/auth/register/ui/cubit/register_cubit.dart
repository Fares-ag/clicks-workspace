import 'package:bloc/bloc.dart';
import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/helper/password_validator.dart';
import 'package:clicks_technician/features/auth/register/logic/services/phone_validation_service.dart';
import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/cupertino.dart';
import 'package:image_picker/image_picker.dart';

part 'register_state.dart';

class RegisterCubit extends Cubit<RegisterState> {
  RegisterCubit() : super(RegisterInitial());

  int step = 1;
  bool isLoading = false;

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
    emit(ShowOTPViewRegisterSteps(showOTPView));
  }

  void validateStepOne() {
    emit(StartValidationsRegisterSteps());
    String phoneNumber = phoneController.text.trim();
    stepOneValid = false;

    if (phoneNumber.isEmpty) {
      emit(EndValidationsRegisterSteps());
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
    emit(EndValidationsRegisterSteps());
  }

  Future<void> sendOtp() async {
    validateStepOne();
    if (!stepOneValid) {
      emit(RegisterError("Please enter a valid phone number"));
      return;
    }
    isLoading = true;
    emit(RegisterLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.sendOtp,
        auth: false,
        data: {"phone": _normalizedPhone()},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        showOTPView = true;
        emit(RegisterOtpSent());
        emit(ShowOTPViewRegisterSteps(true));
      } else {
        emit(RegisterError(DioHelper.errorMessage(res) ?? "Failed to send OTP"));
      }
    } catch (e) {
      isLoading = false;
      emit(RegisterError("Failed to send OTP"));
    }
  }

  final otpController = TextEditingController();
  bool stepOTPValid = false;

  void validateOTP() {
    emit(StartValidationsRegisterSteps());
    stepOTPValid = otpController.text.trim().length == 6;
    emit(EndValidationsRegisterSteps());
  }

  Future<void> verifyOtp() async {
    validateOTP();
    if (!stepOTPValid) {
      emit(RegisterError("Please enter the 6-digit OTP"));
      return;
    }
    isLoading = true;
    emit(RegisterLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.verifyOtp,
        auth: false,
        data: {"phone": _normalizedPhone(), "otp": otpController.text.trim()},
      );
      isLoading = false;
      if (res.statusCode == 200) {
        nextStep();
      } else {
        emit(RegisterError(DioHelper.errorMessage(res) ?? "Invalid OTP"));
        emit(EndValidationsRegisterSteps());
      }
    } catch (e) {
      isLoading = false;
      emit(RegisterError("OTP verification failed"));
    }
  }

  final emailController = TextEditingController();
  bool stepTwoValid = false;

  void validateStepTwo() {
    emit(StartValidationsRegisterSteps());
    final String email = emailController.text.trim();
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    stepTwoValid = emailRegex.hasMatch(email) && email.isNotEmpty;
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
      errorStepThree = "*First Name is Required";
      emit(EndValidationsRegisterSteps());
      return;
    }
    if (lastNameController.text.isEmpty) {
      errorStepThree = "*Last Name is Required";
      emit(EndValidationsRegisterSteps());
      return;
    }
    if (!PasswordValidator.isValid(passwordController.text)) {
      errorStepThree = PasswordValidator.validate(passwordController.text);
      emit(EndValidationsRegisterSteps());
      return;
    }
    if (passwordController.text != confirmPasswordController.text) {
      errorStepThree = "*Password does not match";
      emit(EndValidationsRegisterSteps());
      return;
    }
    stepThreeValid = true;
    errorStepThree = null;
    emit(EndValidationsRegisterSteps());
  }

  bool stepFourValid = false;

  XFile? profilePicture;
  XFile? drivingLicenseFront;
  XFile? drivingLicenseBack;
  XFile? workPermitFront;
  XFile? workPermitBack;

  int fileOrderNumber = 0;

  void startChooseFile(int fileOrder) {
    emit(StartValidationsRegisterSteps());
    fileOrderNumber = fileOrder;
    emit(EndValidationsRegisterSteps());
  }

  void validateStepFour() {
    emit(StartValidationsRegisterSteps());
    stepFourValid = profilePicture != null &&
        drivingLicenseFront != null &&
        drivingLicenseBack != null &&
        workPermitFront != null &&
        workPermitBack != null;
    emit(EndValidationsRegisterSteps());
  }

  Future<MultipartFile> _file(XFile file, String name) async {
    final bytes = await file.readAsBytes();
    return MultipartFile.fromBytes(
      bytes,
      filename: file.name.isNotEmpty ? file.name : name,
    );
  }

  Future<void> submitRegistration() async {
    validateStepFour();
    if (!stepFourValid) {
      emit(RegisterError("Upload all required images"));
      return;
    }
    isLoading = true;
    emit(RegisterLoading());
    try {
      final form = FormData.fromMap({
        "phone": _normalizedPhone(),
        "email": emailController.text.trim(),
        "firstName": firstNameController.text.trim(),
        "lastName": lastNameController.text.trim(),
        "password": passwordController.text,
        "profilePicture": await _file(profilePicture!, "profile.jpg"),
        "licenseFront": await _file(drivingLicenseFront!, "license_front.jpg"),
        "licenseBack": await _file(drivingLicenseBack!, "license_back.jpg"),
        "permitFront": await _file(workPermitFront!, "permit_front.jpg"),
        "permitBack": await _file(workPermitBack!, "permit_back.jpg"),
      });

      final res = await DioHelper.postData(
        url: EndPoints.register,
        auth: false,
        data: form,
      );
      isLoading = false;
      if (res.statusCode == 200 || res.statusCode == 201) {
        step = 5;
        emit(RegisterSuccess());
        emit(ChangeProgressRegister(5));
      } else {
        emit(RegisterError(DioHelper.errorMessage(res) ?? "Registration failed"));
      }
    } catch (e) {
      isLoading = false;
      emit(RegisterError("Registration failed — check network / Azure uploads"));
    }
  }
}
