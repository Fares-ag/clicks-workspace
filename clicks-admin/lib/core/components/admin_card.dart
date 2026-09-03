import 'package:flutter/material.dart';

import '../theme/app_decorations.dart';
import '../theme/app_spacing.dart';

/// Mirrors `.admin-card` from web theme.css.
class AdminCard extends StatelessWidget {
  const AdminCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: AppDecorations.card(),
      child: child,
    );
  }
}
