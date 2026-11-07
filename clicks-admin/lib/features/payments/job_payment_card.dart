import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'payment_ui.dart';
import 'refund_actions.dart';

/// Job detail "Payment & refunds" card (full admins only — the endpoints it
/// calls are full-admin): audited mark paid / waive on unpaid jobs, a refund
/// request on paid ones, the cancel-time refund decision and the job's
/// refund cases.
class JobPaymentCard extends StatefulWidget {
  const JobPaymentCard({super.key, required this.job, required this.onChanged});

  final Map<String, dynamic> job;
  final VoidCallback onChanged;

  @override
  State<JobPaymentCard> createState() => _JobPaymentCardState();
}

class _JobPaymentCardState extends State<JobPaymentCard> {
  static const _methods = <String, String>{
    'waived': 'Waive the balance (no payment)',
    'cash': 'Cash',
    'card': 'Card (outside SkipCash)',
    'wallet': 'Wallet',
    'fawran': 'Fawran',
  };

  List<Map<String, dynamic>> _refunds = [];
  bool _loadingRefunds = false;

  String get _jobId => widget.job['_id']?.toString() ?? widget.job['id']?.toString() ?? '';
  String get _paymentStatus =>
      (widget.job['payment_status'] ?? widget.job['paymentStatus'] ?? 'unpaid')
          .toString()
          .toLowerCase();
  String get _jobStatus => widget.job['job_status']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    _loadRefunds();
  }

  @override
  void didUpdateWidget(covariant JobPaymentCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.job, widget.job)) _loadRefunds();
  }

  Future<void> _loadRefunds() async {
    if (_jobId.isEmpty) return;
    setState(() => _loadingRefunds = true);
    final res = await DioHelper.getData(
      url: EndPoints.refunds,
      query: {'job_id': _jobId, 'limit': 50},
    );
    if (!mounted) return;
    setState(() {
      _loadingRefunds = false;
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['refunds'] is List) {
        _refunds = (data['refunds'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    });
  }

  Future<void> _markPaid() async {
    final refCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    var method = 'waived';
    String? error;
    var busy = false;
    final done = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          final waive = method == 'waived';
          Future<void> submit() async {
            final reference = refCtrl.text.trim();
            final reason = reasonCtrl.text.trim();
            if (waive && reason.isEmpty) {
              setLocal(() => error = 'A reason is required to waive a balance');
              return;
            }
            if (!waive && reference.isEmpty) {
              setLocal(() => error = 'Enter the payment reference');
              return;
            }
            setLocal(() {
              busy = true;
              error = null;
            });
            final res = await DioHelper.postData(
              url: EndPoints.jobMarkPaid(_jobId),
              data: {
                'payment_method': method,
                if (reference.isNotEmpty) 'reference': reference,
                if (reason.isNotEmpty) 'reason': reason,
              },
            );
            if (res.statusCode == 200) {
              if (ctx.mounted) Navigator.pop(ctx, true);
              return;
            }
            setLocal(() {
              busy = false;
              error = DioHelper.errorMessage(res) ?? 'Mark paid failed';
            });
          }

          return AlertDialog(
            title: const Text('Mark paid / waive'),
            content: SizedBox(
              width: 440,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Records the job as paid outside the app, issues the receipt and '
                      'releases the unpaid hold. Audited with your name.',
                      style: AdminTypography.body,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    DropdownButtonFormField<String>(
                      initialValue: method,
                      decoration: const InputDecoration(labelText: 'How was it settled?'),
                      items: [
                        for (final entry in _methods.entries)
                          DropdownMenuItem(value: entry.key, child: Text(entry.value)),
                      ],
                      onChanged: busy
                          ? null
                          : (v) => setLocal(() {
                                method = v ?? 'waived';
                                error = null;
                              }),
                    ),
                    if (!waive)
                      TextField(
                        controller: refCtrl,
                        enabled: !busy,
                        maxLength: 200,
                        decoration: const InputDecoration(
                          labelText: 'Payment reference',
                          helperText: 'Receipt / transfer / terminal reference',
                        ),
                      ),
                    TextField(
                      controller: reasonCtrl,
                      enabled: !busy,
                      maxLines: 3,
                      maxLength: 1000,
                      decoration: InputDecoration(
                        labelText: waive ? 'Reason for waiving' : 'Note (optional)',
                      ),
                    ),
                    if (error != null)
                      Text(error!, style: const TextStyle(color: AppColors.danger)),
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: busy ? null : () => Navigator.pop(ctx, false),
                child: const Text('Back'),
              ),
              FilledButton(
                onPressed: busy ? null : submit,
                child: Text(busy ? 'Saving...' : (waive ? 'Waive balance' : 'Mark paid')),
              ),
            ],
          );
        },
      ),
    );
    if (done == true && mounted) {
      PaymentUi.snack(context, method == 'waived' ? 'Balance waived' : 'Job marked paid');
      widget.onChanged();
    }
  }

  Future<void> _requestRefund() async {
    final ref = widget.job['job_reference']?.toString() ?? '';
    final ok = await RefundActions.requestForJob(
      context,
      jobId: _jobId,
      jobLabel: [
        if (ref.isNotEmpty) ref,
        widget.job['clientName']?.toString() ?? '',
      ].where((s) => s.isNotEmpty).join(' · '),
    );
    if (ok && mounted) {
      _loadRefunds();
      widget.onChanged();
    }
  }

  Widget _cancellationDecision() {
    final decision = widget.job['cancellation_refund'];
    if (decision is! Map || decision['decision'] == null) return const SizedBox.shrink();
    final kind = decision['decision'].toString();
    final label = switch (kind) {
      'full' => 'Full refund',
      'partial' => 'Partial refund of ${PaymentUi.money(decision['amount'])}',
      'none' => 'No refund',
      _ => kind,
    };
    final requestError = decision['request_error']?.toString() ?? '';
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Cancelled with: $label', style: AdminTypography.body),
          if ((decision['reason']?.toString() ?? '').isNotEmpty)
            Text('Reason: ${decision['reason']}', style: AdminTypography.caption),
          if (requestError.isNotEmpty)
            Text(
              'The refund case could not be opened automatically: $requestError. '
              'Request it manually below.',
              style: AdminTypography.caption.copyWith(color: AppColors.danger),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final paid = _paymentStatus == 'paid' || _paymentStatus == 'partially_refunded';
    final canMarkPaid = _paymentStatus == 'unpaid' && _jobStatus != 'cancelled';
    final refunded = widget.job['refunded_amount'];
    return AdminCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text('Payment & refunds', style: AdminTypography.heading)),
              if (_loadingRefunds)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            [
              'Payment: $_paymentStatus',
              if ((widget.job['payment_method']?.toString() ?? '').isNotEmpty)
                'via ${widget.job['payment_method']}',
              if (refunded is num && refunded > 0) 'refunded ${PaymentUi.money(refunded)}',
            ].join(' · '),
            style: AdminTypography.body,
          ),
          _cancellationDecision(),
          if (_refunds.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final r in _refunds)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${PaymentUi.money(r['amount'])} · ${r['reason'] ?? ''}',
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(
                  '${PaymentUi.refundStatusLabel(r['status']?.toString() ?? '')} · '
                  '${PaymentUi.dateTime(r['createdAt'])}',
                ),
                trailing: PaymentUi.refundStatusPill(r['status']?.toString() ?? ''),
                onTap: () async {
                  await Navigator.of(context)
                      .pushNamed(Routes.refundDetailPath(r['_id'].toString()));
                  if (mounted) {
                    _loadRefunds();
                    widget.onChanged();
                  }
                },
              ),
          ],
          if (canMarkPaid) ...[
            const SizedBox(height: AppSpacing.sm),
            PrimaryButton(
              label: 'Mark paid / waive',
              outlined: true,
              onPressed: _markPaid,
            ),
          ],
          if (paid) ...[
            const SizedBox(height: AppSpacing.sm),
            PrimaryButton(
              label: 'Request refund',
              outlined: true,
              onPressed: _requestRefund,
            ),
          ],
        ],
      ),
    );
  }
}
