import '../navigation/admin_nav_config.dart';

/// RBAC helpers — mirrors clicks-interface/src/utils/adminRoles.js
class AdminRoles {
  AdminRoles._();

  static const fullAdminRoles = ['Super Admin', 'Admin'];

  static const opsRoles = [
    'Super Admin',
    'Admin',
    'Job Dispatcher',
    'Coordinator',
    'Call Center Agent',
  ];

  static const fullAdminOnlyPrefixes = [
    '/admin-management',
    '/heat-map',
    '/performance',
    '/sources',
    '/businesses',
    '/finance-users',
    '/partners',
    '/vehicle-makes',
    '/vehicle-models',
    '/finance',
    '/calls',
  ];

  static const opsAllowedPrefixes = [
    '/dashboard',
    '/technicians',
    '/vehicles',
    '/live-map',
    '/jobs',
    '/leads',
    '/sos',
    '/service-requests',
    '/clients',
    '/support-tickets',
  ];

  static bool isFullAdmin(String? role) =>
      role != null && fullAdminRoles.contains(role);

  static bool isOpsRole(String? role) =>
      role != null && opsRoles.contains(role);

  static bool canAccessPath(String? role, String pathname) {
    if (role == null || role.isEmpty) return false;
    if (isFullAdmin(role)) return true;
    if (!isOpsRole(role)) return false;

    final path = pathname.split('?').first;
    if (fullAdminOnlyPrefixes.any((prefix) => path.startsWith(prefix))) {
      return false;
    }
    return opsAllowedPrefixes.any((prefix) => path.startsWith(prefix));
  }

  static bool canAccessModule(String? role, String moduleId) {
    final path = _pathForModule(moduleId);
    if (path == null) return false;
    return canAccessPath(role, path);
  }

  static String? _pathForModule(String moduleId) {
    for (final item in kAdminNavItems) {
      if (item.moduleId == moduleId) return item.path;
    }
    return null;
  }

  static List<AdminNavItem> filterNavItems(
    List<AdminNavItem> items,
    String? role,
  ) {
    return items.where((item) => canAccessPath(role, item.path)).toList();
  }

  static String displayName(String? role) => role ?? 'Unknown';
}
