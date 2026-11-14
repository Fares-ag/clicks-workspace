import 'package:clicks_user/core/components/clicks_logo.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Shared header: wordmark on the first row, optional page title below.
class ClicksAppHeader extends StatelessWidget implements PreferredSizeWidget {
  final String? title;
  final List<Widget>? actions;
  final Color? backgroundColor;
  final bool showBottomBorder;
  final bool automaticallyImplyLeading;
  final Widget? leading;

  const ClicksAppHeader({
    super.key,
    this.title,
    this.actions,
    this.backgroundColor,
    this.showBottomBorder = true,
    this.automaticallyImplyLeading = false,
    this.leading,
  });

  bool get _hasTitle => title != null && title!.trim().isNotEmpty;

  double get _bottomHeight =>
      (_hasTitle ? 52.0 : 0) + (showBottomBorder ? 1.0 : 0);

  @override
  Size get preferredSize => Size.fromHeight(56 + _bottomHeight);

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ?? Colors.white;
    final showLeading = automaticallyImplyLeading || leading != null;

    return AppBar(
      automaticallyImplyLeading: automaticallyImplyLeading,
      leading: leading,
      backgroundColor: bg,
      surfaceTintColor: bg,
      elevation: 0,
      scrolledUnderElevation: 0,
      toolbarHeight: 56,
      centerTitle: false,
      titleSpacing: showLeading ? 0 : 16.w,
      iconTheme: const IconThemeData(color: ColorsManager.mainColor),
      title: const ClicksLogo(height: 24),
      actions: actions == null
          ? null
          : [
              ...actions!,
              SizedBox(width: 8.w),
            ],
      bottom: PreferredSize(
        preferredSize: Size.fromHeight(_bottomHeight),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_hasTitle)
              Padding(
                padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 10),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    title!,
                    style: TextStyles.font20Bold.copyWith(
                      fontSize: 20.sp,
                      height: 1.2,
                    ),
                  ),
                ),
              ),
            if (showBottomBorder)
              const Divider(
                height: 1,
                thickness: 1,
                color: ColorsManager.cardBorder,
              ),
          ],
        ),
      ),
    );
  }
}
