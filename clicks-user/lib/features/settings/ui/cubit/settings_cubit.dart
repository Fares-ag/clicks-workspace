import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:clicks_user/core/helper/booking_errors.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/features/settings/ui/cubit/profile_response_model.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/sos_services/sos_cubit.dart';

part 'settings_state.dart';

class SettingsCubit extends Cubit<SettingsState> {
  SettingsCubit() : super(SettingsInitial());

  /// GET /api/customers/delete-check: what blocks deletion, and whether an
  /// active membership will be forfeited. Null when the check failed.
  Future<Map<String, dynamic>?> checkDeletion() async {
    try {
      final response = await DioHelper.getData(url: EndPoints.deleteCheck);
      if (response.statusCode == 200 && response.data is Map) {
        return Map<String, dynamic>.from(response.data as Map);
      }
    } catch (_) {}
    return null;
  }

  /// Sends the chosen reason (scenario 4) and surfaces WHY a deletion was
  /// refused, with the unpaid job id for a Pay-now link (scenario 5).
  void deleteAccount({String? reason, String? note}) async {
    emit(LoadingSettingsState());
    try {
      var response = await DioHelper.postData(
        url: EndPoints.deleteAccount,
        data: {
          if (reason != null && reason.isNotEmpty) 'reason': reason,
          if (note != null && note.trim().isNotEmpty) 'other_reason': note.trim(),
        },
      );
      if (response.statusCode == 200) {
        await CacheHelper.clear();
        profile = null;
        _profileLoaded = false;
        emit(SuccessDeleteAccountSettingsState());
      } else {
        final data = response.data;
        emit(ErrorDeleteAccountSettingsState(
          message: errorMessageForResponse(response),
          code: DioHelper.errorCode(response),
          jobId: data is Map ? data['job_id']?.toString() : null,
        ));
      }
    } catch (e) {
      emit(ErrorDeleteAccountSettingsState(message: errorMessageForException(e)));
    }
  }

  ProfileResponseModel? profile;
  bool _profileLoaded = false;
  bool _profileLoading = false;

  void clearProfile() {
    profile = null;
    _profileLoaded = false;
    _profileLoading = false;
    emit(SettingsInitial());
  }

  /// Loads profile once and connects the SOS socket.
  /// Pass [forceRefresh] to reload after profile edits.
  /// Pass [showLoading] false when called from MainScreen bootstrap
  /// so tab rebuilds don't trap Settings on a spinner.
  Future<void> getProfile(
    BuildContext context, {
    bool forceRefresh = false,
    bool showLoading = true,
  }) async {
    if (_profileLoading) return;
    if (_profileLoaded && !forceRefresh) {
      // Socket may have dropped — ensure it's up without re-emitting loading.
      final id = profile?.id;
      if (id != null && id.isNotEmpty && context.mounted) {
        context.read<SosCubit>().connectSocket(id);
      }
      return;
    }

    _profileLoading = true;
    if (showLoading) emit(LoadingSettingsState());
    try {
      var response = await DioHelper.getData(url: EndPoints.getProfile);
      if (response.statusCode == 200) {
        profile = ProfileResponseModel.fromJson(response.data);
        _profileLoaded = true;

        final id = profile?.id;
        if (id != null && id.isNotEmpty && context.mounted) {
          context.read<SosCubit>().connectSocket(id);
        }

        emit(SuccessSettingsState());
      } else {
        emit(ErrorSettingsState());
      }
    } catch (e) {
      emit(ErrorSettingsState());
    } finally {
      _profileLoading = false;
    }
  }

  void updateProfile(String firstName, String lastName, String email) async {
    emit(LoadingUpdateProfileState());
    try {
      var response = await DioHelper.putData(
        url: EndPoints.getProfile,
        data: {
          "first_name": firstName.trim(),
          "last_name": lastName.trim(),
          "email": email.trim().toLowerCase(),
        },
      );
      if (response.statusCode == 200) {
        emit(SuccessUpdateProfileState());
      } else {
        emit(ErrorUpdateProfileState(
          errorMessageForResponse(response, fallbackKey: 'auth.please_try_again'),
        ));
      }
    } catch (e) {
      emit(ErrorUpdateProfileState(
        errorMessageForException(e, fallbackKey: 'auth.please_try_again'),
      ));
    }
  }
}
