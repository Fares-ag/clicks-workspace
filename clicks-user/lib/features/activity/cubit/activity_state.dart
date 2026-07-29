part of 'activity_cubit.dart';

sealed class ActivityState extends Equatable {
  const ActivityState();
  @override
  List<Object?> get props => [];
}

final class ActivityInitial extends ActivityState {}

final class ActivityLoading extends ActivityState {}

final class ActivitySuccess extends ActivityState {
  final List<JobDto> jobs;
  const ActivitySuccess(this.jobs);

  @override
  List<Object?> get props => [jobs];
}

final class ActivityFailure extends ActivityState {
  final String message;
  const ActivityFailure(this.message);

  @override
  List<Object?> get props => [message];
}
