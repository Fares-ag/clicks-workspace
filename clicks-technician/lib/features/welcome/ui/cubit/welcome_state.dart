part of 'welcome_cubit.dart';

sealed class WelcomeState extends Equatable {
  const WelcomeState();

  @override
  List<Object> get props => [];
}

final class WelcomeInitial extends WelcomeState {}

class WelcomeLoading extends WelcomeState {}

class WelcomeSuccess extends WelcomeState {}

class WelcomeError extends WelcomeState {
  final String message;

  const WelcomeError(this.message);

  @override
  List<Object> get props => [message];
}
