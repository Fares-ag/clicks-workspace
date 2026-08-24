import 'package:dio/dio.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/cache_helper.dart';

part 'login_state.dart';

class LoginCubit extends Cubit<LoginState> {
  LoginCubit() : super(LoginInitial());

  Future<void> login({required String identifier, required String password}) async {
    emit(LoginLoading());
    try {
      final trimmed = identifier.trim();
      final isEmail = trimmed.contains('@');
      final body = <String, dynamic>{
        'password': password,
        if (isEmail) 'email': trimmed.toLowerCase() else 'phone': trimmed,
      };

      final res = await DioHelper.postData(
        url: EndPoints.login,
        data: body,
        auth: false,
      );

      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        final token = data['accessToken']?.toString();
        if (token == null || token.isEmpty) {
          if (isClosed) return;
          emit(const LoginError('Invalid login response'));
          return;
        }
        await CacheHelper.secureWrite(CacheHelper.authTokenKey, token);
        final user = data['user'];
        final business = data['business'];
        if (user is Map) {
          await CacheHelper.set('user_name', user['name']?.toString() ?? '');
          await CacheHelper.set('user_id', user['id']?.toString() ?? '');
        }
        if (business is Map) {
          await CacheHelper.set('business_name', business['name']?.toString() ?? '');
          await CacheHelper.set('business_id', business['id']?.toString() ?? '');
          await CacheHelper.set(
            'cut_type',
            business['cutType']?.toString() ?? 'revenue',
          );
          await CacheHelper.set(
            'cut_percent',
            business['cutPercent']?.toString() ?? '',
          );
        }
        if (isClosed) return;
        emit(LoginSuccess());
      } else {
        if (isClosed) return;
        emit(LoginError(DioHelper.errorMessage(res) ?? 'Invalid credentials'));
      }
    } catch (e) {
      String msg = 'Login failed. Check your connection.';
      if (e is DioException) {
        final apiMsg = e.response?.data is Map
            ? (e.response!.data['message'] ?? e.response!.data['error'])
            : null;
        if (apiMsg != null && apiMsg.toString().trim().isNotEmpty) {
          msg = apiMsg.toString();
        } else if (e.type == DioExceptionType.connectionError ||
            e.type == DioExceptionType.connectionTimeout) {
          msg = 'Login failed. Check your connection.';
        }
      }
      if (isClosed) return;
      emit(LoginError(msg));
    }
  }
}
