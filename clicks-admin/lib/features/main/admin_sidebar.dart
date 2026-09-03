import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/auth/admin_roles.dart';
import '../../core/navigation/admin_nav_config.dart';
import '../../core/services/sidebar_badge_service.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_decorations.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/components/primary_button.dart';

class AdminSidebar extends StatelessWidget {
  const AdminSidebar({
    super.key,
    required this.currentPath,
    required this.role,
    required this.onNavigate,
    required this.onLogout,
    this.isDrawer = false,
  });

  final String currentPath;
  final String? role;
  final ValueChanged<String> onNavigate;
  final VoidCallback onLogout;
  final bool isDrawer;

  static const sidebarWidth = 292.0;

  bool _isActive(String path) {
    if (currentPath == path) return true;
    if (path != '/dashboard' && currentPath.startsWith('$path/')) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final items = AdminRoles.filterNavItems(kAdminNavItems, role);
    final badges = SidebarBadgeService.instance;

    return Material(
      elevation: isDrawer ? 16 : 0,
      shadowColor: const Color(0x2E101828),
      child: Container(
        width: sidebarWidth,
        decoration: AppDecorations.sidebar(),
        child: Column(
          children: [
            Container(
              height: 64,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.border)),
              ),
              child: GestureDetector(
                onTap: () => onNavigate('/dashboard'),
                child: SvgPicture.asset(
                  'assets/logo/Logo.svg',
                  height: 40,
                  placeholderBuilder: (_) => SvgPicture.asset(
                    'assets/icons/clicks_logo.svg',
                    height: 40,
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.md,
                  AppSpacing.md,
                  120,
                ),
                children: [
                  for (final item in items)
                    _NavTile(
                      item: item,
                      active: _isActive(item.path),
                      badgeCount: badges.badgeFor(item.badge),
                      onTap: () => onNavigate(item.path),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.pageBackground,
                  borderRadius: BorderRadius.circular(AppRadii.lg),
                  border: Border.all(color: AppColors.border),
                ),
                child: PrimaryButton(
                  label: 'Logout',
                  outlined: true,
                  onPressed: onLogout,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavTile extends StatefulWidget {
  const _NavTile({
    required this.item,
    required this.active,
    required this.badgeCount,
    required this.onTap,
  });

  final AdminNavItem item;
  final bool active;
  final int badgeCount;
  final VoidCallback onTap;

  @override
  State<_NavTile> createState() => _NavTileState();
}

class _NavTileState extends State<_NavTile> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.active;
    Color bg = Colors.transparent;
    if (active) {
      bg = AppColors.navHighlight;
    } else if (_hovered) {
      bg = AppColors.selection;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: Material(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadii.md),
          child: InkWell(
            onTap: widget.onTap,
            borderRadius: BorderRadius.circular(AppRadii.md),
            hoverColor: Colors.transparent,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: 10,
              ),
              child: Row(
                children: [
                  SvgPicture.asset(
                    widget.item.iconAsset,
                    width: 22,
                    height: 22,
                    colorFilter: ColorFilter.mode(
                      active || _hovered ? AppColors.primary : AppColors.textMuted,
                      BlendMode.srcIn,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      widget.item.label,
                      style: AdminTypography.body.copyWith(
                        fontWeight: FontWeight.w500,
                        color: active || _hovered
                            ? AppColors.primary
                            : AppColors.textMuted,
                      ),
                    ),
                  ),
                  if (widget.badgeCount > 0)
                    Container(
                      constraints: const BoxConstraints(minWidth: 20),
                      height: 20,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                        color: AppColors.danger,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        widget.badgeCount > 99 ? '99+' : '${widget.badgeCount}',
                        style: AdminTypography.caption.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                          height: 1,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
