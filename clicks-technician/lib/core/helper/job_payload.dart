/// Shared job-map helpers so session/socket merge can be unit-tested
/// without constructing [HomeCubit].
class JobPayload {
  JobPayload._();

  static String? id(Map<String, dynamic>? job) {
    if (job == null) return null;
    final raw = job['_id'] ?? job['job_id'] ?? job['id'];
    final value = raw?.toString() ?? '';
    return value.isEmpty ? null : value;
  }

  static String status(Map<String, dynamic>? job) {
    if (job == null) return '';
    return (job['job_status'] ?? job['status'] ?? '').toString();
  }

  /// Keep socket-assigned jobs that a slightly stale session omitted.
  ///
  /// Only [assigned] locals are preserved. Accepted/en-route jobs missing
  /// from the session were likely reassigned or completed on the server.
  static List<Map<String, dynamic>> mergeSessionJobs({
    required List<Map<String, dynamic>> sessionJobs,
    required List<Map<String, dynamic>> localJobs,
  }) {
    final byId = <String, Map<String, dynamic>>{};
    for (final job in sessionJobs) {
      final jobId = id(job);
      if (jobId == null) continue;
      byId[jobId] = Map<String, dynamic>.from(job);
    }
    for (final job in localJobs) {
      final jobId = id(job);
      if (jobId == null || byId.containsKey(jobId)) continue;
      if (status(job) == 'assigned') {
        byId[jobId] = Map<String, dynamic>.from(job);
      }
    }
    return byId.values.toList();
  }

  /// Drop [removedId] from the queue. If that job was on screen, focus the
  /// next queued job instead of wiping the whole session.
  static JobQueueAfterRemove afterJobRemoved({
    required List<Map<String, dynamic>> jobs,
    required String? removedId,
    required Map<String, dynamic>? activeJob,
    required String? focusedId,
  }) {
    final nextJobs = <Map<String, dynamic>>[];
    for (final job in jobs) {
      if (id(job) == removedId) continue;
      nextJobs.add(Map<String, dynamic>.from(job));
    }

    final activeId = id(activeJob);
    final removedWasActive =
        removedId != null &&
        removedId.isNotEmpty &&
        (activeId == removedId || focusedId == removedId);

    if (!removedWasActive) {
      return JobQueueAfterRemove(
        jobs: nextJobs,
        activeJob: activeJob,
        focusedId: focusedId,
      );
    }

    final next = nextJobs.isEmpty
        ? null
        : Map<String, dynamic>.from(nextJobs.first);
    return JobQueueAfterRemove(
      jobs: nextJobs,
      activeJob: next,
      focusedId: id(next),
    );
  }
}

class JobQueueAfterRemove {
  const JobQueueAfterRemove({
    required this.jobs,
    required this.activeJob,
    required this.focusedId,
  });

  final List<Map<String, dynamic>> jobs;
  final Map<String, dynamic>? activeJob;
  final String? focusedId;
}
