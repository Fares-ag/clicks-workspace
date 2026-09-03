import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/auth/admin_roles.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';

class AdminDrawer extends StatelessWidget {
  const AdminDrawer({
    super.key,
    required this.role,
    required this.onSelectModule,
    required this.onLogout,
  });

  final String? role;
  final void Function(String route) onSelectModule;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    final items = <_DrawerItem>[
      _DrawerItem('Vehicles', Routes.vehicles, 'vehicles'),
      _DrawerItem('Clients', Routes.clients, 'clients'),
      _DrawerItem('Support Tickets', Routes.supportTickets, 'support-tickets'),
      if (AdminRoles.isFullAdmin(role)) ...[
        _DrawerItem('Businesses', Routes.businesses, 'businesses'),
        _DrawerItem('Partners', Routes.partners, 'partners'),
        _DrawerItem('Finance', Routes.finance, 'finance'),
        _DrawerItem('Finance Users', Routes.financeUsers, 'finance-users'),
        _DrawerItem('Admin Management', Routes.adminManagement, 'admin-management'),
        _DrawerItem('Performance', Routes.performance, 'performance'),
        _DrawerItem('Heat Map', Routes.heatMap, 'heat-map'),
        _DrawerItem('Sources', Routes.sources, 'sources'),
        _DrawerItem('Vehicle Makes', Routes.vehicleMakes, 'vehicle-makes'),
      ],
    ].where((i) => AdminRoles.canAccessModule(role, i.moduleId)).toList();

    return Drawer(
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Text(
                'More modules',
                style: GoogleFonts.dmSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final item in items)
                    ListTile(
                      title: Text(item.label),
                      onTap: () => onSelectModule(item.route),
                    ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: AppColors.danger),
              title: Text(
                'Log out',
                style: GoogleFonts.dmSans(color: AppColors.danger),
              ),
              onTap: onLogout,
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem {
  const _DrawerItem(this.label, this.route, this.moduleId);
  final String label;
  final String route;
  final String moduleId;
}
