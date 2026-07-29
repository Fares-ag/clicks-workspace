part of 'jobs_cubit.dart';

sealed class JobsState extends Equatable {
  const JobsState();
  @override
  List<Object?> get props => [];
}

class JobsInitial extends JobsState {}

class JobsCatalogLoaded extends JobsState {}

class JobsSubmitting extends JobsState {}

class JobsCreateSuccess extends JobsState {}

class JobsError extends JobsState {
  final String message;
  const JobsError(this.message);
  @override
  List<Object?> get props => [message];
}
