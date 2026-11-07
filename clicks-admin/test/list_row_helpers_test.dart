import 'package:clicks_admin/core/components/status_pill.dart';
import 'package:clicks_admin/core/helper/list_row_helpers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('entityId reads string and populated maps', () {
    expect(entityId(null), isNull);
    expect(entityId(''), isNull);
    expect(entityId('abc'), 'abc');
    expect(entityId({'_id': 'xyz'}), 'xyz');
    expect(entityId({'id': '1'}), '1');
  });

  test('personName and displayRef', () {
    expect(personName({'firstName': 'Ada', 'lastName': 'Lovelace'}), 'Ada Lovelace');
    expect(displayRef({'jobId': 'JOB-12'}), 'JOB-12');
    expect(displayRef({'_id': 'abcdef123456'}), '123456');
  });

  test('formatPrice and paymentStatusOf', () {
    expect(formatPrice(120), 'QR 120');
    expect(formatPrice(12.5), 'QR 12.50');
    expect(formatPrice(null), 'TBD');
    expect(paymentStatusOf({'paymentStatus': 'Paid'}), 'paid');
    expect(paymentStatusOf({'payment_status': 'unpaid'}), 'unpaid');
  });

  test('status pill covers job and payment states', () {
    for (final status in [
      'pending',
      'assigned',
      'accepted',
      'en_route',
      'arrived',
      'in_progress',
      'completed',
      'cancelled',
      'on_hold',
      'paid',
      'unpaid',
      'claimed',
      'online',
      'on_job',
    ]) {
      expect(StatusPill.styleFor(status).textColor, isNotNull);
    }
  });
}
