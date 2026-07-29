import 'package:clicks_user/features/activity/models/job_history_response.dart';

import '../../../core/api/dio_helper.dart';

class ActivityRepository {
  Future<List<JobDto>> getJobsHistory() async {
    final res = await DioHelper.getData(
      url: '/api/jobs/customer/history',
      auth: true,
    );

    // لو الـ API بيرجع 200..299 نجاح
    if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
      final data = res.data as Map<String, dynamic>;
      return JobsHistoryResponse.fromJson(data).jobs;
    }

    // Error message لو موجود من الباك
    final msg =
        (res.data is Map && (res.data as Map).containsKey('message'))
            ? (res.data['message']?.toString() ?? 'Request failed')
            : 'Request failed (${res.statusCode})';
    throw Exception(msg);
  }

  /// Fetch a single job's raw JSON by its ID.
  Future<Map<String, dynamic>> getJobRaw(String jobId) async {
    final res = await DioHelper.getData(
      url: '/api/jobs/$jobId',
      auth: true,
    );

    if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
      if (res.data is Map<String, dynamic>) {
        final data = res.data as Map<String, dynamic>;
        // The job object may be nested under 'job' key or returned directly
        return (data.containsKey('job') ? data['job'] : data) as Map<String, dynamic>;
      }
    }

    throw Exception('Failed to load job details');
  }
}
