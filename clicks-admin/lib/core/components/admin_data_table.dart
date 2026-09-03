import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_decorations.dart';
import '../theme/app_spacing.dart';
import 'admin_empty_state.dart';

class AdminTableColumn {
  const AdminTableColumn({
    required this.label,
    required this.flex,
    this.align = TextAlign.start,
  });

  final String label;
  final int flex;
  final TextAlign align;
}

/// Table inside a card — matches web DataTable styling.
class AdminDataTable extends StatelessWidget {
  const AdminDataTable({
    super.key,
    required this.columns,
    required this.rows,
    this.onRowTap,
    this.emptyMessage = 'No records',
    this.loading = false,
  });

  final List<AdminTableColumn> columns;
  final List<List<Widget>> rows;
  final void Function(int index)? onRowTap;
  final String emptyMessage;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    if (loading && rows.isEmpty) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      decoration: AppDecorations.card(),
      clipBehavior: Clip.antiAlias,
      child: rows.isEmpty
          ? SizedBox(
              height: 280,
              child: AdminEmptyState(message: emptyMessage),
            )
          : Column(
              children: [
                if (columns.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.md,
                      vertical: 12,
                    ),
                    decoration: const BoxDecoration(
                      color: AppColors.pageBackground,
                      border: Border(bottom: BorderSide(color: AppColors.border)),
                    ),
                    child: Row(
                      children: [
                        for (final col in columns)
                          Expanded(
                            flex: col.flex,
                            child: Text(
                              col.label.toUpperCase(),
                              textAlign: col.align,
                              style: AdminTypography.caption.copyWith(
                                fontWeight: FontWeight.w600,
                                color: AppColors.muted,
                                letterSpacing: 0.4,
                                fontSize: 11,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                Expanded(
                  child: ListView.separated(
                    itemCount: rows.length,
                    separatorBuilder: (_, __) => const Divider(
                      height: 1,
                      thickness: 1,
                      color: AppColors.border,
                    ),
                    itemBuilder: (context, index) {
                      final cells = rows[index];
                      return _DataRow(
                        cells: cells,
                        columns: columns,
                        onTap: onRowTap != null ? () => onRowTap!(index) : null,
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }
}

class _DataRow extends StatefulWidget {
  const _DataRow({
    required this.cells,
    required this.columns,
    this.onTap,
  });

  final List<Widget> cells;
  final List<AdminTableColumn> columns;
  final VoidCallback? onTap;

  @override
  State<_DataRow> createState() => _DataRowState();
}

class _DataRowState extends State<_DataRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: Material(
        color: _hovered ? AppColors.selection.withValues(alpha: 0.5) : Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          hoverColor: Colors.transparent,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: 14,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                for (var i = 0; i < widget.columns.length && i < widget.cells.length; i++)
                  Expanded(
                    flex: widget.columns[i].flex,
                    child: Align(
                      alignment: widget.columns[i].align == TextAlign.end
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: widget.cells[i],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
