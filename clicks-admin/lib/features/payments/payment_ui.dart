import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/components/admin_data_table.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/primary_button.dart';
import '../../core/components/status_pill.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// Shared bits for the refund / ledger / outbox screens.
class PaymentUi {
  PaymentUi._();

  /// Roles the server lets approve or reject a refund (and only when the
  /// approver is not the requester — the server enforces that part).
  static const refundApproverRoles = {'Super Admin'};

  static String? currentRole() =>
      CacheHelper.getUserProfileSync()?['role']?.toString();

  static String? currentAdminId() {
    final profile = CacheHelper.getUserProfileSync();
    final id = profile?['id'] ?? profile?['_id'];
    final text = id?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static bool canApproveRefunds() =>
      refundApproverRoles.contains(currentRole());

  /// Approve / reject are possible while the case is open: a fresh request,
  /// or a failed attempt (retry SkipCash, or complete with a manual reference).
  static bool isRefundOpen(String status) =>
      status == 'requested' || status == 'failed';

  static String refundStatusLabel(String status) {
    switch (status) {
      case 'requested':
        return 'Awaiting approval';
      case 'processing':
        return 'Sent to SkipCash — awaiting confirmation';
      case 'succeeded':
        return 'Refunded';
      case 'failed':
        return 'Failed';
      case 'rejected':
        return 'Rejected';
      default:
        return status.isEmpty ? '—' : status;
    }
  }

  /// Maps a refund status onto the shared pill colours.
  static Widget refundStatusPill(String status) {
    const colourKey = {
      'requested': 'pending',
      'processing': 'en_route',
      'succeeded': 'completed',
      'failed': 'cancelled',
      'rejected': 'inactive',
    };
    final label = status == 'processing'
        ? 'Awaiting SkipCash'
        : refundStatusLabel(status);
    return StatusPill(label: label, status: colourKey[status] ?? status);
  }

  static String money(dynamic value) {
    final n = value is num ? value : num.tryParse(value?.toString() ?? '');
    if (n == null) return '—';
    return 'QAR ${n.toStringAsFixed(2)}';
  }

  static String dateTime(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '—';
    return DateFormat('dd MMM yyyy, h:mm a').format(dt.toLocal());
  }

  static String shortId(dynamic raw) {
    final id = raw?.toString() ?? '';
    if (id.isEmpty) return '—';
    return id.length > 6 ? '#${id.substring(id.length - 6)}' : '#$id';
  }

  static String actorLabel(dynamic actor) {
    if (actor is! Map) return '—';
    final type = actor['type']?.toString() ?? '';
    final role = actor['role']?.toString() ?? '';
    final name = actor['name']?.toString() ?? '';
    final id = actor['id']?.toString() ?? '';
    final who = name.isNotEmpty
        ? name
        : (role.isNotEmpty ? role : (type.isEmpty ? 'system' : type));
    final mine = id.isNotEmpty && id == currentAdminId() ? ' (you)' : '';
    final tail = id.isNotEmpty && name.isEmpty ? ' ${shortId(id)}' : '';
    final prefix = type.isNotEmpty && type != 'admin' && who != type ? '$type · ' : '';
    return '$prefix$who$tail$mine';
  }

  /// "JOB-REF · Client" from the server's `job` summary, falling back to the id.
  static String jobLabel(Map<String, dynamic> row) {
    final job = row['job'];
    if (job is Map) {
      final ref = job['job_reference']?.toString().trim() ?? '';
      final client = job['clientName']?.toString().trim() ?? '';
      final head = ref.isNotEmpty ? ref : shortId(job['_id']);
      return client.isEmpty ? head : '$head · $client';
    }
    final jobId = row['job_id']?.toString() ?? '';
    if (jobId.isNotEmpty) return 'Job ${shortId(jobId)}';
    final subId = row['subscription_id']?.toString() ?? '';
    if (subId.isNotEmpty) return 'Membership ${shortId(subId)}';
    return '—';
  }

  static String? jobIdOf(Map<String, dynamic> row) {
    final job = row['job'];
    final id = (job is Map ? job['_id'] : null) ?? row['job_id'];
    final text = id?.toString() ?? '';
    return text.isEmpty ? null : text;
  }

  static void snack(BuildContext context, String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }
}

/// Text cell used by the payments tables.
class PaymentCell extends StatelessWidget {
  const PaymentCell(this.text, {super.key, this.sub, this.color, this.bold = false});

  final String text;
  final String? sub;
  final Color? color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          text,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: AdminTypography.body.copyWith(
            color: color,
            fontWeight: bold ? FontWeight.w600 : null,
          ),
        ),
        if (sub != null && sub!.isNotEmpty)
          Text(
            sub!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: AdminTypography.caption.copyWith(color: AppColors.textSecondary),
          ),
      ],
    );
  }
}

/// Page chrome shared by the three payments lists: intro, filter chips,
/// table, load-more and error line.
class PaymentsListLayout extends StatelessWidget {
  const PaymentsListLayout({
    super.key,
    required this.title,
    required this.description,
    required this.columns,
    required this.rows,
    required this.loading,
    required this.onRefresh,
    this.filterOptions,
    this.selectedFilter = '',
    this.onFilter,
    this.error,
    this.hasMore = false,
    this.onLoadMore,
    this.onRowTap,
    this.emptyMessage = 'Nothing here',
    this.footer,
  });

  final String title;
  final String description;
  final List<AdminTableColumn> columns;
  final List<List<Widget>> rows;
  final bool loading;
  final Future<void> Function() onRefresh;
  final List<FilterChipOption>? filterOptions;
  final String selectedFilter;
  final ValueChanged<String>? onFilter;
  final String? error;
  final bool hasMore;
  final VoidCallback? onLoadMore;
  final void Function(int index)? onRowTap;
  final String emptyMessage;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(title, style: AdminTypography.pageTitle)),
                  IconButton(
                    tooltip: 'Refresh',
                    onPressed: loading ? null : () => onRefresh(),
                    icon: const Icon(Icons.refresh),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(description, style: AdminTypography.caption),
              if (filterOptions != null && onFilter != null) ...[
                const SizedBox(height: AppSpacing.sm),
                FilterChipBar(
                  options: filterOptions!,
                  selected: selectedFilter,
                  onSelected: onFilter!,
                ),
              ],
            ],
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.xs,
            ),
            child: Text(
              error!,
              style: AdminTypography.body.copyWith(color: AppColors.danger),
            ),
          ),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.primary,
            onRefresh: onRefresh,
            child: AdminDataTable(
              columns: columns,
              rows: rows,
              loading: loading,
              emptyMessage: emptyMessage,
              onRowTap: onRowTap,
            ),
          ),
        ),
        if (hasMore && onLoadMore != null)
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: PrimaryButton(
              label: 'Load more',
              outlined: true,
              loading: loading,
              onPressed: onLoadMore,
            ),
          ),
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: Text(footer!, style: AdminTypography.caption),
          ),
      ],
    );
  }
}
