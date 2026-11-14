import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Consistent header action control (44×44 min touch target).
class HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final String? semanticsLabel;
  final bool selected;

  const HeaderIconButton({
    super.key,
    required this.icon,
    this.onTap,
    this.semanticsLabel,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = selected ? ColorsManager.mainColor : ColorsManager.card;
    final fg = selected ? Colors.white : ColorsManager.mainColor;
    final border = selected ? ColorsManager.mainColor : ColorsManager.cardBorder;

    return Semantics(
      button: true,
      label: semanticsLabel,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12.r),
          child: Ink(
            width: 44.w,
            height: 44.w,
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(12.r),
              border: Border.all(color: border),
            ),
            child: Icon(icon, size: 22.sp, color: fg),
          ),
        ),
      ),
    );
  }
}
