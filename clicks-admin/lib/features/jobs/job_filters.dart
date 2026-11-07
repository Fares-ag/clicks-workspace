class JobFilterOption {
  const JobFilterOption({required this.value, required this.label});
  final String value;
  final String label;
}

class JobFilters {
  const JobFilters({
    this.status = '',
    this.technician = '',
    this.dateFrom = '',
    this.dateTo = '',
    this.timeFrom = '',
    this.timeTo = '',
    this.paymentStatus = '',
    this.jobType = '',
    this.source = '',
    this.jobOrigin = '',
  });

  final String status;
  final String technician;
  final String dateFrom;
  final String dateTo;
  final String timeFrom;
  final String timeTo;
  final String paymentStatus;
  final String jobType;
  final String source;
  final String jobOrigin;

  static const empty = JobFilters();

  static const originOptions = [
    JobFilterOption(value: '', label: 'Any origin'),
    JobFilterOption(value: 'dispatch', label: 'Dispatch / admin'),
    JobFilterOption(value: 'business', label: 'Business portal'),
    JobFilterOption(value: 'technician', label: 'Technician-created'),
  ];

  static const paymentOptions = [
    JobFilterOption(value: '', label: 'Any payment'),
    JobFilterOption(value: 'paid', label: 'Paid'),
    JobFilterOption(value: 'unpaid', label: 'Unpaid'),
  ];

  JobFilters copyWith({
    String? status,
    String? technician,
    String? dateFrom,
    String? dateTo,
    String? timeFrom,
    String? timeTo,
    String? paymentStatus,
    String? jobType,
    String? source,
    String? jobOrigin,
  }) {
    return JobFilters(
      status: status ?? this.status,
      technician: technician ?? this.technician,
      dateFrom: dateFrom ?? this.dateFrom,
      dateTo: dateTo ?? this.dateTo,
      timeFrom: timeFrom ?? this.timeFrom,
      timeTo: timeTo ?? this.timeTo,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      jobType: jobType ?? this.jobType,
      source: source ?? this.source,
      jobOrigin: jobOrigin ?? this.jobOrigin,
    );
  }

  int get activeCount {
    return [
      status,
      technician,
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
      paymentStatus,
      jobType,
      source,
      jobOrigin,
    ].where((v) => v.trim().isNotEmpty).length;
  }
}
