import 'package:flutter_test/flutter_test.dart';

import 'package:clicks_admin/core/auth/admin_roles.dart';
import 'package:clicks_admin/core/navigation/admin_nav_config.dart';

void main() {
  group('AdminRoles', () {
    test('full admin can access all modules', () {
      expect(AdminRoles.canAccessModule('Admin', 'finance'), isTrue);
      expect(AdminRoles.canAccessModule('Super Admin', 'partners'), isTrue);
      expect(AdminRoles.canAccessModule('Admin', 'sos'), isTrue);
    });

    test('ops role blocked from full-admin modules', () {
      expect(AdminRoles.canAccessModule('Job Dispatcher', 'finance'), isFalse);
      expect(AdminRoles.canAccessModule('Coordinator', 'partners'), isFalse);
      expect(AdminRoles.canAccessModule('Call Center Agent', 'admin-management'), isFalse);
    });

    test('ops role can access dispatch modules', () {
      expect(AdminRoles.canAccessModule('Job Dispatcher', 'sos'), isTrue);
      expect(AdminRoles.canAccessModule('Coordinator', 'jobs'), isTrue);
      expect(AdminRoles.canAccessModule('Call Center Agent', 'live-map'), isTrue);
    });

    test('unknown role denied', () {
      expect(AdminRoles.canAccessModule('Unknown', 'sos'), isFalse);
    });

    test('vehicle config is full-admin only and reachable', () {
      expect(AdminRoles.canAccessPath('Super Admin', '/vehicle-makes'), isTrue);
      expect(AdminRoles.canAccessPath('Super Admin', '/vehicle-models'), isTrue);
      expect(AdminRoles.canAccessModule('Super Admin', 'vehicle-makes'), isTrue);
      expect(AdminRoles.canAccessModule('Job Dispatcher', 'vehicle-makes'), isFalse);
      expect(AdminRoles.canAccessPath('Job Dispatcher', '/finance'), isFalse);
    });

    test('membership modules are full-admin only', () {
      expect(AdminRoles.canAccessPath('Super Admin', '/subscription-plans'), isTrue);
      expect(AdminRoles.canAccessPath('Admin', '/customer-memberships'), isTrue);
      expect(AdminRoles.canAccessPath('Job Dispatcher', '/subscription-plans'), isFalse);
      expect(AdminRoles.canAccessPath('Coordinator', '/customer-memberships'), isFalse);
    });

    test('every sidebar item has a unique icon', () {
      final codes = kAdminNavItems.map((e) => e.icon.codePoint).toList();
      expect(codes.toSet().length, codes.length);
    });
  });
}
