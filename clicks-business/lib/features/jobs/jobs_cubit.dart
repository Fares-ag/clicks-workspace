import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/phone_utils.dart';

part 'jobs_state.dart';

class JobsCubit extends Cubit<JobsState> {
  JobsCubit() : super(JobsInitial());

  List<Map<String, dynamic>> makes = [];
  List<Map<String, dynamic>> models = [];

  Future<void> loadMakes() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.vehicleMakes);
      if (res.statusCode == 200 && res.data is Map) {
        final raw = res.data['makes'];
        if (raw is List) {
          makes = raw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      // 404 / empty catalog → form falls back to free-text make/model
      emit(JobsCatalogLoaded());
    } catch (_) {
      makes = [];
      emit(JobsCatalogLoaded());
    }
  }

  Future<void> loadModelsForMake(String makeId) async {
    models = [];
    if (makeId.isEmpty) {
      emit(JobsCatalogLoaded());
      return;
    }
    try {
      final res = await DioHelper.getData(
        url: EndPoints.vehicleModelsByMake(makeId),
      );
      if (res.statusCode == 200 && res.data is Map) {
        final raw = res.data['models'];
        if (raw is List) {
          models = raw
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      }
      emit(JobsCatalogLoaded());
    } catch (_) {
      models = [];
      emit(JobsCatalogLoaded());
    }
  }

  /// Same payload shape as admin Add Job (minus source / technician).
  Future<void> createJob({
    required String clientName,
    required String clientMobileLocal,
    String countryCode = defaultCountryCode,
    String? clientEmail,
    required String vehicleMake,
    required String vehicleModel,
    int? vehicleYear,
    String? licensePlate,
    String? vinNumber,
    required String issue,
    required String location,
    required String jobType,
    required double price,
    required DateTime dateTime,
    String? subSource,
  }) async {
    emit(JobsSubmitting());

    final local = toLocalDigits(clientMobileLocal, countryCode);
    if (!isValidLocalPhone(local)) {
      emit(const JobsError(
        'Phone number must be exactly 8 digits (without country code)',
      ));
      return;
    }
    if (issue.trim().isEmpty) {
      emit(const JobsError('Issue description is mandatory'));
      return;
    }
    if (vehicleMake.trim().isEmpty || vehicleModel.trim().isEmpty) {
      emit(const JobsError('Vehicle make and model are required'));
      return;
    }

    try {
      final res = await DioHelper.postData(
        url: EndPoints.jobs,
        data: {
          'clientName': clientName.trim(),
          'clientMobileNumber': local,
          'countryCode': countryCode,
          if (clientEmail != null && clientEmail.trim().isNotEmpty)
            'clientEmail': clientEmail.trim(),
          'vehicleMake': vehicleMake.trim(),
          'vehicleModel': vehicleModel.trim(),
          if (vehicleYear != null) 'vehicleYear': vehicleYear,
          if (licensePlate != null && licensePlate.trim().isNotEmpty)
            'licensePlate': licensePlate.trim(),
          if (vinNumber != null && vinNumber.trim().isNotEmpty)
            'vinNumber': vinNumber.trim(),
          'issue': issue.trim(),
          'location': location.trim(),
          'jobType': jobType,
          'price': price,
          'dateTime': dateTime.toUtc().toIso8601String(),
          if (subSource != null && subSource.isNotEmpty) 'subSource': subSource,
        },
      );
      if (res.statusCode == 201 || res.statusCode == 200) {
        emit(JobsCreateSuccess());
      } else {
        emit(JobsError(DioHelper.errorMessage(res) ?? 'Failed to submit request'));
      }
    } catch (e) {
      emit(JobsError('Failed to submit request: $e'));
    }
  }

  Future<Map<String, dynamic>?> fetchJob(String id) async {
    try {
      final res = await DioHelper.getData(url: EndPoints.jobById(id));
      if (res.statusCode == 200 && res.data is Map) {
        final job = res.data['job'];
        if (job is Map) return Map<String, dynamic>.from(job);
      }
    } catch (_) {}
    return null;
  }
}
