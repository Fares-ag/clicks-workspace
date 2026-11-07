// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../api/dio_helper.dart';
import '../helper/cache_helper.dart';

class DownloadHelper {
  DownloadHelper._();

  static Future<String?> saveAuthenticatedText({
    required String url,
    required String filename,
    Map<String, dynamic>? query,
  }) async {
    final token = CacheHelper.getAuthToken();
    final res = await DioHelper.dio.get<dynamic>(
      url,
      queryParameters: query,
      options: Options(
        responseType: ResponseType.plain,
        headers: {
          if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
        },
      ),
    );
    if (res.statusCode != 200 || res.data == null) return null;
    final body = res.data.toString();
    final bytes = Uint8List.fromList(body.codeUnits);
    _triggerDownload(bytes, filename, 'text/plain');
    return filename;
  }

  static Future<String?> saveAuthenticatedBytes({
    required String url,
    required String filename,
  }) async {
    final res = await DioHelper.getBytes(url: url);
    if (res.statusCode != 200 || res.data == null) return null;
    final bytes = res.data is Uint8List
        ? res.data as Uint8List
        : Uint8List.fromList(res.data!);
    _triggerDownload(bytes, filename, 'application/pdf');
    return filename;
  }

  static void _triggerDownload(Uint8List bytes, String filename, String mime) {
    final blob = html.Blob([bytes], mime);
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', filename)
      ..click();
    html.Url.revokeObjectUrl(url);
  }
}
