import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/booking_errors.dart';

class JobCancelApi {
  static Future<Map<String, dynamic>> cancelCustomer({
    required String jobId,
    required String reason,
  }) async {
    final response = await DioHelper.postData(
      url: EndPoints.cancelJobByCustomer(jobId),
      auth: true,
      data: {'reason': reason},
    );
    if (response.statusCode != 200) {
      throw Exception(
        bookingErrorMessage(
          DioHelper.errorCode(response),
          DioHelper.errorMessage(response) ?? 'Failed to cancel job',
        ),
      );
    }
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    return Map<String, dynamic>.from(data as Map);
  }
}
