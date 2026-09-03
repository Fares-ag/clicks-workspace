import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

class PrimaryButton extends StatefulWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.outlined = false,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final Widget? icon;
  final bool outlined;
  final bool compact;

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final child = widget.loading
        ? SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: widget.outlined ? AppColors.primary : Colors.white,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (widget.icon != null) ...[widget.icon!, const SizedBox(width: 8)],
              Text(
                widget.label,
                style: AdminTypography.body.copyWith(
                  fontWeight: FontWeight.w600,
                  color: widget.outlined ? AppColors.primary : Colors.white,
                ),
              ),
            ],
          );

    final bg = widget.outlined
        ? Colors.transparent
        : (_hovered ? AppColors.primaryHover : AppColors.primary);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: InkWell(
          onTap: widget.loading ? null : widget.onPressed,
          borderRadius: BorderRadius.circular(AppRadii.md),
          child: Container(
            height: 44,
            padding: EdgeInsets.symmetric(
              horizontal: widget.compact ? AppSpacing.md : AppSpacing.lg,
            ),
            alignment: Alignment.center,
            decoration: widget.outlined
                ? BoxDecoration(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    border: Border.all(color: AppColors.primary),
                  )
                : null,
            child: child,
          ),
        ),
      ),
    );
  }
}
