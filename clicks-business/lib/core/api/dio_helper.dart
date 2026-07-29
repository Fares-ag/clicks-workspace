import 'package:dio/dio.dart';

import '../helper/cache_helper.dart';
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

  static Options _authOptions(bool auth) {
    final options = Options();
    if (auth) {
      final token = CacheHelper.get('token');
      if (token != null && token.isNotEmpty) {
        options.headers = {'Authorization': 'Bearer $token'};
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
  }) {
    return dio.get(url, queryParameters: query, options: _authOptions(auth));
  }

  static Future<Response> postData({
    required String url,
    dynamic data,
    bool auth = true,
  }) {
    return dio.post(url, data: data, options: _authOptions(auth));
  }
}
