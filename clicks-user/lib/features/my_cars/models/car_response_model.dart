class CarResponseModel {
  String? sId;
  String? customerId;
  VehicleMake? vehicleMake;
  VehicleType? vehicleType;
  VehicleModel? vehicleModel;
  int? year;
  String? vehicleColor;
  String? plateNumber;
  String? vinNumber;
  Map<String, dynamic>? insuranceInfo;
  String? createdAt;
  String? updatedAt;
  int? iV;

  CarResponseModel({
    this.sId,
    this.customerId,
    this.vehicleMake,
    this.vehicleType,
    this.vehicleModel,
    this.year,
    this.vehicleColor,
    this.plateNumber,
    this.vinNumber,
    this.insuranceInfo,
    this.createdAt,
    this.updatedAt,
    this.iV,
  });

  bool get isInsured {
    if (insuranceInfo == null) return false;
    final status = insuranceInfo!['status']?.toString();
    if (status != 'Active') return false;
    final endDateStr = insuranceInfo!['endDate']?.toString();
    if (endDateStr == null) return false;
    try {
      final endDate = DateTime.parse(endDateStr);
      return endDate.isAfter(DateTime.now());
    } catch (_) {
      return false;
    }
  }

  CarResponseModel.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    customerId = json['customer_id'];
    vehicleMake = json['vehicle_make'] != null
        ? VehicleMake.fromJson(json['vehicle_make'])
        : null;
    vehicleType = json['vehicle_type'] != null
        ? VehicleType.fromJson(json['vehicle_type'])
        : null;
    vehicleModel = json['vehicle_model'] != null
        ? VehicleModel.fromJson(json['vehicle_model'])
        : null;
    year = json['year'];
    vehicleColor = json['vehicle_color'];
    plateNumber = json['plate_number'];
    vinNumber = json['vin_number'];
    if (json['insurance_id'] is Map<String, dynamic>) {
      insuranceInfo = json['insurance_id'];
    }
    createdAt = json['createdAt'];
    updatedAt = json['updatedAt'];
    iV = json['__v'];
  }

  Map<String, dynamic> toJson() {
    final data = <String, dynamic>{
      '_id': sId,
      'customer_id': customerId,
      'year': year,
      'vehicle_color': vehicleColor,
      'plate_number': plateNumber,
      'vin_number': vinNumber,
      'createdAt': createdAt,
      'updatedAt': updatedAt,
      '__v': iV,
    };
    if (vehicleMake != null) data['vehicle_make'] = vehicleMake!.toJson();
    if (vehicleType != null) data['vehicle_type'] = vehicleType!.toJson();
    if (vehicleModel != null) data['vehicle_model'] = vehicleModel!.toJson();
    if (insuranceInfo != null) data['insurance_id'] = insuranceInfo;
    return data;
  }
}

class VehicleMake {
  String? sId;
  String? makeName;

  VehicleMake({this.sId, this.makeName});

  VehicleMake.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    makeName = json['makeName'];
  }

  Map<String, dynamic> toJson() => {'_id': sId, 'makeName': makeName};
}

class VehicleType {
  String? sId;
  String? typeName;

  VehicleType({this.sId, this.typeName});

  VehicleType.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    typeName = json['typeName'];
  }

  Map<String, dynamic> toJson() => {'_id': sId, 'typeName': typeName};
}

class VehicleModel {
  String? sId;
  String? modelName;

  VehicleModel({this.sId, this.modelName});

  VehicleModel.fromJson(Map<String, dynamic> json) {
    sId = json['_id'];
    modelName = json['modelName'];
  }

  Map<String, dynamic> toJson() => {'_id': sId, 'modelName': modelName};
}
