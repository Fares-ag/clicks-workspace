import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/customer_notification_router.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/sos_services/event_scope.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:flutter_test/flutter_test.dart';

/// WS-B 7: the session routing table, one row per status the server can
/// report (scenarios 11, 45, 57, 58, 63, 76).
const _jobId = '507f1f77bcf86cd799439a01';
const _sosId = '507f1f77bcf86cd799439b02';

Map<String, dynamic> _job(String status, {String payment = 'unpaid', Map? garage}) => {
      '_id': _jobId,
      'job_status': status,
      'payment_status': payment,
      'job_reference': 'J-1',
      'locationCoordinates': {
        'type': 'Point',
        'coordinates': [51.5, 25.3],
      },
      if (garage != null) 'garage': garage,
    };

Map<String, dynamic> _live(String status, {Map? garage}) {
  final job = _job(status, garage: garage);
  return {
    'session_kind': status,
    'live_job': job,
    'active_job': job,
    'has_active_session': true,
  };
}

void main() {
  group('SessionResume.resolve — live job statuses', () {
    final table = <String, (String route, String? phase)>{
      'pending': (Routes.findingTechnician, null),
      'assigned': (Routes.technicianTracking, 'assigned'),
      'accepted': (Routes.technicianTracking, 'assigned'),
      'en_route': (Routes.technicianTracking, 'en_route'),
      'arrived': (Routes.technicianTracking, 'arrived'),
      'in_progress': (Routes.jobInProgress, null),
      'on_hold': (Routes.activityDetails, null),
    };
    table.forEach((status, expected) {
      test('$status → ${expected.$1}${expected.$2 == null ? '' : ' (${expected.$2})'}', () {
        final target = SessionResume.resolve(_live(status));
        expect(target.route, expected.$1);
        expect(target.jobId, _jobId);
        expect(target.phase, expected.$2);
        expect(target.key, '${expected.$1}|$_jobId');
      });
    });

    test('assigned never starts in a fee phase (scenario 63)', () {
      for (final status in ['assigned', 'accepted']) {
        expect(SessionResume.trackingInitialPhase(status, null), 'assigned');
      }
      expect(SessionResume.trackingInitialPhase('en_route', null), 'en_route');
    });

    test('car at the garage → job details; returning → tracking', () {
      expect(
        SessionResume.resolve(_live('on_hold', garage: {'phase': 'at_garage'})).route,
        Routes.activityDetails,
      );
      final back = SessionResume.resolve(_live('accepted', garage: {'phase': 'returning'}));
      expect(back.route, Routes.technicianTracking);
      expect(back.phase, 'returning');
    });
  });

  group('SessionResume.resolve — finished jobs', () {
    test('completed-unpaid → payment hold', () {
      final job = _job('completed');
      final target = SessionResume.resolve({
        'session_kind': 'unpaid',
        'live_job': null,
        'unpaid_job': job,
        'active_job': job,
      });
      expect(target.route, Routes.paymentHold);
      expect(target.jobId, _jobId);
    });

    test('completed-paid-unrated → home with a one-time rating prompt', () {
      final target = SessionResume.resolve({
        'session_kind': null,
        'live_job': null,
        'unpaid_job': null,
        'active_job': null,
        'rating_prompt_job': {'_id': _jobId, 'job_reference': 'J-1'},
      });
      expect(target.route, Routes.home);
      expect(target.ratingPromptJobId, _jobId);
    });

    test('cancelled → home, nothing to prompt', () {
      final target = SessionResume.resolve({
        'session_kind': null,
        'live_job': null,
        'unpaid_job': null,
        'active_job': null,
        'rating_prompt_job': null,
      });
      expect(target.route, Routes.home);
      expect(target.ratingPromptJobId, isNull);
    });
  });

  group('SessionResume.resolve — SOS', () {
    test('pending SOS → timer; in_call → in-call', () {
      expect(
        SessionResume.resolve({
          'session_kind': 'pending_sos',
          'active_sos': {'_id': _sosId, 'status': 'pending'},
        }).route,
        Routes.timerSos,
      );
      final inCall = SessionResume.resolve({
        'session_kind': 'in_call',
        'active_sos': {'_id': _sosId, 'status': 'in_call'},
      });
      expect(inCall.route, Routes.inCall);
      expect(inCall.sosId, _sosId);
    });

    test('an SOS outranks the live job of another car', () {
      final session = _live('en_route')
        ..['active_sos'] = {'_id': _sosId, 'status': 'pending'};
      expect(SessionResume.resolve(session).route, Routes.timerSos);
    });
  });

  group('Notification tap routing (scenario 72)', () {
    test('a live job routes by its own status', () {
      final s = CustomerNotificationRouter.sessionForJob(_job('arrived'))!;
      final target = SessionResume.resolve(s);
      expect(target.route, Routes.technicianTracking);
      expect(target.phase, 'arrived');
    });

    test('completed unpaid → payment; completed paid / cancelled → details', () {
      expect(
        SessionResume.resolve(
          CustomerNotificationRouter.sessionForJob(_job('completed'))!,
        ).route,
        Routes.paymentHold,
      );
      expect(
        CustomerNotificationRouter.sessionForJob(_job('completed', payment: 'paid')),
        isNull,
      );
      expect(CustomerNotificationRouter.sessionForJob(_job('cancelled')), isNull);
    });
  });

  group('EventScope (scenario 62)', () {
    const mine = EventScope(jobId: _jobId);
    test('events for another job are ignored', () {
      expect(mine.matchesState(JobCompleted(_jobId, 0, null, null)), isTrue);
      expect(mine.matchesState(JobCompleted('other', 0, null, null)), isFalse);
      expect(mine.matchesState(JobCancelled('other')), isFalse);
    });

    test('an SOS screen takes its SOS and that SOS\'s job, nothing else', () {
      const sos = EventScope(sosId: _sosId);
      expect(sos.matchesState(SosCancelled(sosId: _sosId)), isTrue);
      expect(sos.matchesState(SosCancelled(sosId: 'other')), isFalse);
      expect(
        sos.matchesState(TechnicianAssigned(const {}, _jobId, sosId: _sosId)),
        isTrue,
      );
      expect(
        sos.matchesState(TechnicianAssigned(const {}, 'other-job', sosId: 'other')),
        isFalse,
      );
      expect(sos.matchesState(JobCancelled('j2', sosId: 'other')), isFalse);
    });

    test('local states (errors, loading) always reach the screen', () {
      expect(mine.matchesState(SosError('x')), isTrue);
      expect(mine.matchesState(SosLoading()), isTrue);
    });
  });
}
