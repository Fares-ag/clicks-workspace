import 'package:flutter/material.dart';

/// Extension on [BuildContext] to provide navigation methods.
extension Router on BuildContext {
  /// Navigates to a named route.
  ///
  /// \param routeName The name of the route to navigate to.
  /// \param arguments Optional arguments to pass to the route.
  Future toNamed(String routeName, {Object? arguments}) {
    return Navigator.of(this).pushNamed(routeName, arguments: arguments);
  }

  /// Replaces the current route with a named route.
  ///
  /// \param routeName The name of the route to navigate to.
  /// \param arguments Optional arguments to pass to the route.
  Future  offNamed(String routeName, {Object? arguments}) {
   return Navigator.of(this).pushReplacementNamed(routeName, arguments: arguments);
  }

  /// Removes all previous routes and navigates to a named route.
  ///
  /// \param routeName The name of the route to navigate to.
  /// \param arguments Optional arguments to pass to the route.
  Future offAllNamed(String routeName, {Object? arguments}) {
    return Navigator.of(this).pushNamedAndRemoveUntil(routeName, (route) => false,
        arguments: arguments);
  }

  /// Pops the current route if possible.
  void pop([Object? result]) {
    if (Navigator.of(this).canPop()) {
      Navigator.of(this).pop(result);
    }
  }
}




extension TimeFormatter on int {
  String formatToMinutesSeconds() {
    final minutes = this ~/ 60;
    final seconds = this % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
}
