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

  /// Re-send last accepted pin on this interval for liveness (no new GPS read).
  static const Duration heartbeatInterval = Duration(seconds: 12);

  /// How often the REST path still runs while the socket looks healthy.
  ///
  /// REST is the fallback transport, but it is also the only thing that
  /// corrects a socket that has gone quiet without disconnecting — so it keeps
  /// ticking over slowly rather than stopping entirely.
  static const Duration restFallbackInterval = Duration(seconds: 30);
}
