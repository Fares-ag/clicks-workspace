import 'package:flutter/material.dart';

/// Phone-first breakpoints for the admin console.
abstract final class AdminBreakpoints {
  static const double compact = 720;
  static const double sidebar = 900;

  static bool isCompact(BuildContext context) =>
      MediaQuery.sizeOf(context).width < compact;

  static bool showPersistentSidebar(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= sidebar;

  static double pagePadding(BuildContext context) =>
      isCompact(context) ? 16 : 24;
}
