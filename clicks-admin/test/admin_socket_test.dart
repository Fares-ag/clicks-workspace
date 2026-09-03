import 'package:flutter_test/flutter_test.dart';

import 'package:clicks_admin/core/socket/admin_socket_service.dart';

void main() {
  test('notificationId dedupes SOS by sos_id', () {
    final id = AdminSocketService.notificationId(
      AdminNotificationType.sos,
      {'sos_id': 'abc123', 'id': 'other'},
    );
    expect(id, 'abc123');
  });

  test('notificationId uses service_request_id for service requests', () {
    final id = AdminSocketService.notificationId(
      AdminNotificationType.serviceRequest,
      {'service_request_id': 'sr-1'},
    );
    expect(id, 'sr-1');
  });
}
