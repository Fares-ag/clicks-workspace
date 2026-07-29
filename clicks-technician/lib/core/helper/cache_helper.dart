import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static SharedPreferences? _instance;

  /// Initialize SharedPreferences instance
  static Future<void> init() async {
    _instance = await SharedPreferences.getInstance();
  }

  /// Save a value dynamically based on its type
  static Future<bool> save(String key, dynamic value) async {
    switch (value.runtimeType) {
      case const (String):
        return _instance!.setString(key, value as String);
      case const (int):
        return _instance!.setInt(key, value as int);
      case const (bool):
        return _instance!.setBool(key, value as bool);
      case const (double):
        return _instance!.setDouble(key, value as double);
      case const (List<String>):
        return _instance!.setStringList(key, value as List<String>);
      default:
        throw ArgumentError("Unsupported value type: ${value.runtimeType}");
    }
  }

  /// Retrieve a value dynamically
  static dynamic get(String key) {
    return _instance?.get(key);
  }

  /// Remove a value
  static Future<bool> remove(String key) async {
    return _instance!.remove(key);
  }

  /// Clear all saved values
  static Future<bool> clear() async {
    return _instance!.clear();
  }
}
