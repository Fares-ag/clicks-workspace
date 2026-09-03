import 'package:dio/dio.dart';

import '../helper/cache_helper.dart';
import 'end_points.dart';

typedef UnauthorizedCallback = void Function();

class DioHelper {
  static late Dio dio;
  static UnauthorizedCallback? onUnauthorized;
  static bool _refreshing = false;

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
          final retried = await _maybeRefreshAndRetry(response.requestOptions);
          if (retried != null) {
            return handler.resolve(retried);
          }
          if (response.statusCode == 401 || response.statusCode == 403) {
            final url = response.requestOptions.path;
            if (!_isAuthPath(url)) {
              await CacheHelper.clear();
              onUnauthorized?.call();
            }
          }
          return handler.next(response);
        },
        onError: (error, handler) async {
          final status = error.response?.statusCode;
          if (status == 401 || status == 403) {
            final url = error.requestOptions.path;
            if (!_isAuthPath(url)) {
              await CacheHelper.clear();
              onUnauthorized?.call();
            }
          }
          return handler.next(error);
        },
      ),
    );
  }

  static bool _isAuthPath(String path) {
    return path.contains('/auth/login') ||
        path.contains('/auth/refresh-token') ||
        path.contains('/auth/forgot-password');
  }

  static Future<Response<dynamic>?> _maybeRefreshAndRetry(
    RequestOptions options,
  ) async {
    final status = options.extra['_handledStatus'] as int?;
    if (status != 401 && status != 403) return null;

    if (_isAuthPath(options.path)) return null;

    final refreshed = await _refreshAccessToken();
    if (!refreshed) return null;

    final token = CacheHelper.getAuthToken();
    final headers = Map<String, dynamic>.from(options.headers);
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    return dio.request<dynamic>(
      options.path,
      data: options.data,
      queryParameters: options.queryParameters,
      options: Options(
        method: options.method,
        headers: headers,
        contentType: options.contentType,
        responseType: options.responseType,
      ),
    );
  }

  static Future<bool> _refreshAccessToken() async {
    if (_refreshing) return false;
    final refresh = CacheHelper.getRefreshToken();
    if (refresh == null || refresh.isEmpty) return false;

    _refreshing = true;
    try {
      final res = await dio.post(
        EndPoints.refreshToken,
        data: {'refreshToken': refresh},
        options: Options(headers: {}),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final token = (res.data as Map)['accessToken']?.toString();
        if (token != null && token.isNotEmpty) {
          await CacheHelper.secureWrite(CacheHelper.authTokenKey, token);
          return true;
        }
      }
      return false;
    } catch (_) {
      return false;
    } finally {
      _refreshing = false;
    }
  }

  static Options _authOptions(bool auth) {
    final options = Options();
    if (auth) {
      final token = CacheHelper.getAuthToken();
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
  }) async {
    final res = await dio.get(url, queryParameters: query, options: _authOptions(auth));
    if (res.statusCode == 401 || res.statusCode == 403) {
      res.requestOptions.extra['_handledStatus'] = res.statusCode;
      final retried = await _maybeRefreshAndRetry(res.requestOptions);
      if (retried != null) return retried;
    }
    return res;
  }

  static Future<Response> postData({
    required String url,
    dynamic data,
    bool auth = true,
  }) async {
    final res = await dio.post(url, data: data, options: _authOptions(auth));
    if (res.statusCode == 401 || res.statusCode == 403) {
      res.requestOptions.extra['_handledStatus'] = res.statusCode;
      final retried = await _maybeRefreshAndRetry(res.requestOptions);
      if (retried != null) return retried;
    }
    return res;
  }

  static Future<Response> putData({
    required String url,
    dynamic data,
    bool auth = true,
  }) async {
    final res = await dio.put(url, data: data, options: _authOptions(auth));
    if (res.statusCode == 401 || res.statusCode == 403) {
      res.requestOptions.extra['_handledStatus'] = res.statusCode;
      final retried = await _maybeRefreshAndRetry(res.requestOptions);
      if (retried != null) return retried;
    }
    return res;
  }

  static Future<Response> patchData({
    required String url,
    dynamic data,
    bool auth = true,
  }) async {
    final res = await dio.patch(url, data: data, options: _authOptions(auth));
    if (res.statusCode == 401 || res.statusCode == 403) {
      res.requestOptions.extra['_handledStatus'] = res.statusCode;
      final retried = await _maybeRefreshAndRetry(res.requestOptions);
      if (retried != null) return retried;
    }
    return res;
  }

  static Future<Response> deleteData({
    required String url,
    bool auth = true,
  }) async {
    final res = await dio.delete(url, options: _authOptions(auth));
    if (res.statusCode == 401 || res.statusCode == 403) {
      res.requestOptions.extra['_handledStatus'] = res.statusCode;
      final retried = await _maybeRefreshAndRetry(res.requestOptions);
      if (retried != null) return retried;
    }
    return res;
  }
}
