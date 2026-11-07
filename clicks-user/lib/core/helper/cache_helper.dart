import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static const String authTokenKey = 'token';

  static const _secureKeys = {authTokenKey};

  static SharedPreferences? _instance;
  static late FlutterSecureStorage _secureStorage;

  /// In-memory cache so sync callers (Dio headers, socket auth) can read the token
  /// after [init] has loaded secure storage.
  static String? _cachedAuthToken;

  /// Plain-SharedPreferences marker that this install has run before.
  ///
  /// SharedPreferences is wiped on uninstall on both platforms, but the iOS
  /// Keychain (secure storage) is NOT — a reinstall, or a second-hand phone,
  /// used to sign straight back into the previous owner's account
  /// (scenario 18). No marker = first run of this install = wipe secure
  /// storage before reading anything from it.
  static const String _installMarkerKey = 'install_initialized_v1';

  static Future<void> init() async {
    _secureStorage = const FlutterSecureStorage(
      // v11 uses AES-GCM + RSA key wrapping (EncryptedSharedPreferences removed).
      aOptions: AndroidOptions(),
      iOptions: IOSOptions(),
    );
    try {
      _instance = await SharedPreferences.getInstance();
    } catch (_) {
      _instance = null;
    }
    try {
      if (_instance != null && _instance!.getBool(_installMarkerKey) != true) {
        await _safeDeleteAllSecure();
        await _instance!.setBool(_installMarkerKey, true);
      }
      await _migrateLegacyTokens();
      await _loadSecureTokensIntoCache();
    } catch (_) {
      // A corrupted secure-storage entry (e.g. an Android backup restored
      // without its key) used to throw before runApp and crash every
      // launch. Reset to a signed-out state instead.
      await _safeDeleteAllSecure();
      _cachedAuthToken = null;
    }
  }

  static Future<void> _safeDeleteAllSecure() async {
    try {
      await _secureStorage.deleteAll();
    } catch (_) {}
  }

  /// One-time migration: copy tokens from plaintext SharedPreferences to secure storage.
  static Future<void> _migrateLegacyTokens() async {
    if (_instance == null) return;
    for (final key in _secureKeys) {
      final legacy = _instance!.getString(key);
      if (legacy == null || legacy.isEmpty) continue;
      await _secureStorage.write(key: key, value: legacy);
      await _instance!.remove(key);
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

  /// Save a value dynamically based on its type (non-sensitive prefs only).
  static Future<bool> save(String key, dynamic value) async {
    if (_secureKeys.contains(key)) {
      throw ArgumentError(
        'Use secureWrite for sensitive keys: ${_secureKeys.join(", ")}',
      );
    }
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

  /// Retrieve a non-sensitive value dynamically.
  static dynamic get(String key) {
    if (_secureKeys.contains(key)) {
      throw ArgumentError(
        'Use getAuthToken() for sensitive keys: ${_secureKeys.join(", ")}',
      );
    }
    return _instance?.get(key);
  }

  /// Remove a non-sensitive value.
  static Future<bool> remove(String key) async {
    if (_secureKeys.contains(key)) {
      return secureDelete(key);
    }
    return _instance!.remove(key);
  }

  /// Clear the session: delete auth tokens and any app-owned prefs.
  ///
  /// Deliberately does NOT call `SharedPreferences.clear()` — that also wipes
  /// keys owned by other packages (e.g. easy_localization's saved locale,
  /// which silently reset Arabic users back to English on logout).
  static Future<bool> clear() async {
    await _clearSecureTokens();
    for (final key in _secureKeys) {
      await _instance?.remove(key);
    }
    return true;
  }
}
