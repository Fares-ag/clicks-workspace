import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:url_launcher/url_launcher.dart';

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
    final file = File('${Directory.systemTemp.path}/$filename');
    await file.writeAsString(body);
    final uri = Uri.file(file.path);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return file.path;
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
    final file = File('${Directory.systemTemp.path}/$filename');
    await file.writeAsBytes(bytes, flush: true);
    final uri = Uri.file(file.path);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    return file.path;
  }
}
