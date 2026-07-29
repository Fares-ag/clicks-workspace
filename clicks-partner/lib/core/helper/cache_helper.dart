import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static Future<bool> set(String key, String value) async {
    return _prefs!.setString(key, value);
  }

  static String? get(String key) => _prefs?.getString(key);

  static Future<bool> remove(String key) async => _prefs!.remove(key);

  static Future<bool> clear() async => _prefs!.clear();
}
