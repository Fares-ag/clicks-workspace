import 'package:flutter/material.dart';

/// A singleton class that provides a global application context.
class AppContext {
  /// The single instance of [AppContext].
  static final AppContext _singleton = AppContext._internal();

  /// Factory constructor to return the single instance of [AppContext].
  factory AppContext() {
    return _singleton;
  }

  /// Private constructor for internal use.
  AppContext._internal();

  /// A global key to access the navigator state.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  /// A getter to retrieve the current [BuildContext] from the navigator key.
  static BuildContext? get context => navigatorKey.currentContext;
}