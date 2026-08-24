import 'package:bloc/bloc.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kDebugMode;

import '../../../../../core/api/dio_helper.dart';
import '../../../../../core/api/end_points.dart';
import '../../../../../core/services/fcm_notification_service.dart';

part 'login_state.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class LoginCubit extends Cubit<LoginState> {
  LoginCubit() : super(LoginInitial());

  String _normalizePhone(String raw) {
    var phone = raw.trim().replaceAll(RegExp(r'[\s-]'), '');
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    // 8-digit local Qatar number → +974XXXXXXXX
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

  void login(String phone, String pass) async {
    emit(LoginLoading());
    try {
      var response = await DioHelper.postData(
        url: EndPoints.login,
        auth: false,
        data: {"phone_number": _normalizePhone(phone), "password": pass},
      );

      if (response.statusCode == 200) {
        await CacheHelper.secureWrite(
          CacheHelper.authTokenKey,
          response.data["token"].toString(),
        );
        
        // Register FCM token for push notifications
        await _registerFcmToken();
        
        emit(LoginSuccess());
      } else {
        emit(LoginError(response.data["error"]));
      }
    } catch (e) {
      emit(LoginError('auth.please_try_again'.tr()));
    }
  }

  /// Register FCM token with backend for push notifications
  Future<void> _registerFcmToken() async {
    try {
      final fcmToken = await FCMNotificationService.instance.getToken();
      if (fcmToken != null) {
        await DioHelper.postData(
          url: EndPoints.fcmToken,
          data: {'fcm_token': fcmToken},
          auth: true,
        );
        _log('🔔 FCM token registered with backend');
      } else {
        _log('⚠️ FCM token not available');
      }
    } catch (e) {
      // Don't fail login if FCM registration fails
      _log('⚠️ Failed to register FCM token: $e');
    }
  }
}
