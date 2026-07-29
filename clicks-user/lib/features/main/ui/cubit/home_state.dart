part of 'home_cubit.dart';

sealed class HomeState extends Equatable {
  const HomeState();

  @override
  List<Object> get props => [];
}

final class HomeInitial extends HomeState {}

class ChangeBottomNavIndexHomeState extends HomeState {
  final int index;
  const ChangeBottomNavIndexHomeState(this.index);

  @override
  List<Object> get props => [index];
}
