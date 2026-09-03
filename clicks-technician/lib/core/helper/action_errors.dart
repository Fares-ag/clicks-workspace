import 'package:clicks_technician/core/constants/job_status_labels.dart';
import 'package:dio/dio.dart';

/// Turns API error payloads into technician-friendly messages.
class ActionErrors {
  ActionErrors._();

  static String fromResponse(Response<dynamic> response) {
    final data = response.data;
    if (data is Map) {
      final mapped = _fromMap(data);
      if (mapped != null) return mapped;
    }
    return _defaultForStatus(response.statusCode);
  }

  static String? _fromMap(Map<dynamic, dynamic> data) {
    final error = data['error']?.toString().trim();
    final message = data['message']?.toString().trim();
    final details = data['details']?.toString().trim();

    final primary = (error != null && error.isNotEmpty)
        ? error
        : (message != null && message.isNotEmpty)
            ? message
            : null;
    if (primary == null) return null;

    return _humanize(primary, details: details);
  }

  static String _humanize(String primary, {String? details}) {
    final lower = primary.toLowerCase();

    if (lower == 'mark completed failed') {
      if (details != null && details.isNotEmpty) {
        return 'Could not complete the job: $details';
      }
      return 'Could not complete the job. Try again, or contact dispatch if this keeps happening.';
    }

    if (lower.startsWith('cannot complete job with status:')) {
      final status = primary.split(':').last.trim();
      final label = JobStatusLabels.labelFor(status);
      return 'This job is still "$label". Go back to the job screen and tap Start Job before completing.';
    }

    if (lower.contains('payment must be collected')) {
      return 'Collect payment before completing the job.';
    }

    if (lower.contains('customer signature is required')) {
      return 'Customer signature is required. Tap "Collect customer signature" and save it before completing.';
    }

    if (lower.contains('ask dispatch to put your current job on hold before creating another')) {
      return 'Ask dispatch to put your current job on hold before adding another.';
    }

    if (lower.contains('put your current job on hold before creating another')) {
      return 'Ask dispatch to put your current job on hold before adding another.';
    }

    if (lower == 'hold reason is required') {
      return 'Enter a reason for putting this job on hold.';
    }

    if (lower.startsWith('cannot put job on hold from status:')) {
      final status = primary.split(':').last.trim();
      final label = JobStatusLabels.labelFor(status);
      return 'This job cannot be put on hold from "$label".';
    }

    if (lower.contains('job id is required')) {
      return 'Enter the Job ID before completing.';
    }

    if (lower.contains('job id must be 64 characters')) {
      return 'Job ID is too long (max 64 characters).';
    }

    if (lower == 'job not found') {
      return 'This job is no longer available. Pull to refresh or reopen the job from Activity.';
    }

    if (lower == 'forbidden') {
      return 'You are not assigned to this job anymore.';
    }

    if (details != null && details.isNotEmpty && details != primary) {
      return '$primary ($details)';
    }

    return primary;
  }

  static String _defaultForStatus(int? statusCode) {
    switch (statusCode) {
      case 401:
        return 'Session expired — log in again.';
      case 403:
        return 'You do not have permission to do that.';
      case 404:
        return 'Job not found. Pull to refresh and try again.';
      case 409:
        return 'This action conflicted with another update. Pull to refresh and try again.';
      case 503:
        return 'Server is busy. Wait a moment and try again.';
      default:
        if (statusCode != null && statusCode >= 500) {
          return 'Server error. Try again, or contact dispatch if this continues.';
        }
        return 'Action failed. Check your connection and try again.';
    }
  }

  /// Client-side checks that mirror tech-api `/complete` gates.
  static String? completionReadiness(Map<String, dynamic>? job) {
    if (job == null) {
      return 'Job not found. Go back and reopen it from Activity.';
    }

    final status = (job['job_status'] ?? job['status'] ?? '').toString();
    if (status != 'in_progress') {
      final label = JobStatusLabels.labelFor(status);
      if (status.isEmpty) {
        return 'Job status is unknown. Go back and tap Start Job first.';
      }
      return 'Job must be In progress before completing (currently $label). '
          'Go back and tap Start Job.';
    }

    if (job['payment_status']?.toString() != 'paid') {
      return 'Collect payment before completing the job.';
    }

    final sigUrl = job['customerSignatureUrl']?.toString() ?? '';
    final signedAt = job['customerSignedAt'];
    if (sigUrl.isEmpty || signedAt == null) {
      return 'Customer signature is required. Tap "Collect customer signature" first.';
    }

    return null;
  }
}
