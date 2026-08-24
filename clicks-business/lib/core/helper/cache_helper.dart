import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static const String authTokenKey = 'token';

  static const _secureKeys = {authTokenKey};

  static SharedPreferences? _prefs;
  static late FlutterSecureStorage _secureStorage;

  /// In-memory cache so sync callers (Dio headers) can read the token after [init].
  static String? _cachedAuthToken;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    _secureStorage = const FlutterSecureStorage(
      // v11 uses AES-GCM + RSA key wrapping (EncryptedSharedPreferences removed).
      aOptions: AndroidOptions(),
      iOptions: IOSOptions(),
    );
    await _migrateLegacyTokens();
    await _loadSecureTokensIntoCache();
  }

  /// One-time migration: copy tokens from plaintext SharedPreferences to secure storage.
  static Future<void> _migrateLegacyTokens() async {
    for (final key in _secureKeys) {
      final legacy = _prefs!.getString(key);
      if (legacy == null || legacy.isEmpty) continue;
      await _secureStorage.write(key: key, value: legacy);
      await _prefs!.remove(key);
    }
  }

  static Future<void> _loadSecureTokensIntoCache() async {
    _cachedAuthToken = await _secureStorage.read(key: authTokenKey);
  }

  static Future<bool> secureWrite(String key, String value) async {
    await _secureStorage.write(key: key, value: value);
    _updateSecureCache(key, value);
    return true;
  }

  static Future<String?> secureRead(String key) async {
    final value = await _secureStorage.read(key: key);
    _updateSecureCache(key, value);
    return value;
  }

  static Future<bool> secureDelete(String key) async {
    await _secureStorage.delete(key: key);
    _clearSecureCacheKey(key);
    return true;
  }

  /// Sync read of the auth token (available after [init] or [secureWrite]).
  static String? getAuthToken() => _cachedAuthToken;

  static void _updateSecureCache(String key, String? value) {
    if (key == authTokenKey) _cachedAuthToken = value;
  }

  static void _clearSecureCacheKey(String key) {
    if (key == authTokenKey) _cachedAuthToken = null;
  }

  static Future<void> _clearSecureTokens() async {
    for (final key in _secureKeys) {
      await _secureStorage.delete(key: key);
    }
    _cachedAuthToken = null;
  }

  static Future<bool> set(String key, String value) async {
    if (_secureKeys.contains(key)) {
      throw ArgumentError(
        'Use secureWrite for sensitive keys: ${_secureKeys.join(", ")}',
      );
    }
    return _prefs!.setString(key, value);
  }

  static String? get(String key) {
    if (_secureKeys.contains(key)) {
      throw ArgumentError(
        'Use getAuthToken() for sensitive keys: ${_secureKeys.join(", ")}',
      );
    }
    return _prefs?.getString(key);
  }

  static Future<bool> remove(String key) async {
    if (_secureKeys.contains(key)) {
      return secureDelete(key);
    }
    return _prefs!.remove(key);
  }

  static Future<bool> clear() async {
    await _clearSecureTokens();
    return _prefs!.clear();
  }
}
