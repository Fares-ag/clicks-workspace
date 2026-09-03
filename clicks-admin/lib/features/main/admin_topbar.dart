import 'package:flutter/material.dart';

import '../../core/auth/admin_roles.dart';
import '../../core/navigation/admin_nav_config.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class AdminTopBar extends StatelessWidget implements PreferredSizeWidget {
  const AdminTopBar({
    super.key,
    required this.currentPath,
    required this.role,
    required this.userName,
    this.onMenuTap,
    this.actions,
  });

  final String currentPath;
  final String? role;
  final String userName;
  final VoidCallback? onMenuTap;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(72);

  String get _initials {
    final parts = userName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || userName.isEmpty) return 'A';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 0,
      child: Container(
        height: 72,
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        child: Row(
          children: [
            if (onMenuTap != null)
              IconButton(
                icon: const Icon(Icons.menu_rounded),
                tooltip: 'Menu',
                onPressed: onMenuTap,
              ),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titleForPath(currentPath), style: AdminTypography.heading),
                  Text(
                    AdminRoles.displayName(role),
                    style: AdminTypography.caption.copyWith(color: AppColors.muted),
                  ),
                ],
              ),
            ),
            if (actions != null) ...actions!,
            const SizedBox(width: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.pageBackground,
                borderRadius: BorderRadius.circular(AppRadii.lg),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: AppColors.navHighlight,
                    child: Text(
                      _initials,
                      style: AdminTypography.caption.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        userName.isEmpty ? 'Admin' : userName,
                        style: AdminTypography.caption.copyWith(
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      Text(
                        AdminRoles.displayName(role),
                        style: AdminTypography.caption.copyWith(
                          fontSize: 11,
                          color: AppColors.muted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
