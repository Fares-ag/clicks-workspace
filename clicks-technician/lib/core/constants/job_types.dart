/// Canonical job types — keep in sync with clicks-shared/constants/jobTypes.js
class JobTypeOption {
  const JobTypeOption({required this.value, required this.label});

  final String value;
  final String label;
}

const kJobTypes = <JobTypeOption>[
  JobTypeOption(value: 'Towing', label: 'Towing'),
  JobTypeOption(value: 'Jump Start', label: 'Jump Start'),
  JobTypeOption(value: 'Flat Tire', label: 'Flat Tire'),
  JobTypeOption(value: 'Tire Change', label: 'Tire Change'),
  JobTypeOption(value: 'Lock Out', label: 'Lock Out'),
  JobTypeOption(value: 'Fuel Delivery', label: 'Fuel Delivery'),
  JobTypeOption(value: 'Battery Replacement', label: 'Battery Replacement'),
  JobTypeOption(value: 'Accident', label: 'Accident'),
  JobTypeOption(value: 'Overheating', label: 'Overheating'),
  JobTypeOption(value: 'No Start', label: 'No Start'),
  JobTypeOption(value: 'Electrical', label: 'Electrical'),
  JobTypeOption(value: 'Mechanical', label: 'Mechanical'),
  JobTypeOption(value: 'Gear Box', label: 'Gear Box'),
  JobTypeOption(value: 'Fuel Bump', label: 'Fuel Bump'),
  JobTypeOption(value: 'Body Work', label: 'Body Work'),
  JobTypeOption(value: 'Car Wash', label: 'Car Wash'),
];

const _legacyJobTypeLabels = <String, String>{
  'Jump start': 'Jump Start',
  'Flat tire': 'Flat Tire',
  'Lockout': 'Lock Out',
  'Fuel delivery': 'Fuel Delivery',
  'Battery replacement': 'Battery Replacement',
  'Accident assistance': 'Accident',
  'Tires': 'Tires (legacy)',
  'Engines': 'Engines (legacy)',
  'Gearbox': 'Gear Box (legacy)',
  'keyless_car_opening': 'Lock Out (legacy)',
  'tire_change': 'Tire Change (legacy)',
};

String jobTypeLabel(String? jobType) {
  if (jobType == null || jobType.isEmpty) return '';
  for (final option in kJobTypes) {
    if (option.value == jobType) return option.label;
  }
  return _legacyJobTypeLabels[jobType] ?? jobType;
}
