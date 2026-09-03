/// Sidebar navigation — mirrors clicks-interface AdminSidebar navItems.
class AdminNavItem {
  const AdminNavItem({
    required this.label,
    required this.iconAsset,
    required this.path,
    this.badge,
    this.moduleId,
  });

  final String label;
  final String iconAsset;
  final String path;
  final String? badge;
  final String? moduleId;
}

const kAdminNavItems = <AdminNavItem>[
  AdminNavItem(
    label: 'Dashboard',
    iconAsset: 'assets/icons/dashboard.svg',
    path: '/dashboard',
    moduleId: 'dashboard',
  ),
  AdminNavItem(
    label: 'Admin Management',
    iconAsset: 'assets/icons/admin.svg',
    path: '/admin-management',
    moduleId: 'admin-management',
  ),
  AdminNavItem(
    label: 'Technician Management',
    iconAsset: 'assets/icons/technician.svg',
    path: '/technicians',
    moduleId: 'technicians',
  ),
  AdminNavItem(
    label: 'Vehicle Management',
    iconAsset: 'assets/icons/vehicle.svg',
    path: '/vehicles',
    moduleId: 'vehicles',
  ),
  AdminNavItem(
    label: 'Live Map',
    iconAsset: 'assets/icons/map.svg',
    path: '/live-map',
    moduleId: 'live-map',
  ),
  AdminNavItem(
    label: 'Heat Map',
    iconAsset: 'assets/icons/earnings-chart.svg',
    path: '/heat-map',
    moduleId: 'heat-map',
  ),
  AdminNavItem(
    label: 'Job Management',
    iconAsset: 'assets/icons/job.svg',
    path: '/jobs',
    moduleId: 'jobs',
  ),
  AdminNavItem(
    label: 'Leads',
    iconAsset: 'assets/icons/job.svg',
    path: '/leads',
    moduleId: 'leads',
    badge: 'leads',
  ),
  AdminNavItem(
    label: 'Business Management',
    iconAsset: 'assets/icons/li-heart-handshake.svg',
    path: '/businesses',
    moduleId: 'businesses',
  ),
  AdminNavItem(
    label: 'Finance',
    iconAsset: 'assets/icons/earnings-chart.svg',
    path: '/finance',
    moduleId: 'finance',
  ),
  AdminNavItem(
    label: 'Finance Users',
    iconAsset: 'assets/icons/admin.svg',
    path: '/finance-users',
    moduleId: 'finance-users',
  ),
  AdminNavItem(
    label: 'SOS Inbox',
    iconAsset: 'assets/icons/call.svg',
    path: '/sos',
    moduleId: 'sos',
    badge: 'sos',
  ),
  AdminNavItem(
    label: 'Service Requests',
    iconAsset: 'assets/icons/job.svg',
    path: '/service-requests',
    moduleId: 'service-requests',
    badge: 'service',
  ),
  AdminNavItem(
    label: 'Performance',
    iconAsset: 'assets/icons/performance.svg',
    path: '/performance',
    moduleId: 'performance',
  ),
  AdminNavItem(
    label: 'Source Configurator',
    iconAsset: 'assets/icons/configurator.svg',
    path: '/sources',
    moduleId: 'sources',
  ),
  AdminNavItem(
    label: 'Partner Management',
    iconAsset: 'assets/icons/performance.svg',
    path: '/partners',
    moduleId: 'partners',
  ),
  AdminNavItem(
    label: 'Support Tickets',
    iconAsset: 'assets/icons/li-heart-handshake.svg',
    path: '/support-tickets',
    moduleId: 'support-tickets',
  ),
  AdminNavItem(
    label: 'Clients',
    iconAsset: 'assets/icons/users.svg',
    path: '/clients',
    moduleId: 'clients',
  ),
];

String titleForPath(String path) {
  for (final item in kAdminNavItems) {
    if (path == item.path || path.startsWith('${item.path}/')) {
      return item.label;
    }
  }
  if (path.startsWith('/jobs/new')) return 'Add New Job';
  if (path.contains('/convert')) return 'Convert Lead';
  if (path.startsWith('/leads/new')) return 'Add Lead';
  if (path.startsWith('/jobs/')) return 'Job Details';
  if (path.startsWith('/leads/')) return 'Lead Details';
  if (path.startsWith('/technicians/')) return 'Technician Details';
  return 'Clicks Admin';
}
