import 'package:dio/dio.dart';
import '../helper/cache_helper.dart';
import '../services/fcm_notification_service.dart';
import 'end_points.dart';

typedef UnauthorizedCallback = void Function();

class DioHelper {
  static late Dio dio;
  static UnauthorizedCallback? onUnauthorized;

  static void init() {
    dio = Dio(
      BaseOptions(
        baseUrl: EndPoints.baseUrl,
        receiveDataWhenStatusError: true,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        validateStatus: (status) => status != null && status < 600,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) async {
          if (response.statusCode == 401 &&
              _isSessionExpiry(response.requestOptions)) {
            await _endSession();
            onUnauthorized?.call();
          }
          return handler.next(response);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401 &&
              _isSessionExpiry(error.requestOptions)) {
            await _endSession();
            onUnauthorized?.call();
          }
          return handler.next(error);
        },
      ),
    );
  }

  /// Drops the local session on an expired token.
  ///
  /// The FCM token has to go with it: it is still stored on the expired
  /// account server-side, so leaving it alive lets that account's pushes be
  /// delivered to whoever signs in next on this device. Deleted AFTER the
  /// cached token is gone, so the refresh that FCM fires cannot be posted
  /// back onto the account we just left.
  static Future<void> _endSession() async {
    await CacheHelper.clear();
    try {
      await FCMNotificationService.instance
          .deleteToken()
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  /// Endpoints where 401 means "these credentials are wrong", not "your
  /// session expired" — signing the user out there would kick them out of the
  /// app for a mistyped password.
  static const Set<String> _credentialPaths = {
    EndPoints.login,
    EndPoints.register,
    EndPoints.changePassword,
    EndPoints.forgetPassword,
    EndPoints.verifyResetOtp,
    EndPoints.resetPassword,
    EndPoints.sendOtp,
    EndPoints.verifyOtp,
  };

  static bool _isSessionExpiry(RequestOptions options) {
    if (_credentialPaths.contains(Uri.parse(options.path).path)) return false;
    // Only an authenticated request can have an expired session.
    return options.headers.entries.any(
      (e) =>
          e.key.toLowerCase() == 'authorization' &&
          (e.value?.toString().isNotEmpty ?? false),
    );
  }

  static Options _authOptions(bool auth, {String? contentType}) {
    final options = Options(contentType: contentType);
    if (auth) {
      final token = CacheHelper.getAuthToken();
      if (token != null && token.isNotEmpty) {
        options.headers = {
          'Authorization': 'Bearer $token',
        };
      }
    }
    return options;
  }

  static String? errorMessage(Response response) {
    final data = response.data;
    if (data is Map) {
      return (data['error'] ?? data['message'] ?? data['details'])?.toString();
    }
    return null;
  }

  static Future<Response> getData({
    required String url,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    return dio.get(url, queryParameters: query, options: _authOptions(auth));
  }

  static Future<Response> postData({
    required String url,
    dynamic data,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final contentType =
        data is FormData ? 'multipart/form-data' : 'application/json';
    return dio.post(
      url,
      data: data,
      queryParameters: query,
      options: _authOptions(auth, contentType: contentType),
    );
  }

  static Future<Response> putData({
    required String url,
    required dynamic data,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final contentType =
        data is FormData ? 'multipart/form-data' : 'application/json';
    return dio.put(
      url,
      data: data,
      queryParameters: query,
      options: _authOptions(auth, contentType: contentType),
    );
  }

  static Future<Response> deleteData({
    required String url,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    return dio.delete(
      url,
      queryParameters: query,
      options: _authOptions(auth),
    );
  }

  static Future<Response> patchData({
    required String url,
    required dynamic data,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    return dio.patch(
      url,
      data: data,
      queryParameters: query,
      options: _authOptions(auth, contentType: 'application/json'),
    );
  }
}
