import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CacheHelper {
  static const String authTokenKey = 'token';
  static const String refreshTokenKey = 'refresh_token';
  static const String userProfileKey = 'admin_user';

  static const _secureKeys = {authTokenKey, refreshTokenKey};

  static SharedPreferences? _prefs;
  static late FlutterSecureStorage _secureStorage;

  static String? _cachedAuthToken;
  static String? _cachedRefreshToken;
  static Map<String, dynamic>? _cachedUserProfile;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    _secureStorage = const FlutterSecureStorage(
      aOptions: AndroidOptions(),
      iOptions: IOSOptions(),
    );
    await _migrateLegacyTokens();
    await _loadSecureTokensIntoCache();
    _loadUserProfileIntoCache();
  }

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
    _cachedRefreshToken = await _secureStorage.read(key: refreshTokenKey);
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

  static String? getAuthToken() => _cachedAuthToken;
  static String? getRefreshToken() => _cachedRefreshToken;

  static void _updateSecureCache(String key, String? value) {
    if (key == authTokenKey) _cachedAuthToken = value;
    if (key == refreshTokenKey) _cachedRefreshToken = value;
  }

  static void _clearSecureCacheKey(String key) {
    if (key == authTokenKey) _cachedAuthToken = null;
    if (key == refreshTokenKey) _cachedRefreshToken = null;
  }

  static Future<void> _clearSecureTokens() async {
    for (final key in _secureKeys) {
      await _secureStorage.delete(key: key);
    }
    _cachedAuthToken = null;
    _cachedRefreshToken = null;
  }

  static Future<bool> set(String key, String value) async {
    if (_secureKeys.contains(key)) {
      throw ArgumentError('Use secureWrite for sensitive keys');
    }
    return _prefs!.setString(key, value);
  }

  static String? get(String key) {
    if (_secureKeys.contains(key)) {
      throw ArgumentError('Use getAuthToken/getRefreshToken for tokens');
    }
    return _prefs?.getString(key);
  }

  static Future<Map<String, dynamic>?> getUserProfile() async {
    return getUserProfileSync();
  }

  static Map<String, dynamic>? getUserProfileSync() => _cachedUserProfile;

  static void _loadUserProfileIntoCache() {
    final raw = get(userProfileKey);
    if (raw == null || raw.isEmpty) {
      _cachedUserProfile = null;
      return;
    }
    try {
      _cachedUserProfile = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      _cachedUserProfile = null;
    }
  }

  static Future<void> setUserProfile(Map<String, dynamic> user) async {
    _cachedUserProfile = user;
    await set(userProfileKey, jsonEncode(user));
  }

  static Future<bool> remove(String key) async {
    if (_secureKeys.contains(key)) {
      return secureDelete(key);
    }
    return _prefs!.remove(key);
  }

  static Future<bool> clear() async {
    await _clearSecureTokens();
    _cachedUserProfile = null;
    return _prefs!.clear();
  }
}
