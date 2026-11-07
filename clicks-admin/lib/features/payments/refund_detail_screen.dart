import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_empty_state.dart';
import '../../core/components/admin_info_list.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'payment_ui.dart';
import 'refund_actions.dart';

class RefundDetailScreen extends StatefulWidget {
  const RefundDetailScreen({super.key, required this.refundId});
  final String refundId;

  @override
  State<RefundDetailScreen> createState() => _RefundDetailScreenState();
}

class _RefundDetailScreenState extends State<RefundDetailScreen> {
  Map<String, dynamic>? _refund;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await DioHelper.getData(url: EndPoints.refund(widget.refundId));
    if (!mounted) return;
    setState(() {
      _loading = false;
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['refund'] is Map) {
        _refund = Map<String, dynamic>.from(data['refund'] as Map);
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Refund not found';
      }
    });
  }

  Future<void> _approve() async {
    final refund = _refund;
    if (refund == null) return;
    await RefundActions.approve(context, refund);
    // Reload even when the dialog was dismissed after an error: a failed
    // SkipCash call still moves the case to `failed`.
    if (mounted) _load();
  }

  Future<void> _reject() async {
    final refund = _refund;
    if (refund == null) return;
    if (await RefundActions.reject(context, refund) && mounted) _load();
  }

  Widget _statusBanner(String status, Map<String, dynamic> r) {
    String? text;
    Color colour = AppColors.info;
    switch (status) {
      case 'requested':
        text = 'Waiting for a Super Admin (or finance admin) other than the '
            'requester to approve or reject it. No money has moved.';
        colour = AppColors.warning;
        break;
      case 'processing':
        text = 'Sent to SkipCash — awaiting confirmation. The credit note and the '
            "job's payment status update when SkipCash confirms the refund.";
        break;
      case 'failed':
        text = 'The refund did not go through: ${r['error']?.toString().isNotEmpty == true ? r['error'] : 'unknown error'}. '
            'Retry it, or refund in the SkipCash portal / by cash and record the reference.';
        colour = AppColors.danger;
        break;
      case 'succeeded':
        text = (r['credit_note_number']?.toString() ?? '').isNotEmpty
            ? 'Refunded. Credit note ${r['credit_note_number']} was issued.'
            : 'Refunded.';
        colour = AppColors.success;
        break;
      case 'rejected':
        text = 'Rejected${(r['rejection_reason']?.toString() ?? '').isNotEmpty ? ': ${r['rejection_reason']}' : ''}.';
        colour = AppColors.textSecondary;
        break;
    }
    if (text == null) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colour.withValues(alpha: 0.4)),
      ),
      child: Text(text, style: AdminTypography.body),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _refund == null) return const AdminLoadingState();
    final r = _refund;
    if (r == null) {
      return AdminEmptyState(
        message: _error ?? 'Refund not found',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }
    final status = r['status']?.toString() ?? '';
    final jobId = PaymentUi.jobIdOf(r);
    final job = r['job'] is Map ? r['job'] as Map : null;
    final approver = PaymentUi.canApproveRefunds();
    final requestedById = r['requested_by'] is Map
        ? (r['requested_by'] as Map)['id']?.toString()
        : null;
    final iRequested =
        requestedById != null && requestedById == PaymentUi.currentAdminId();
    final manual = r['method']?.toString() == 'manual';

    String opt(String key) {
      final v = r[key]?.toString() ?? '';
      return v.isEmpty ? '' : v;
    }

    final items = <AdminInfoItem>[
      AdminInfoItem(
        label: 'Status',
        value: PaymentUi.refundStatusLabel(status),
        icon: Icons.flag_outlined,
      ),
      AdminInfoItem(
        label: 'Amount',
        value: PaymentUi.money(r['amount']),
        icon: Icons.payments_outlined,
      ),
      AdminInfoItem(
        label: r['kind'] == 'membership' ? 'Membership' : 'Job',
        value: PaymentUi.jobLabel(r),
        icon: Icons.work_outline,
      ),
      if (job != null)
        AdminInfoItem(
          label: 'Job payment',
          value: [
            job['payment_status']?.toString() ?? '',
            job['payment_method']?.toString() ?? '',
            if (job['refunded_amount'] != null && job['refunded_amount'] != 0)
              'refunded ${PaymentUi.money(job['refunded_amount'])}',
          ].where((s) => s.isNotEmpty).join(' · '),
          icon: Icons.credit_card_outlined,
        ),
      AdminInfoItem(
        label: 'Reason',
        value: opt('reason').isEmpty ? '—' : opt('reason'),
        icon: Icons.notes_outlined,
      ),
      AdminInfoItem(
        label: 'Method',
        value: manual ? 'Manual (cash / bank / portal reference)' : 'SkipCash card refund',
        icon: Icons.account_balance_outlined,
      ),
      AdminInfoItem(
        label: 'Source',
        value: opt('source').isEmpty ? '—' : opt('source'),
        icon: Icons.source_outlined,
      ),
      AdminInfoItem(
        label: 'Requested by',
        value: '${PaymentUi.actorLabel(r['requested_by'])} · ${PaymentUi.dateTime(r['createdAt'])}',
        icon: Icons.person_outline,
      ),
      if (r['approved_by'] is Map)
        AdminInfoItem(
          label: 'Approved by',
          value: '${PaymentUi.actorLabel(r['approved_by'])} · ${PaymentUi.dateTime(r['approved_at'])}',
          icon: Icons.verified_outlined,
        ),
      if (opt('provider_submitted_at').isNotEmpty)
        AdminInfoItem(
          label: 'Sent to SkipCash',
          value: PaymentUi.dateTime(r['provider_submitted_at']),
          icon: Icons.send_outlined,
        ),
      if (opt('provider_refund_id').isNotEmpty)
        AdminInfoItem(
          label: 'SkipCash refund id',
          value: opt('provider_refund_id'),
          icon: Icons.tag,
        ),
      if (opt('provider_confirmed_at').isNotEmpty)
        AdminInfoItem(
          label: 'Confirmed by SkipCash',
          value: PaymentUi.dateTime(r['provider_confirmed_at']),
          icon: Icons.done_all,
        ),
      if (opt('manual_reference').isNotEmpty)
        AdminInfoItem(
          label: 'Manual reference',
          value: opt('manual_reference'),
          icon: Icons.receipt_long_outlined,
        ),
      if (opt('completed_at').isNotEmpty)
        AdminInfoItem(
          label: 'Completed',
          value: PaymentUi.dateTime(r['completed_at']),
          icon: Icons.event_available_outlined,
        ),
      if (opt('error').isNotEmpty)
        AdminInfoItem(
          label: 'Last error',
          value: opt('error'),
          icon: Icons.error_outline,
        ),
      if (r['rejected_by'] is Map)
        AdminInfoItem(
          label: 'Rejected by',
          value: PaymentUi.actorLabel(r['rejected_by']),
          icon: Icons.block,
        ),
      if (opt('credit_note_number').isNotEmpty)
        AdminInfoItem(
          label: 'Credit note',
          value: opt('credit_note_number'),
          icon: Icons.description_outlined,
        ),
    ];

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: 'Refund ${PaymentUi.money(r['amount'])}',
          subtitle: PaymentUi.jobLabel(r),
          trailing: PaymentUi.refundStatusPill(status),
        ),
        const SizedBox(height: AppSpacing.md),
        _statusBanner(status, r),
        const SizedBox(height: AppSpacing.md),
        AdminCard(child: AdminInfoList(items: items)),
        const SizedBox(height: AppSpacing.md),
        if (jobId != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () =>
                  Navigator.of(context).pushNamed(Routes.jobDetailPath(jobId)),
              icon: const Icon(Icons.open_in_new, size: 18),
              label: const Text('Open job'),
            ),
          ),
        if (PaymentUi.isRefundOpen(status)) ...[
          if (!approver)
            Text(
              'Only a Super Admin who did not request this refund can approve or reject it.',
              style: AdminTypography.caption,
            )
          else ...[
            if (iRequested)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(
                  'You requested this refund, so the server will refuse your approval — '
                  'ask another Super Admin.',
                  style: AdminTypography.caption.copyWith(color: AppColors.danger),
                ),
              ),
            PrimaryButton(
              label: status == 'failed'
                  ? (manual ? 'Approve with reference' : 'Retry / complete with reference')
                  : 'Approve refund',
              loading: _loading,
              onPressed: _approve,
            ),
            const SizedBox(height: AppSpacing.sm),
            PrimaryButton(
              label: 'Reject',
              outlined: true,
              loading: _loading,
              onPressed: _reject,
            ),
          ],
        ],
        if (RefundActions.hasCreditNote(r)) ...[
          const SizedBox(height: AppSpacing.sm),
          PrimaryButton(
            label: 'Download credit note',
            outlined: true,
            icon: const Icon(Icons.download, size: 18, color: AppColors.primary),
            onPressed: () => RefundActions.downloadCreditNote(context, r),
          ),
        ],
      ],
    );
  }
}
