part of 'settings_cubit.dart';

sealed class SettingsState extends Equatable {
  const SettingsState();

  @override
  List<Object> get props => [];
}

final class SettingsInitial extends SettingsState {}

class LoadingSettingsState extends SettingsState {}

class SuccessSettingsState extends SettingsState {}
class SuccessDeleteAccountSettingsState extends SettingsState {}

class ErrorSettingsState extends SettingsState {}

/// Deletion refused (live SOS/job/booking, unpaid job) or failed.
class ErrorDeleteAccountSettingsState extends SettingsState {
  final String message;
  final String? code;
  final String? jobId;
  const ErrorDeleteAccountSettingsState({
    required this.message,
    this.code,
    this.jobId,
  });

  @override
  List<Object> get props => [message, code ?? '', jobId ?? ''];
}

class LoadingUpdateProfileState extends SettingsState {}

class SuccessUpdateProfileState extends SettingsState {}

class ErrorUpdateProfileState extends SettingsState {
  final String message;
  const ErrorUpdateProfileState(this.message);
}
