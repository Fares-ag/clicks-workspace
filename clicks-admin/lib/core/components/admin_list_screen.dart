import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../cubit/paginated_list_cubit.dart';
import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_decorations.dart';
import '../theme/app_spacing.dart';
import 'admin_data_table.dart';
import 'admin_search_field.dart';
import 'filter_chip_bar.dart';
import 'primary_button.dart';

typedef AdminRowBuilder = List<Widget> Function(Map<String, dynamic> item);

class AdminListScreen extends StatefulWidget {
  const AdminListScreen({
    super.key,
    required this.title,
    required this.endpoint,
    required this.columns,
    required this.rowBuilder,
    this.emptyMessage = 'No records',
    this.searchHint = 'Search',
    this.filterOptions,
    this.filterKey = 'status',
    this.initialFilter = '',
    this.refreshTick = 0,
    this.onRowTap,
    this.headerActions,
    this.floatingAction,
  });

  final String title;
  final String endpoint;
  final List<AdminTableColumn> columns;
  final AdminRowBuilder rowBuilder;
  final String emptyMessage;
  final String searchHint;
  final List<FilterChipOption>? filterOptions;
  final String filterKey;
  final String initialFilter;
  final int refreshTick;
  final void Function(Map<String, dynamic> item)? onRowTap;
  final List<Widget>? headerActions;
  final Widget? floatingAction;

  @override
  State<AdminListScreen> createState() => _AdminListScreenState();
}

class _AdminListScreenState extends State<AdminListScreen> {
  late final PaginatedListCubit _cubit;
  late String _selectedFilter;

  @override
  void initState() {
    super.initState();
    _selectedFilter = widget.initialFilter;
    _cubit = PaginatedListCubit(
      endpoint: widget.endpoint,
      filters: _selectedFilter.isEmpty
          ? null
          : {widget.filterKey: _selectedFilter},
    )..load(refresh: true);
  }

  @override
  void didUpdateWidget(covariant AdminListScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshTick != widget.refreshTick) {
      _cubit.load(refresh: true);
    }
  }

  @override
  void dispose() {
    _cubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: Stack(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.md,
                  AppSpacing.lg,
                  AppSpacing.sm,
                ),
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: AppDecorations.toolbar(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: AdminSearchField(
                              hint: widget.searchHint,
                              onChanged: _cubit.searchChanged,
                            ),
                          ),
                          if (widget.headerActions != null) ...[
                            const SizedBox(width: AppSpacing.sm),
                            ...widget.headerActions!,
                          ],
                        ],
                      ),
                      if (widget.filterOptions != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        FilterChipBar(
                          options: widget.filterOptions!,
                          selected: _selectedFilter,
                          onSelected: (value) async {
                            setState(() => _selectedFilter = value);
                            await _cubit.setFilter(widget.filterKey, value);
                          },
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              Expanded(
                child: BlocBuilder<PaginatedListCubit, PaginatedListState>(
                  builder: (context, state) {
                    final items = state.items;
                    final rows = items.map(widget.rowBuilder).toList();
                    return Column(
                      children: [
                        Expanded(
                          child: RefreshIndicator(
                            color: AppColors.primary,
                            onRefresh: () => _cubit.load(refresh: true),
                            child: AdminDataTable(
                              columns: widget.columns,
                              rows: rows,
                              emptyMessage: widget.emptyMessage,
                              loading: state is PaginatedListLoading && items.isEmpty,
                              onRowTap: widget.onRowTap == null
                                  ? null
                                  : (index) => widget.onRowTap!(items[index]),
                            ),
                          ),
                        ),
                        if (items.isNotEmpty && items.length < state.total)
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.md),
                            child: PrimaryButton(
                              label: 'Load more',
                              outlined: true,
                              onPressed: _cubit.loadMore,
                            ),
                          ),
                        if (state is PaginatedListError && items.isEmpty)
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.lg),
                            child: Text(
                              state.message,
                              style: AdminTypography.body.copyWith(
                                color: AppColors.danger,
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
          if (widget.floatingAction != null)
            Positioned(
              right: AppSpacing.lg,
              bottom: AppSpacing.lg,
              child: widget.floatingAction!,
            ),
        ],
      ),
    );
  }
}
