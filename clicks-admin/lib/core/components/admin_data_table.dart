import 'package:flutter/material.dart';

import '../theme/admin_breakpoints.dart';
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
    this.badge = false,
  });

  final String label;
  final int flex;
  final TextAlign align;

  /// Shown beside the title on compact cards instead of as a labeled row.
  final bool badge;
}

/// Table on wide screens, stacked cards on phones.
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

    final compact = AdminBreakpoints.isCompact(context);
    final margin = compact ? 12.0 : AppSpacing.lg;

    if (rows.isEmpty) {
      return Container(
        margin: EdgeInsets.symmetric(horizontal: margin),
        decoration: AppDecorations.card(),
        child: SizedBox(
          height: 240,
          child: AdminEmptyState(message: emptyMessage),
        ),
      );
    }

    if (compact) {
      return ListView.separated(
        padding: EdgeInsets.fromLTRB(margin, 0, margin, 16),
        itemCount: rows.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          return _MobileCard(
            cells: rows[index],
            columns: columns,
            onTap: onRowTap != null ? () => onRowTap!(index) : null,
          );
        },
      );
    }

    return Container(
      margin: EdgeInsets.symmetric(horizontal: margin),
      decoration: AppDecorations.card(),
      clipBehavior: Clip.antiAlias,
      child: Column(
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
                return _DataRow(
                  cells: rows[index],
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

class _MobileCard extends StatelessWidget {
  const _MobileCard({
    required this.cells,
    required this.columns,
    this.onTap,
  });

  final List<Widget> cells;
  final List<AdminTableColumn> columns;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final badgeIndex = columns.indexWhere((c) => c.badge);
    final extras = <Widget>[];
    for (var i = 1; i < cells.length && i < columns.length; i++) {
      if (i == badgeIndex) continue;
      extras.add(
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 86,
                child: Text(
                  columns[i].label,
                  style: AdminTypography.caption.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.muted,
                  ),
                ),
              ),
              Expanded(child: cells[i]),
            ],
          ),
        ),
      );
    }

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Ink(
          decoration: AppDecorations.card(),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 8, 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (cells.isNotEmpty)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: cells.first),
                            if (badgeIndex > 0 && badgeIndex < cells.length) ...[
                              const SizedBox(width: 8),
                              cells[badgeIndex],
                            ],
                          ],
                        ),
                      ...extras,
                    ],
                  ),
                ),
                if (onTap != null)
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      color: AppColors.muted,
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
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  for (var i = 0;
                      i < widget.columns.length && i < widget.cells.length;
                      i++)
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
      ),
    );
  }
}
