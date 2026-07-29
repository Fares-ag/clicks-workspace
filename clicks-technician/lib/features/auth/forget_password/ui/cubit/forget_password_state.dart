part of 'forget_password_cubit.dart';

sealed class ForgetPasswordState extends Equatable {
  const ForgetPasswordState();

  @override
  List<Object> get props => [];
}

final class ForgetPasswordInitial extends ForgetPasswordState {}

class ChangeProgressForgetPassword extends ForgetPasswordState {
  final int progress;

  const ChangeProgressForgetPassword(this.progress);

  @override
  List<Object> get props => [progress];
}

class ShowOTPViewForgetPasswordSteps extends ForgetPasswordState {
  final bool otpView;

  const ShowOTPViewForgetPasswordSteps(this.otpView);

  @override
  List<Object> get props => [otpView];
}

class StartValidationsForgetPasswordSteps extends ForgetPasswordState {}

class EndValidationsForgetPasswordSteps extends ForgetPasswordState {}

class ForgetPasswordLoading extends ForgetPasswordState {}

class ForgetPasswordSuccess extends ForgetPasswordState {}

class ForgetPasswordError extends ForgetPasswordState {
  final String message;
  const ForgetPasswordError(this.message);

  @override
  List<Object> get props => [message];
}
