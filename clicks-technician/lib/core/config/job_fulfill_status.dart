/// Whether a job status blocks going offline / accepting overwrites.
class JobFulfillStatus {
  JobFulfillStatus._();

  static bool isBlocking(String status, {String? paymentStatus}) {
    if (status.isEmpty) return false;
    if (['accepted', 'en_route', 'arrived', 'in_progress'].contains(status)) {
      return true;
    }
    if (status == 'completed') {
      return paymentStatus != 'paid';
    }
    return false;
  }
}
