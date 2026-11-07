/// The amount the customer will actually be charged for a job.
///
/// The server sends `pricing.total` (base + repairs − membership cover) on the
/// session, active-job and job-detail payloads. That is what SkipCash charges,
/// so it is what the app shows — never the bare `job.price`, and never
/// truncated to an integer.
num? jobPayableTotal(Map job) {
  final pricing = job['pricing'];
  if (pricing is Map) {
    final total = pricing['total'];
    if (total is num) return total;
    final parsed = num.tryParse(total?.toString() ?? '');
    if (parsed != null) return parsed;
  }
  final raw = job['price'] ?? job['estimate'];
  if (raw is num) return raw;
  return num.tryParse(raw?.toString() ?? '');
}

/// "150.00" — QAR amounts always carry two decimals.
String formatQarAmount(num value) => value.toStringAsFixed(2);
