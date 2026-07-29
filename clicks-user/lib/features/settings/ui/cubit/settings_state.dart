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

class LoadingUpdateProfileState extends SettingsState {}

class SuccessUpdateProfileState extends SettingsState {}

class ErrorUpdateProfileState extends SettingsState {
  final String message;
  const ErrorUpdateProfileState(this.message);
}
