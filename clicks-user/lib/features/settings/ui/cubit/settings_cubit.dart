import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/features/settings/ui/cubit/profile_response_model.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/sos_services/sos_cubit.dart';

part 'settings_state.dart';

class SettingsCubit extends Cubit<SettingsState> {
  SettingsCubit() : super(SettingsInitial());

  void deleteAccount() async {
    emit(LoadingSettingsState());
    try {
      var response = await DioHelper.postData(url: EndPoints.deleteAccount);
      if (response.statusCode == 200) {
        await CacheHelper.clear();
        profile = null;
        _profileLoaded = false;
        emit(SuccessDeleteAccountSettingsState());
      } else {
        emit(ErrorSettingsState());
      }
    } catch (e) {
      emit(ErrorSettingsState());
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
        data: {"first_name": firstName, "last_name": lastName, "email": email},
      );
      if (response.statusCode == 200) {
        emit(SuccessUpdateProfileState());
      } else {
        emit(ErrorUpdateProfileState(response.data["error"]));
      }
    } catch (e) {
      emit(ErrorUpdateProfileState('auth.please_try_again'.tr()));
    }
  }
}
