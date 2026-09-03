import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

/// Label/value rows with dividers — used on detail screens.
class AdminInfoList extends StatelessWidget {
  const AdminInfoList({
    super.key,
    required this.items,
  });

  final List<AdminInfoItem> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const Divider(height: 1, color: AppColors.border),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (items[i].icon != null) ...[
                  Icon(items[i].icon, size: 18, color: AppColors.muted),
                  const SizedBox(width: AppSpacing.sm),
                ],
                Expanded(
                  flex: 2,
                  child: Text(
                    items[i].label,
                    style: AdminTypography.label.copyWith(color: AppColors.muted),
                  ),
                ),
                Expanded(
                  flex: 3,
                  child: Text(
                    items[i].value,
                    style: AdminTypography.body.copyWith(fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class AdminInfoItem {
  const AdminInfoItem({
    required this.label,
    required this.value,
    this.icon,
  });

  final String label;
  final String value;
  final IconData? icon;
}
