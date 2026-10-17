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

  test('shouldRefreshLocationUi throttles shell rebuilds without touching heartbeat', () {
    final now = DateTime.utc(2026, 10, 15, 10);
    expect(LocationTracking.shouldRefreshLocationUi(now, null), isTrue);
    expect(
      LocationTracking.shouldRefreshLocationUi(
        now,
        now.subtract(const Duration(milliseconds: 500)),
      ),
      isFalse,
    );
    expect(
      LocationTracking.shouldRefreshLocationUi(
        now,
        now.subtract(LocationTracking.locationUiInterval),
      ),
      isTrue,
    );
    expect(LocationTracking.heartbeatInterval, const Duration(seconds: 12));
    expect(LocationTracking.streamDistanceFilterMeters, 0);
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
