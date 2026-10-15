import 'package:clicks_technician/core/config/location_tracking.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('background stream has no movement filter so parked GPS still wakes Dart', () {
    expect(LocationTracking.streamDistanceFilterMeters, 0);
  });

  test('shouldSendLiveness is due when nothing has been sent yet', () {
    final now = DateTime.utc(2026, 10, 15, 10);
    expect(LocationTracking.shouldSendLiveness(now, null), isTrue);
  });

  test('shouldSendLiveness waits out the heartbeat interval', () {
    final now = DateTime.utc(2026, 10, 15, 10);
    expect(
      LocationTracking.shouldSendLiveness(
        now,
        now.subtract(const Duration(seconds: 11)),
      ),
      isFalse,
    );
    expect(
      LocationTracking.shouldSendLiveness(
        now,
        now.subtract(const Duration(seconds: 12)),
      ),
      isTrue,
    );
  });
}
