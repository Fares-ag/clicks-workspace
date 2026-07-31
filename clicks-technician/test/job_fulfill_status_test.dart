import 'package:clicks_technician/core/config/job_fulfill_status.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('JobFulfillStatus.isBlocking', () {
    test('blocks fulfill-path statuses', () {
      for (final status in [
        'accepted',
        'en_route',
        'arrived',
        'in_progress',
      ]) {
        expect(JobFulfillStatus.isBlocking(status), isTrue);
      }
    });

    test('blocks completed until paid', () {
      expect(
        JobFulfillStatus.isBlocking('completed', paymentStatus: 'pending'),
        isTrue,
      );
      expect(
        JobFulfillStatus.isBlocking('completed', paymentStatus: 'paid'),
        isFalse,
      );
    });

    test('does not block idle or incoming-only states', () {
      expect(JobFulfillStatus.isBlocking(''), isFalse);
      expect(JobFulfillStatus.isBlocking('assigned'), isFalse);
      expect(JobFulfillStatus.isBlocking('cancelled'), isFalse);
    });
  });
}
