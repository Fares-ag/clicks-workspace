import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';

class ServiceRequestApi {
  static Future<Map<String, dynamic>> create({
    required String serviceType,
    required String timing,
    required double latitude,
    required double longitude,
    String? customerVehicleId,
    bool skipVehicle = false,
    DateTime? scheduledFor,
  }) async {
    final response = await DioHelper.postData(
      url: EndPoints.serviceRequests,
      auth: true,
      data: {
        'service_type': serviceType,
        'timing': timing,
        'latitude': latitude,
        'longitude': longitude,
        'skip_vehicle': skipVehicle,
        if (!skipVehicle &&
            customerVehicleId != null &&
            customerVehicleId.isNotEmpty)
          'customer_vehicle_id': customerVehicleId,
        if (timing == 'scheduled' && scheduledFor != null)
          'scheduled_for': scheduledFor.toUtc().toIso8601String(),
      },
    );
    if (response.statusCode != 201 && response.statusCode != 200) {
      throw Exception(
        DioHelper.errorMessage(response) ?? 'Failed to create service request',
      );
    }
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    return Map<String, dynamic>.from(data as Map);
  }

  static Future<Map<String, dynamic>?> getActive() async {
    final response = await DioHelper.getData(
      url: EndPoints.serviceRequestsActive,
      auth: true,
    );
    if (response.statusCode != 200) return null;
    final data = response.data;
    if (data is! Map) return null;
    final active = data['active_service_request'];
    if (active is Map) return Map<String, dynamic>.from(active);
    return null;
  }

  static Future<void> cancel(String id, {String? reason}) async {
    final response = await DioHelper.postData(
      url: EndPoints.cancelServiceRequest(id),
      auth: true,
      data: {'reason': reason ?? 'cancelled_by_customer'},
    );
    if (response.statusCode != 200) {
      throw Exception(
        DioHelper.errorMessage(response) ?? 'Failed to cancel service request',
      );
    }
  }
}
