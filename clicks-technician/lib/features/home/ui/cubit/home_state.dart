part of 'home_cubit.dart';

sealed class HomeState extends Equatable {
  const HomeState();

  @override
  List<Object?> get props => [];
}

final class HomeInitial extends HomeState {}

/// Initial session fetch in progress.
class HomeLoading extends HomeState {}

/// Emitted whenever the cubit's mutable fields change and the UI should
/// rebuild. [revision] must change every emit so Equatable does not drop updates.
class HomeLoaded extends HomeState {
  final int revision;

  const HomeLoaded(this.revision);

  @override
  List<Object?> get props => [revision];
}

class HomeActionError extends HomeState {
  final String message;

  const HomeActionError(this.message);

  @override
  List<Object?> get props => [message];
}

class HomeActionSuccess extends HomeState {
  final String message;

  const HomeActionSuccess(this.message);

  @override
  List<Object?> get props => [message];
}
