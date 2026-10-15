/// GPS dispatch policy for technician location sharing with dispatch.
///
/// Local GPS ([HomeCubit.lastLatitude/Longitude]) may update more often for
/// job proximity; only fixes passing these gates are sent to the server.
class LocationTracking {
  LocationTracking._();

  /// Minimum movement before changing the Live Map pin (meters).
  static const double minDispatchMoveMeters = 15;

  /// Reject GPS fixes worse than this accuracy (meters).
  static const double maxAcceptableAccuracyMeters = 50;

  /// OS distance filter for the background stream.
  ///
  /// Must stay 0. A 5–15 m filter is why parked techs looked disconnected with
  /// the app still in Recents: iOS (and some Android OEMs) suspend the Dart
  /// isolate between location events, so the 12s Timer never fires and the
  /// liveness ping never leaves the phone. Time-based native callbacks are
  /// what keep both the isolate and the heartbeat alive while parked.
  static const int streamDistanceFilterMeters = 0;

  /// Re-send last accepted pin on this interval for liveness (no new GPS read).
  static const Duration heartbeatInterval = Duration(seconds: 12);

  /// How often the REST path still runs while the socket looks healthy.
  ///
  /// REST is the fallback transport, but it is also the only thing that
  /// corrects a socket that has gone quiet without disconnecting — so it keeps
  /// ticking over slowly rather than stopping entirely.
  static const Duration restFallbackInterval = Duration(seconds: 30);

  /// Whether a liveness replay is due (movement-filtered GPS still wakes us).
  static bool shouldSendLiveness(DateTime now, DateTime? lastSentAt) {
    if (lastSentAt == null) return true;
    return now.difference(lastSentAt) >= heartbeatInterval;
  }
}
