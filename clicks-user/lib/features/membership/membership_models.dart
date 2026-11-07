class MembershipPlanInterval {
  final String interval;
  final int durationMonths;
  final num priceQar;
  final List<MembershipIncluded> included;

  const MembershipPlanInterval({
    required this.interval,
    required this.durationMonths,
    required this.priceQar,
    required this.included,
  });

  factory MembershipPlanInterval.fromJson(Map<String, dynamic> json) {
    final includedRaw = json['included'];
    return MembershipPlanInterval(
      interval: json['interval']?.toString() ?? 'month',
      durationMonths: int.tryParse('${json['durationMonths']}') ?? 1,
      priceQar: num.tryParse('${json['priceQar']}') ?? 0,
      included: includedRaw is List
          ? includedRaw
              .whereType<Map>()
              .map((e) => MembershipIncluded.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }
}

class MembershipIncluded {
  final List<String> serviceTypes;
  final int quota;
  final String bucket;

  const MembershipIncluded({
    required this.serviceTypes,
    required this.quota,
    required this.bucket,
  });

  factory MembershipIncluded.fromJson(Map<String, dynamic> json) {
    final types = json['serviceTypes'];
    return MembershipIncluded(
      serviceTypes: types is List ? types.map((e) => e.toString()).toList() : const [],
      quota: int.tryParse('${json['quota']}') ?? 0,
      bucket: json['bucket']?.toString() ?? '',
    );
  }
}

class MembershipPlan {
  final String id;
  final String code;
  final String nameEn;
  final String nameAr;
  final num discountPercent;
  final List<String> eligibleServiceTypes;
  final List<MembershipPlanInterval> intervals;
  /// Admin-controlled: do roadside emergencies (SOS, towing, jump start) count?
  final bool coversEmergency;
  /// Service types this plan never covers (shown under "What's covered").
  final List<String> excludedServiceTypes;

  const MembershipPlan({
    required this.id,
    required this.code,
    required this.nameEn,
    required this.nameAr,
    required this.discountPercent,
    required this.eligibleServiceTypes,
    required this.intervals,
    this.coversEmergency = false,
    this.excludedServiceTypes = const ['SOS', 'Towing', 'Jump Start', 'Breakdown Vehicle'],
  });

  factory MembershipPlan.fromJson(Map<String, dynamic> json) {
    final intervals = json['intervals'];
    final eligible = json['eligibleServiceTypes'];
    final coverage = json['coverage'];
    final excluded = coverage is Map ? coverage['excluded_service_types'] : null;
    final covers = json['coversEmergency'] == true ||
        (coverage is Map && coverage['covers_emergency'] == true);
    return MembershipPlan(
      coversEmergency: covers,
      excludedServiceTypes: excluded is List
          ? excluded.map((e) => e.toString()).toList()
          : covers
              ? const []
              : const ['SOS', 'Towing', 'Jump Start', 'Breakdown Vehicle'],
      id: (json['id'] ?? json['_id'])?.toString() ?? '',
      code: json['code']?.toString() ?? '',
      nameEn: json['name_en']?.toString() ?? '',
      nameAr: json['name_ar']?.toString() ?? '',
      discountPercent: num.tryParse('${json['discountPercent']}') ?? 0,
      eligibleServiceTypes:
          eligible is List ? eligible.map((e) => e.toString()).toList() : const [],
      intervals: intervals is List
          ? intervals
              .whereType<Map>()
              .map((e) => MembershipPlanInterval.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
    );
  }

  MembershipPlanInterval? skuFor(String interval) {
    for (final row in intervals) {
      if (row.interval == interval) return row;
    }
    return null;
  }

  String localizedName(bool arabic) =>
      arabic && nameAr.trim().isNotEmpty ? nameAr : nameEn;

  /// Checkout requires a real SubscriptionPlan `_id` from the API.
  bool get canCheckout =>
      RegExp(r'^[a-f0-9]{24}$', caseSensitive: false).hasMatch(id);
}

const _discountEligible = [
  'Battery Change',
  'Oil Change',
  'Full Service',
  'Car Wash - Interior',
  'Car Wash - Exterior',
  'Car Wash - Full',
  'Tyre Change',
  'Car Wash - Full Polish',
  'Car Tinting',
];

const _washTypes = [
  'Car Wash - Interior',
  'Car Wash - Exterior',
  'Car Wash - Full',
  'Car Wash - Full Polish',
];

/// Same Basic / Plus catalog as clicks-shared `membershipPlans.js`.
/// Used when the live API has not launched membership yet.
const defaultMembershipPlans = [
  MembershipPlan(
    id: 'preview-basic',
    code: 'basic',
    nameEn: 'Basic',
    nameAr: 'أساسي',
    discountPercent: 10,
    eligibleServiceTypes: _discountEligible,
    intervals: [
      MembershipPlanInterval(
        interval: 'month',
        durationMonths: 1,
        priceQar: 29,
        included: [
          MembershipIncluded(
            serviceTypes: ['Car Wash - Exterior'],
            quota: 1,
            bucket: 'wash-exterior',
          ),
        ],
      ),
      MembershipPlanInterval(
        interval: 'year',
        durationMonths: 12,
        priceQar: 199,
        included: [
          MembershipIncluded(
            serviceTypes: ['Car Wash - Exterior'],
            quota: 2,
            bucket: 'wash-exterior',
          ),
          MembershipIncluded(
            serviceTypes: ['Oil Change'],
            quota: 1,
            bucket: 'oil',
          ),
        ],
      ),
    ],
  ),
  MembershipPlan(
    id: 'preview-plus',
    code: 'plus',
    nameEn: 'Plus',
    nameAr: 'بلس',
    discountPercent: 15,
    eligibleServiceTypes: _discountEligible,
    intervals: [
      MembershipPlanInterval(
        interval: 'month',
        durationMonths: 1,
        priceQar: 39,
        included: [
          MembershipIncluded(
            serviceTypes: _washTypes,
            quota: 1,
            bucket: 'wash',
          ),
        ],
      ),
      MembershipPlanInterval(
        interval: 'year',
        durationMonths: 12,
        priceQar: 299,
        included: [
          MembershipIncluded(
            serviceTypes: _washTypes,
            quota: 4,
            bucket: 'wash',
          ),
          MembershipIncluded(
            serviceTypes: ['Oil Change'],
            quota: 2,
            bucket: 'oil',
          ),
          MembershipIncluded(
            serviceTypes: ['Battery Change'],
            quota: 1,
            bucket: 'battery',
          ),
        ],
      ),
    ],
  ),
];

class MembershipUsage {
  final String bucket;
  final String serviceType;
  final int used;

  const MembershipUsage({
    required this.bucket,
    required this.serviceType,
    required this.used,
  });

  factory MembershipUsage.fromJson(Map<String, dynamic> json) {
    return MembershipUsage(
      bucket: json['bucket']?.toString() ?? '',
      serviceType: json['serviceType']?.toString() ?? '',
      used: int.tryParse('${json['used']}') ?? 0,
    );
  }
}

class CustomerMembership {
  final String id;
  final String status;
  final String interval;
  final String planCode;
  final String planName;
  final num priceQar;
  final num discountPercent;
  final List<MembershipIncluded> included;
  final List<String> eligibleServiceTypes;
  final List<MembershipUsage> usage;
  final String? startDate;
  final String? endDate;
  final String? vehicleId;
  final String? vehiclePlate;
  /// Cancelled by the customer: stays active until [endDate], then ends.
  final bool cancelAtPeriodEnd;

  const CustomerMembership({
    required this.id,
    required this.status,
    required this.interval,
    required this.planCode,
    required this.planName,
    required this.priceQar,
    required this.discountPercent,
    required this.included,
    required this.eligibleServiceTypes,
    required this.usage,
    this.startDate,
    this.endDate,
    this.vehicleId,
    this.vehiclePlate,
    this.cancelAtPeriodEnd = false,
  });

  factory CustomerMembership.fromJson(Map<String, dynamic> json) {
    final included = json['included'];
    final usage = json['usage'];
    final eligible = json['eligibleServiceTypes'];
    final vehicle = json['vehicle'];
    return CustomerMembership(
      id: (json['id'] ?? json['_id'])?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      interval: json['interval']?.toString() ?? 'month',
      planCode: json['planCode']?.toString() ?? '',
      planName: json['planName']?.toString() ?? '',
      priceQar: num.tryParse('${json['priceQar']}') ?? 0,
      discountPercent: num.tryParse('${json['discountPercent']}') ?? 0,
      included: included is List
          ? included
              .whereType<Map>()
              .map((e) => MembershipIncluded.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      eligibleServiceTypes:
          eligible is List ? eligible.map((e) => e.toString()).toList() : const [],
      usage: usage is List
          ? usage
              .whereType<Map>()
              .map((e) => MembershipUsage.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      startDate: json['startDate']?.toString(),
      endDate: json['endDate']?.toString(),
      vehicleId: json['customer_vehicle_id']?.toString() ??
          (vehicle is Map ? vehicle['id']?.toString() : null),
      vehiclePlate: vehicle is Map ? vehicle['plate']?.toString() : null,
      cancelAtPeriodEnd: json['cancel_at_period_end'] == true,
    );
  }

  bool get isActive => status == 'active';
  bool get isExpired => status == 'expired';
}

enum MembershipCoverKind { none, included, discounted }

class MembershipCover {
  final MembershipCoverKind kind;
  final String planName;
  final num discountPercent;

  const MembershipCover({
    required this.kind,
    this.planName = '',
    this.discountPercent = 0,
  });

  static const none = MembershipCover(kind: MembershipCoverKind.none);
}

const _emergencyTypes = {
  'SOS',
  'Towing',
  'Jump Start',
  'Jump start',
  'Breakdown Vehicle',
};

MembershipCover coverForService({
  required String serviceType,
  required List<CustomerMembership> subscriptions,
}) {
  if (_emergencyTypes.contains(serviceType) ||
      serviceType.toLowerCase().contains('sos')) {
    return MembershipCover.none;
  }
  CustomerMembership? active;
  for (final sub in subscriptions) {
    if (sub.isActive) {
      active = sub;
      break;
    }
  }
  if (active == null) return MembershipCover.none;

  for (final row in active.included) {
    if (!row.serviceTypes.contains(serviceType)) continue;
    final key = row.bucket.isNotEmpty ? row.bucket : (row.serviceTypes.isNotEmpty ? row.serviceTypes.first : '');
    var used = 0;
    for (final u in active.usage) {
      if ((u.bucket.isNotEmpty && u.bucket == key) ||
          (u.serviceType.isNotEmpty && u.serviceType == key)) {
        used = u.used;
        break;
      }
    }
    if (row.quota - used > 0) {
      return MembershipCover(
        kind: MembershipCoverKind.included,
        planName: active.planName,
      );
    }
  }
  if (active.discountPercent > 0 &&
      active.eligibleServiceTypes.contains(serviceType)) {
    return MembershipCover(
      kind: MembershipCoverKind.discounted,
      planName: active.planName,
      discountPercent: active.discountPercent,
    );
  }
  return MembershipCover.none;
}
