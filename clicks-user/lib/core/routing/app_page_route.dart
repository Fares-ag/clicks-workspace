import 'package:flutter/material.dart';

/// Shared push/pop transition for named routes — short ease-out fade + slide.
class AppPageRoute<T> extends PageRouteBuilder<T> {
  AppPageRoute({
    required Widget page,
    RouteSettings? settings,
    bool fullscreenDialog = false,
  }) : super(
          settings: settings,
          fullscreenDialog: fullscreenDialog,
          opaque: true,
          barrierDismissible: false,
          pageBuilder: (context, animation, secondaryAnimation) => page,
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final curved = CurvedAnimation(
              parent: animation,
              curve: Curves.easeOutCubic,
              reverseCurve: Curves.easeInCubic,
            );
            final isRtl = Directionality.of(context) == TextDirection.rtl;
            return FadeTransition(
              opacity: Tween<double>(begin: 0.92, end: 1).animate(curved),
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: Offset(isRtl ? -0.03 : 0.03, 0),
                  end: Offset.zero,
                ).animate(curved),
                child: child,
              ),
            );
          },
          transitionDuration: const Duration(milliseconds: 280),
          reverseTransitionDuration: const Duration(milliseconds: 220),
        );
}
