import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../cubit/paginated_list_cubit.dart';
import '../theme/app_colors.dart';

typedef ItemBuilder = Widget Function(BuildContext context, Map<String, dynamic> item);

class PaginatedListScreen extends StatefulWidget {
  const PaginatedListScreen({
    super.key,
    required this.endpoint,
    required this.emptyMessage,
    required this.itemBuilder,
    this.filters,
    this.refreshTick = 0,
    this.searchHint = 'Search',
  });

  final String endpoint;
  final String emptyMessage;
  final ItemBuilder itemBuilder;
  final Map<String, String>? filters;
  final int refreshTick;
  final String searchHint;

  @override
  State<PaginatedListScreen> createState() => _PaginatedListScreenState();
}

class _PaginatedListScreenState extends State<PaginatedListScreen> {
  late final PaginatedListCubit _cubit;
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _cubit = PaginatedListCubit(
      endpoint: widget.endpoint,
      filters: widget.filters,
    )..load(refresh: true);
  }

  @override
  void didUpdateWidget(covariant PaginatedListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshTick != widget.refreshTick) {
      _cubit.load(refresh: true);
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _cubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _search,
              decoration: InputDecoration(
                hintText: widget.searchHint,
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _search.clear();
                    _cubit.searchChanged('');
                  },
                ),
              ),
              onSubmitted: _cubit.searchChanged,
            ),
          ),
          Expanded(
            child: BlocBuilder<PaginatedListCubit, PaginatedListState>(
              builder: (context, state) {
                final items = state.items;
                if (state is PaginatedListLoading && items.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (state is PaginatedListError && items.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(state.message),
                        TextButton(
                          onPressed: () => _cubit.load(refresh: true),
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  );
                }
                if (items.isEmpty) {
                  return Center(
                    child: Text(
                      widget.emptyMessage,
                      style: GoogleFonts.dmSans(color: AppColors.muted),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () => _cubit.load(refresh: true),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length + 1,
                    itemBuilder: (context, index) {
                      if (index == items.length) {
                        if (items.length >= state.total) {
                          return const SizedBox(height: 24);
                        }
                        return TextButton(
                          onPressed: _cubit.loadMore,
                          child: const Text('Load more'),
                        );
                      }
                      return widget.itemBuilder(context, items[index]);
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
