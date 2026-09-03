part of 'paginated_list_cubit.dart';

abstract class PaginatedListState extends Equatable {
  const PaginatedListState({required this.items, this.total = 0});
  final List<Map<String, dynamic>> items;
  final int total;

  @override
  List<Object?> get props => [items, total];
}

class PaginatedListInitial extends PaginatedListState {
  PaginatedListInitial() : super(items: const []);
}

class PaginatedListLoading extends PaginatedListState {
  const PaginatedListLoading({required super.items, super.total});
}

class PaginatedListLoaded extends PaginatedListState {
  const PaginatedListLoaded({required super.items, required super.total});
}

class PaginatedListError extends PaginatedListState {
  const PaginatedListError({
    required this.message,
    required super.items,
    super.total,
  });
  final String message;

  @override
  List<Object?> get props => [message, items, total];
}
