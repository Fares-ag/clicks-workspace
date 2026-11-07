import 'package:flutter/material.dart';

import '../theme/admin_breakpoints.dart';
import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class FilterChipBar extends StatelessWidget {
  const FilterChipBar({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final List<FilterChipOption> options;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final chips = options.map((opt) {
      final active = selected == opt.value;
      return Material(
        color: active ? AppColors.navHighlight : AppColors.surface,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: () => onSelected(opt.value),
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: active ? AppColors.primary : AppColors.border,
              ),
            ),
            child: Text(
              opt.label,
              style: AdminTypography.caption.copyWith(
                fontWeight: FontWeight.w600,
                color: active ? AppColors.primary : AppColors.textMuted,
              ),
            ),
          ),
        ),
      );
    }).toList();

    if (AdminBreakpoints.isCompact(context)) {
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < chips.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              chips[i],
            ],
          ],
        ),
      );
    }

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: chips,
    );
  }
}

class FilterChipOption {
  const FilterChipOption({required this.label, required this.value});
  final String label;
  final String value;
}
