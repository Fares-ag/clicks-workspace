import 'sos_cubit.dart';

/// Does a realtime event belong to the screen showing it? (scenario 62)
///
/// A customer can have two live jobs (two cars) — or an SOS plus a job — and
/// every socket event reaches every screen through the one [SosCubit]. Each
/// screen therefore keeps only events for ITS job / SOS:
///
///  * an event with a job id matches only a screen showing that job;
///  * otherwise an event with an SOS id matches only a screen for that SOS;
///  * an event with neither id is only accepted by a screen that has no id
///    of its own yet (legacy payloads).
class EventScope {
  const EventScope({this.jobId, this.sosId});

  final String? jobId;
  final String? sosId;

  static bool _has(String? s) => s != null && s.isNotEmpty;

  bool matches({String? eventJobId, String? eventSosId}) {
    if (_has(eventJobId) && _has(jobId)) return eventJobId == jobId;
    if (_has(eventSosId) && _has(sosId)) return eventSosId == sosId;
    // Nothing comparable: only a screen with no identity of its own yet.
    return !_has(jobId) && !_has(sosId);
  }

  /// [matches] for a [SosState]; states that carry no ids (loading, errors
  /// from this device's own requests) always match.
  bool matchesState(SosState state) {
    final ids = idsOf(state);
    if (ids == null) return true;
    return matches(eventJobId: ids.$1, eventSosId: ids.$2);
  }

  /// (jobId, sosId) carried by a realtime state, or null for local states.
  static (String, String)? idsOf(SosState s) {
    if (s is SosCreated) return ('', s.sosId);
    if (s is SosInCall) return ('', s.sosId);
    if (s is SosStillConnecting) return ('', s.sosId);
    if (s is SosScheduled) return ('', s.sosId);
    if (s is SosClosed) return ('', s.sosId);
    if (s is SosCancelled) return ('', s.sosId);
    if (s is SosExpired) return ('', s.sosId);
    if (s is TechnicianAssigned) return (s.jobId, s.sosId);
    if (s is TechnicianAccepted) return (s.jobId, '');
    if (s is TechnicianEnRoute) return (s.jobId, '');
    if (s is LocationUpdated) return (s.jobId, '');
    if (s is TechnicianArrived) return (s.jobId, '');
    if (s is JobStarted) return (s.jobId, '');
    if (s is JobCompleted) return (s.jobId, '');
    if (s is PaymentConfirmed) return (s.jobId, '');
    if (s is JobCancelled) return (s.jobId, s.sosId);
    if (s is JobReassigning) return (s.jobId, s.sosId);
    if (s is JobOnHold) return (s.jobId, '');
    if (s is JobResumed) return (s.jobId, '');
    if (s is JobAtGarage) return (s.jobId, '');
    if (s is JobGarageReady) return (s.jobId, '');
    return null;
  }
}
