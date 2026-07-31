import 'package:flutter_test/flutter_test.dart';

import 'package:clicks_technician/core/config/job_fulfill_status.dart';

void main() {
  test('placeholder removed — see job_fulfill_status_test.dart', () {
    expect(JobFulfillStatus.isBlocking('accepted'), isTrue);
  });
}
