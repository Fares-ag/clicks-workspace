import 'package:flutter_test/flutter_test.dart';

import 'package:clicks_admin/core/auth/admin_roles.dart';

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
  });
}
