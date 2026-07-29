part of 'status_cubit.dart';

sealed class StatusState extends Equatable {
  const StatusState();

  @override
  List<Object> get props => [];
}

final class StatusInitial extends StatusState {}

class ChangeStatusTypeStatusState extends StatusState {
  final StatusType type;

  const ChangeStatusTypeStatusState(this.type);


  @override
  List<Object> get props => [type];
}
