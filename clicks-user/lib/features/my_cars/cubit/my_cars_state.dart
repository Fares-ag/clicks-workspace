part of 'my_cars_cubit.dart';

sealed class MyCarsState extends Equatable {
  const MyCarsState();

  @override
  List<Object> get props => [];
}

final class MyCarsInitial extends MyCarsState {}


class LoadingGetMyCarsState extends MyCarsState {}

class SuccessGetMyCarsState extends MyCarsState {}

class ErrorGetMyCarsState extends MyCarsState {
  final String message;
  const ErrorGetMyCarsState(this.message);
}

//

class LoadingGetModelsMyCarsState extends MyCarsState {}

class SuccessGetModelsMyCarsState extends MyCarsState {}

class SuccessSelectModelMyCarsState extends MyCarsState {}

class ErrorGetModelsMyCarsState extends MyCarsState {}

//

class LoadingGetMakesMyCarsState extends MyCarsState {}

class SuccessGetMakesMyCarsState extends MyCarsState {}

class ErrorGetMakesMyCarsState extends MyCarsState {}

//

class SuccessSelectCarState extends MyCarsState {}

//

class LoadingAddMyCarsState extends MyCarsState {}

class SuccessAddMyCarsState extends MyCarsState {}

class ErrorAddMyCarsState extends MyCarsState {
  final String message;
  const ErrorAddMyCarsState(this.message);
}

//

class LoadingDeleteMyCarsState extends MyCarsState {}

class SuccessDeleteMyCarsState extends MyCarsState {}

class ErrorDeleteMyCarsState extends MyCarsState {
  final String message;
  const ErrorDeleteMyCarsState(this.message);
}
