part of 'register_cubit.dart';

sealed class RegisterState extends Equatable {
  const RegisterState();

  @override
  List<Object> get props => [];
}

final class RegisterInitial extends RegisterState {}

class ChangeProgressRegister extends RegisterState {
  final int progress;

  const ChangeProgressRegister(this.progress);

  @override
  List<Object> get props => [progress];
}

class ShowOTPViewRegisterSteps extends RegisterState {
  final bool otpView;

  const ShowOTPViewRegisterSteps(this.otpView);

  @override
  List<Object> get props => [otpView];
}

class StartValidationsRegisterSteps extends RegisterState {}

class EndValidationsRegisterSteps extends RegisterState {}

class RegisterLoading extends RegisterState {}

class RegisterOtpSent extends RegisterState {}

class RegisterSuccess extends RegisterState {}

class RegisterError extends RegisterState {
  final String message;
  const RegisterError(this.message);

  @override
  List<Object> get props => [message];
}
