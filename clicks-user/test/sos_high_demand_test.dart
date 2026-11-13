import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/features/home/timer_sos_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SosCubit applies high_demand from the create payload', () {
    final cubit = SosCubit(CustomerSocketService());
    addTearDown(cubit.close);
    cubit.applyCreatedForTest({'sos_id': 'sos-1', 'high_demand': true});
    expect(cubit.highDemand, isTrue);
    expect(cubit.sosId, 'sos-1');
    cubit.applyCreatedForTest({'sos_id': 'sos-1', 'high_demand': false});
    expect(cubit.highDemand, isFalse);
    cubit.reset();
    expect(cubit.highDemand, isFalse);
  });

  test('SosCubit applies high_demand from session extras', () {
    final cubit = SosCubit(CustomerSocketService());
    addTearDown(cubit.close);
    cubit.applyCreatedForTest({
      'sos_id': 'sos-2',
      'high_demand': false,
      'active_sos': {'high_demand': true},
    });
    expect(cubit.highDemand, isTrue);
  });

  test('TimerSosScreen shows the call card when demand is high', () {
    expect(
      showImmediateSosCallCard(timerExpired: false, highDemand: true),
      isTrue,
    );
    expect(
      showImmediateSosCallCard(timerExpired: true, highDemand: false),
      isTrue,
    );
    expect(
      showImmediateSosCallCard(timerExpired: false, highDemand: false),
      isFalse,
    );
  });
}
