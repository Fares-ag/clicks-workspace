String? entityId(dynamic value) {
  if (value == null) return null;
  if (value is String) return value.isEmpty ? null : value;
  if (value is Map) {
    final id = value['_id'] ?? value['id'];
    if (id == null) return null;
    final text = id.toString();
    return text.isEmpty ? null : text;
  }
  return value.toString();
}

String personName(dynamic value, {String fallback = ''}) {
  if (value is Map) {
    final first = value['firstName'] ?? value['first_name'] ?? '';
    final last = value['lastName'] ?? value['last_name'] ?? '';
    final name = '$first $last'.trim();
    if (name.isNotEmpty) return name;
    final full = (value['name'] ?? '').toString().trim();
    return full.isEmpty ? fallback : full;
  }
  if (value is String && value.trim().isNotEmpty) return value.trim();
  return fallback;
}

String displayRef(Map job) {
  final ref = job['jobId'] ?? job['job_reference'] ?? job['jobReference'];
  if (ref != null && ref.toString().trim().isNotEmpty) {
    return ref.toString();
  }
  final id = entityId(job['_id'] ?? job['id']) ?? '';
  if (id.length > 6) return id.substring(id.length - 6);
  return id;
}

String formatPrice(dynamic value) {
  if (value == null || value == '') return 'TBD';
  final n = value is num ? value : num.tryParse(value.toString());
  if (n == null) return 'TBD';
  if (n == n.roundToDouble()) return 'QR ${n.toInt()}';
  return 'QR ${n.toStringAsFixed(2)}';
}

String paymentStatusOf(Map job) {
  final raw = job['paymentStatus'] ?? job['payment_status'] ?? '';
  return raw.toString().toLowerCase();
}
