import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../api/paginated_list_repository.dart';

part 'paginated_list_state.dart';

class PaginatedListCubit extends Cubit<PaginatedListState> {
  PaginatedListCubit({
    required this.endpoint,
    this.filters,
    this.limit = 20,
  }) : super(PaginatedListInitial());

  final String endpoint;
  Map<String, String>? filters;
  final int limit;
  final _repo = PaginatedListRepository();

  List<Map<String, dynamic>> items = [];
  int page = 1;
  int total = 0;
  String search = '';
  bool loading = false;
  String? error;
  Timer? _searchDebounce;

  Future<void> load({bool refresh = false}) async {
    if (loading) return;
    if (refresh) {
      page = 1;
      items = [];
    }
    loading = true;
    error = null;
    emit(PaginatedListLoading(items: List.from(items)));

    try {
      final result = await _repo.fetch(
        endpoint: endpoint,
        page: page,
        limit: limit,
        search: search,
        filters: filters,
      );
      if (refresh || page == 1) {
        items = result.items;
      } else {
        items = [...items, ...result.items];
      }
      total = result.total;
      loading = false;
      emit(PaginatedListLoaded(items: List.from(items), total: total));
    } catch (e) {
      loading = false;
      error = e.toString();
      emit(PaginatedListError(message: error!, items: List.from(items)));
    }
  }

  void searchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 400), () async {
      search = value.trim();
      await load(refresh: true);
    });
  }

  Future<void> setFilter(String key, String value) async {
    filters ??= {};
    if (value.isEmpty) {
      filters!.remove(key);
    } else {
      filters![key] = value;
    }
    await load(refresh: true);
  }

  Future<void> loadMore() async {
    if (loading || items.length >= total) return;
    page += 1;
    await load();
  }

  @override
  Future<void> close() {
    _searchDebounce?.cancel();
    return super.close();
  }
}
