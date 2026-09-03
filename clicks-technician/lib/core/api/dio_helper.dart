import 'package:dio/dio.dart';

import '../helper/action_errors.dart';
import '../helper/cache_helper.dart';
import 'end_points/end_points.dart';

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
          if (response.statusCode == 401) {
            await CacheHelper.clear();
            onUnauthorized?.call();
          }
          return handler.next(response);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await CacheHelper.clear();
            onUnauthorized?.call();
          }
          return handler.next(error);
        },
      ),
    );
  }

  static Options _authOptions(bool auth, {String? contentType}) {
    final options = Options(contentType: contentType);
    if (auth) {
      final token = CacheHelper.getAuthToken();
      if (token != null && token.toString().isNotEmpty) {
        options.headers = {
          'Authorization': 'Bearer $token',
        };
      }
    }
    return options;
  }

  static String? errorMessage(Response response) {
    return ActionErrors.fromResponse(response);
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
    final options = _authOptions(
      auth,
      contentType: data is FormData ? 'multipart/form-data' : 'application/json',
    );
    return dio.post(url, data: data, queryParameters: query, options: options);
  }

  static Future<Response> putData({
    required String url,
    required dynamic data,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    final options = _authOptions(
      auth,
      contentType: data is FormData ? 'multipart/form-data' : 'application/json',
    );
    return dio.put(url, data: data, queryParameters: query, options: options);
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

  static Future<Response> deleteData({
    required String url,
    Map<String, dynamic>? query,
    bool auth = true,
  }) async {
    return dio.delete(url, queryParameters: query, options: _authOptions(auth));
  }
}
