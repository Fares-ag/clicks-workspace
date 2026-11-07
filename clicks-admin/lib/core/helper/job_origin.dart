/// Mirrors clicks-interface/src/utils/jobOrigin.js

String jobSourceName(Map<String, dynamic>? job) {
  if (job == null) return '';
  final source = job['source'];
  if (source is Map) {
    return source['mainSourceName']?.toString() ??
        source['name']?.toString() ??
        '';
  }
  if (source is String) return source;
  return '';
}

bool isBusinessPortalJob(Map<String, dynamic>? job) {
  if (job == null) return false;
  if (job['business_id'] != null || (job['businessName']?.toString().isNotEmpty ?? false)) {
    return true;
  }
  return RegExp(r'business\s*portal', caseSensitive: false).hasMatch(jobSourceName(job));
}

bool isTechnicianCreatedJob(Map<String, dynamic>? job) {
  if (job == null) return false;
  if (job['created_by_technician'] != null ||
      (job['createdByTechnicianName']?.toString().trim().isNotEmpty ?? false)) {
    return true;
  }
  return RegExp(r'technician\s*app', caseSensitive: false).hasMatch(jobSourceName(job));
}

bool isSourceLockedJob(Map<String, dynamic>? job) =>
    isBusinessPortalJob(job) || isTechnicianCreatedJob(job);

String formatJobSourceLabel(Map<String, dynamic>? job) {
  if (job == null) return '—';
  final display = job['sourceDisplay']?.toString();
  if (display != null && display.isNotEmpty) return display;
  final main = jobSourceName(job);
  if (main.isEmpty) return '—';
  final sub = job['subSource']?.toString().trim() ?? '';
  if (sub.isNotEmpty) return '$main — $sub';
  return main;
}
