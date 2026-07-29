import 'package:url_launcher/url_launcher.dart';

Future<bool> launchTel(String phone) async {
  final cleaned = phone.replaceAll(RegExp(r'[^\d+]'), '');
  if (cleaned.isEmpty) return false;
  final uri = Uri(scheme: 'tel', path: cleaned);
  return launchUrl(uri);
}
