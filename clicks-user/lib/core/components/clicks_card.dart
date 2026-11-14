import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// White list card with a quiet grey edge. Use `highlighted` for unread /
/// selected rows (brand wash, still not a pink outline on every box).
class ClicksCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool highlighted;
  final double radius;

  const ClicksCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.onTap,
    this.highlighted = false,
    this.radius = 12,
  });

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(radius.r);
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: highlighted ? ColorsManager.wash : ColorsManager.card,
        borderRadius: r,
        border: Border.all(
          color: highlighted ? ColorsManager.washBorder : ColorsManager.cardBorder,
        ),
      ),
      child: child,
    );

    final wrapped = onTap == null
        ? box
        : Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              borderRadius: r,
              child: box,
            ),
          );

    if (margin == null) return wrapped;
    return Padding(padding: margin!, child: wrapped);
  }
}

/// Square icon well used on settings rows, notifications, and service cards.
class ClicksIconWell extends StatelessWidget {
  final IconData icon;
  final Color? foreground;
  final Color? background;
  final double size;

  const ClicksIconWell({
    super.key,
    required this.icon,
    this.foreground,
    this.background,
    this.size = 40,
  });

  @override
  Widget build(BuildContext context) {
    final fg = foreground ?? ColorsManager.mainColor;
    return Container(
      width: size.w,
      height: size.w,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: background ?? Colors.white,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: ColorsManager.cardBorder),
      ),
      child: Icon(icon, color: fg, size: (size * 0.5).sp),
    );
  }
}
