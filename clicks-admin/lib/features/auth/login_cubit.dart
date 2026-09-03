import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/config/app_config.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/admin_notification_service.dart';

part 'login_state.dart';

class LoginCubit extends Cubit<LoginState> {
  LoginCubit() : super(LoginInitial());

  Future<void> login({
    required String email,
    required String password,
  }) async {
    emit(LoginLoading());
    try {
      final res = await DioHelper.postData(
        url: EndPoints.login,
        data: {
          'email': email.trim().toLowerCase(),
          'password': password,
        },
        auth: false,
      );

      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        final token = data['accessToken']?.toString();
        final refresh = data['refreshToken']?.toString();
        if (token == null || token.isEmpty) {
          if (isClosed) return;
          emit(const LoginError('Invalid login response'));
          return;
        }
        await CacheHelper.secureWrite(CacheHelper.authTokenKey, token);
        if (refresh != null && refresh.isNotEmpty) {
          await CacheHelper.secureWrite(CacheHelper.refreshTokenKey, refresh);
        }
        final user = data['user'];
        if (user is Map) {
          await CacheHelper.setUserProfile(
            user.map((k, v) => MapEntry(k.toString(), v)),
          );
        }
        await AdminNotificationService.instance.registerAfterLogin();
        if (isClosed) return;
        emit(LoginSuccess());
      } else {
        if (isClosed) return;
        emit(LoginError(DioHelper.errorMessage(res) ?? 'Invalid credentials'));
      }
    } catch (e) {
      if (isClosed) return;
      emit(LoginError(_loginErrorMessage(e)));
    }
  }

  static String _loginErrorMessage(Object e) {
    if (e is DioException) {
      final apiMsg = e.response?.data is Map
          ? (e.response!.data['message'] ?? e.response!.data['error'])
          : null;
      if (apiMsg != null && apiMsg.toString().trim().isNotEmpty) {
        return apiMsg.toString();
      }

      if (kIsWeb &&
          (e.type == DioExceptionType.connectionError ||
              e.type == DioExceptionType.unknown)) {
        return 'Cannot reach ${AppConfig.apiBaseUrl} from the browser. '
            'Flutter web on localhost is blocked by admin-api CORS in production '
            '(only https://admin.clicks.qa is allowed). '
            'Use local admin-api on :5000, test on https://admin.clicks.qa, '
            'or run Chrome with --web-browser-flag=--disable-web-security for dev.';
      }

      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        return 'Login failed. Cannot reach ${AppConfig.apiBaseUrl}.';
      }
    }
    return 'Login failed. Check your connection.';
  }
}
