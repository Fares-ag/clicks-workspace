enum JobStatus { ongoing, completed, cancelled }

JobStatus jobStatusFromApi(String v) {
  switch (v) {
    case 'completed':
      return JobStatus.completed;
    case 'cancelled':
      return JobStatus.cancelled;
    default:
      return JobStatus.ongoing; // covers ongoing/in_progress/...etc
  }
}

class JobsHistoryResponse {
  final List<JobDto> jobs;
  final bool hasMore;
  JobsHistoryResponse({required this.jobs, this.hasMore = false});

  factory JobsHistoryResponse.fromJson(Map<String, dynamic> json) {
    final list = (json['jobs'] as List? ?? []);
    return JobsHistoryResponse(
      jobs:
          list.map((e) => JobDto.fromJson(e as Map<String, dynamic>)).toList(),
      hasMore: json['has_more'] == true,
    );
  }
}

class JobDto {
  final String id;
  final String? jobReference;
  final DateTime dateTime;
  final String jobType;
  final String issue;
  final String location;
  final int price;
  final JobStatus status;
  final List<String> rejectionReasons;

  // Technician info (populated from backend)
  final String? assignedTechnicianId;
  final String? technicianName;
  final String? technicianPhone;
  final String? technicianProfilePicture;

  // Vehicle info (populated from backend)
  final String? customerVehicleId;
  final String? vehicleMake;
  final String? vehicleModel;
  final int? vehicleYear;
  final String? vehiclePlateNumber;
  final String? paymentStatus;
  final String? paymentMethod;
  final String? businessName;
  final String? businessCutType;
  final double? businessCutPercent;
  final String? cutType;
  final double? cutPercent;

  // Job metadata
  final int? totalJobTimeMinutes;
  final int? rating;
  final String? serviceDescription;

  const JobDto({
    required this.id,
    this.jobReference,
    required this.dateTime,
    required this.jobType,
    required this.issue,
    required this.location,
    required this.price,
    required this.status,
    this.customerVehicleId,
    this.assignedTechnicianId,
    this.technicianName,
    this.technicianPhone,
    this.technicianProfilePicture,
    this.vehicleMake,
    this.vehicleModel,
    this.vehicleYear,
    this.vehiclePlateNumber,
    this.paymentStatus,
    this.paymentMethod,
    this.businessName,
    this.businessCutType,
    this.businessCutPercent,
    this.cutType,
    this.cutPercent,
    this.totalJobTimeMinutes,
    this.rating,
    this.serviceDescription,
    required this.rejectionReasons,
  });

  factory JobDto.fromJson(Map<String, dynamic> json) {
    final businessJson =
        json['business'] is Map
            ? (json['business'] as Map).cast<String, dynamic>()
            : null;
    // Parse technician name from populated object or fallback to id string
    String? techName;
    String? techId;
    String? techPhone;
    String? techProfilePic;
    final tech = json['assignedTechnician'];
    if (tech is Map<String, dynamic>) {
      techId = tech['_id'];
      final first = tech['firstName'] ?? '';
      final last = tech['lastName'] ?? '';
      techName = '$first $last'.trim();
      techPhone = tech['phone'];
      techProfilePic = tech['profilePicture'];
    } else if (tech is String) {
      techId = tech;
    }

    // Parse vehicle info from populated object or direct string fields
    String? vMake;
    String? vModel;
    int? vYear;
    String? vId;
    final vehicle = json['customer_vehicle_id'];
    if (vehicle is Map<String, dynamic>) {
      vId = vehicle['_id'];
      final makeObj = vehicle['vehicle_make'];
      if (makeObj is Map<String, dynamic>) {
        vMake = makeObj['makeName'];
      }
      final modelObj = vehicle['vehicle_model'];
      if (modelObj is Map<String, dynamic>) {
        vModel = modelObj['modelName'];
      }
      vYear = vehicle['year'];
    } else if (vehicle is String) {
      vId = vehicle;
    }
    // Fallback to direct string fields for admin-created jobs
    vMake ??= json['vehicleMake'];
    vModel ??= json['vehicleModel'];
    vYear ??= json['vehicleYear'];
    String? vPlate;
    if (vehicle is Map<String, dynamic>) {
      vPlate = vehicle['plate_number'];
    }
    vPlate ??= json['licensePlate'];

    // Parse total job time in minutes
    int? totalJobTimeMinutes;
    if (json['started_at'] != null && json['completed_at'] != null) {
      final start = DateTime.tryParse(json['started_at'].toString());
      final end = DateTime.tryParse(json['completed_at'].toString());
      if (start != null && end != null) {
        totalJobTimeMinutes = end.difference(start).inMinutes;
      }
    }

    return JobDto(
      id: json['_id'] ?? '',
      jobReference: json['job_reference']?.toString(),
      dateTime: DateTime.tryParse(json['dateTime'] ?? '') ?? DateTime.now(),
      jobType: json['jobType'] ?? '',
      issue: json['issue'] ?? '',
      location: json['location'] ?? '',
      price: (json['price'] is num) ? (json['price'] as num).toInt() : 0,
      status: jobStatusFromApi(json['job_status'] ?? ''),
      customerVehicleId: vId,
      assignedTechnicianId: techId,
      technicianName: techName,
      technicianPhone: techPhone,
      technicianProfilePicture: techProfilePic,
      vehicleMake: vMake,
      vehicleModel: vModel,
      vehicleYear: vYear,
      vehiclePlateNumber: vPlate,
      paymentStatus: json['payment_status'],
      paymentMethod: json['payment_method'],
      businessName: json['businessName'] ?? businessJson?['name'],
      businessCutType: json['businessCutType'],
      businessCutPercent:
          json['businessCutPercent'] != null
              ? (json['businessCutPercent'] as num).toDouble()
              : null,
      cutType: json['businessCutType'] ?? json['cutType'] ?? businessJson?['cutType'],
      cutPercent:
          json['businessCutPercent'] != null
              ? (json['businessCutPercent'] as num).toDouble()
              : json['cutPercent'] != null
              ? (json['cutPercent'] as num).toDouble()
              : businessJson?['cutPercent'] != null
                  ? (businessJson!['cutPercent'] as num).toDouble()
                  : null,
      totalJobTimeMinutes: totalJobTimeMinutes,
      rating: (json['rating'] is num) ? (json['rating'] as num).toInt() : null,
      serviceDescription: json['serviceDescription'] ?? json['issue'],
      rejectionReasons:
          (json['rejection_reasons'] as List? ?? [])
              .map((e) => e.toString())
              .toList(),
    );
  }
}
