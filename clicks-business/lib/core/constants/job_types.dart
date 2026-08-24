/// Canonical job types — keep in sync with clicks-shared/constants/jobTypes.js
class JobTypeOption {
  const JobTypeOption({required this.value, required this.label});

  final String value;
  final String label;
}

const kJobTypes = <JobTypeOption>[
  JobTypeOption(value: 'Towing', label: 'Towing'),
  JobTypeOption(
    value: 'Jump start',
    label: 'Jump start / Battery boost',
  ),
  JobTypeOption(
    value: 'Flat tire',
    label: 'Flat tire / Tire change',
  ),
  JobTypeOption(
    value: 'Lockout',
    label: 'Lockout / Key locked in car',
  ),
  JobTypeOption(value: 'Fuel delivery', label: 'Fuel delivery'),
  JobTypeOption(
    value: 'Battery replacement',
    label: 'Battery replacement',
  ),
  JobTypeOption(
    value: 'Accident assistance',
    label: 'Accident assistance',
  ),
];

String jobTypeLabel(String? jobType) {
  if (jobType == null || jobType.isEmpty) return '';
  for (final option in kJobTypes) {
    if (option.value == jobType) return option.label;
  }
  return jobType;
}
