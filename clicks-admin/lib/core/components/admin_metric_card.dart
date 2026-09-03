import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_decorations.dart';
import '../theme/app_spacing.dart';

class AdminMetricCard extends StatelessWidget {
  const AdminMetricCard({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.accent = false,
    this.trend,
  });

  final String label;
  final String value;
  final IconData? icon;
  final bool accent;
  final String? trend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: accent
          ? BoxDecoration(
              gradient: AppColors.earningsGradient,
              borderRadius: BorderRadius.circular(AppRadii.lg),
              boxShadow: AppShadows.card,
            )
          : AppDecorations.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null)
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: accent
                        ? Colors.white.withValues(alpha: 0.15)
                        : AppColors.navHighlight,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                  ),
                  child: Icon(
                    icon,
                    size: 18,
                    color: accent ? Colors.white : AppColors.primary,
                  ),
                ),
              if (icon != null) const Spacer(),
              if (trend != null)
                Text(
                  trend!,
                  style: AdminTypography.caption.copyWith(
                    color: accent ? Colors.white70 : AppColors.success,
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          const Spacer(),
          Text(
            value,
            style: AdminTypography.pageTitle.copyWith(
              fontSize: 22,
              color: accent ? Colors.white : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AdminTypography.caption.copyWith(
              color: accent ? Colors.white70 : AppColors.muted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
