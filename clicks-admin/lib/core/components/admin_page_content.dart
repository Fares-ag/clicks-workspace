import 'package:flutter/material.dart';

import '../theme/app_spacing.dart';

/// Scrollable page body with consistent padding and optional max width.
class AdminPageContent extends StatelessWidget {
  const AdminPageContent({
    super.key,
    required this.children,
    this.maxWidth = 920,
    this.padding,
  });

  final List<Widget> children;
  final double maxWidth;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );

    return ListView(
      padding: padding ??
          const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
      children: [
        Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: content,
          ),
        ),
      ],
    );
  }
}
