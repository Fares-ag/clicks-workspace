/// Whether a job status blocks going offline / accepting overwrites / Add job.
class JobFulfillStatus {
  JobFulfillStatus._();

  static const _blockingFulfill = {
    'accepted',
    'en_route',
    'arrived',
    'in_progress',
  };

  static bool isBlocking(String status, {String? paymentStatus}) {
    if (status.isEmpty) return false;
    if (_blockingFulfill.contains(status)) {
      return true;
    }
    if (status == 'completed') {
      return paymentStatus != 'paid';
    }
    // on_hold is not blocking — dispatch holds; technician sees status only.
    return false;
  }
}
