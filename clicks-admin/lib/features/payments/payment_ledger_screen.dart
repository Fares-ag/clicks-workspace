import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'payment_ui.dart';
import 'refund_actions.dart';

/// SkipCash payment attempts (one row per provider payment id). Highlights
/// captures that need a person: duplicate captures (customer charged twice)
/// and amount mismatches, plus links still pending after 48h.
class PaymentLedgerScreen extends StatefulWidget {
  const PaymentLedgerScreen({super.key});

  @override
  State<PaymentLedgerScreen> createState() => _PaymentLedgerScreenState();
}

class _PaymentLedgerScreenState extends State<PaymentLedgerScreen> {
  static const _limit = 200;
  static const _filters = [
    FilterChipOption(label: 'All', value: ''),
    FilterChipOption(label: 'Stale pending (>48h)', value: 'stale'),
    FilterChipOption(label: 'Duplicate capture', value: 'outcome:duplicate_capture'),
    FilterChipOption(label: 'Amount mismatch', value: 'outcome:amount_mismatch'),
    FilterChipOption(label: 'Pending', value: 'status:pending'),
    FilterChipOption(label: 'Paid', value: 'status:paid'),
    FilterChipOption(label: 'Failed', value: 'status:failed'),
    FilterChipOption(label: 'Refunded', value: 'status:refunded'),
    FilterChipOption(label: 'Partially refunded', value: 'status:partially_refunded'),
  ];

  String _filter = '';
  List<Map<String, dynamic>> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Map<String, dynamic> _query() {
    final query = <String, dynamic>{'limit': _limit};
    if (_filter == 'stale') {
      query['stale'] = '1';
    } else if (_filter.contains(':')) {
      final parts = _filter.split(':');
      query[parts[0]] = parts[1];
    }
    return query;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await DioHelper.getData(url: EndPoints.paymentAttempts, query: _query());
    if (!mounted) return;
    setState(() {
      _loading = false;
      final data = res.data;
      if (res.statusCode == 200 && data is Map && data['attempts'] is List) {
        _items = (data['attempts'] as List)
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      } else {
        _items = [];
        _error = DioHelper.errorMessage(res) ?? 'Failed to load the payment ledger';
      }
    });
  }

  static bool _isStale(Map<String, dynamic> a) {
    if (a['status'] != 'pending') return false;
    final created = DateTime.tryParse(a['createdAt']?.toString() ?? '');
    return created != null &&
        DateTime.now().difference(created) > const Duration(hours: 48);
  }

  Widget _flag(Map<String, dynamic> a) {
    final outcome = a['outcome']?.toString() ?? '';
    if (outcome == 'duplicate_capture') {
      return const StatusPill(label: 'DUPLICATE CAPTURE', status: 'cancelled');
    }
    if (outcome == 'amount_mismatch') {
      return const StatusPill(label: 'AMOUNT MISMATCH', status: 'on_hold');
    }
    if (_isStale(a)) {
      return const StatusPill(label: 'Stale >48h', status: 'pending');
    }
    if (outcome.isEmpty) return const Text('—');
    return StatusPill(label: outcome, status: outcome == 'applied' ? 'paid' : outcome);
  }

  List<Widget> _row(Map<String, dynamic> a) {
    final flagged = a['outcome'] == 'duplicate_capture' || a['outcome'] == 'amount_mismatch';
    final mismatch = a['outcome'] == 'amount_mismatch' && a['expected_amount'] != null;
    final refunded = (a['refunded_amount'] is num) && (a['refunded_amount'] as num) > 0;
    return [
      PaymentCell(
        PaymentUi.jobLabel(a),
        sub: '${a['kind'] ?? ''} · ${PaymentUi.dateTime(a['createdAt'])}',
        bold: true,
        color: flagged ? AppColors.danger : null,
      ),
      PaymentCell(
        PaymentUi.money(a['amount']),
        sub: [
          if (mismatch) 'expected ${PaymentUi.money(a['expected_amount'])}',
          if (refunded) 'refunded ${PaymentUi.money(a['refunded_amount'])}',
        ].join(' · '),
        bold: true,
        color: mismatch ? AppColors.danger : null,
      ),
      StatusPill(
        label: a['status']?.toString() ?? '—',
        status: a['status']?.toString(),
      ),
      _flag(a),
      PaymentCell(
        a['provider_payment_id']?.toString() ?? '—',
        sub: (a['transaction_id']?.toString() ?? '').isEmpty
            ? null
            : 'tx ${a['transaction_id']}',
      ),
    ];
  }

  Future<void> _openAttempt(Map<String, dynamic> a) async {
    final jobId = PaymentUi.jobIdOf(a);
    final refundCase = a['refund_case_id']?.toString() ?? '';
    final events = a['events'] is List ? (a['events'] as List).whereType<Map>().toList() : <Map>[];
    final go = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.8),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            shrinkWrap: true,
            children: [
              Text(
                '${PaymentUi.money(a['amount'])} · ${a['status'] ?? ''}',
                style: AdminTypography.heading,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(PaymentUi.jobLabel(a), style: AdminTypography.body),
              Text('SkipCash id ${a['provider_payment_id'] ?? '—'}', style: AdminTypography.caption),
              if (a['outcome'] == 'duplicate_capture')
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    'This capture did not pay the job — the customer was charged twice. '
                    '${refundCase.isEmpty ? 'Open a refund case for it.' : 'A refund case is open for it.'}',
                    style: AdminTypography.body.copyWith(color: AppColors.danger),
                  ),
                ),
              if (a['outcome'] == 'amount_mismatch')
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    'Captured ${PaymentUi.money(a['amount'])} but the job owed '
                    '${PaymentUi.money(a['expected_amount'])} when it was applied. Review the job total.',
                    style: AdminTypography.body.copyWith(color: AppColors.danger),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              Text('Events', style: AdminTypography.label),
              if (events.isEmpty) Text('No events', style: AdminTypography.caption),
              for (final e in events.reversed)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${e['source'] ?? ''} · ${e['status'] ?? ''}'
                      '${(e['amount']?.toString() ?? '').isEmpty ? '' : ' · QAR ${e['amount']}'}'),
                  subtitle: Text([
                    PaymentUi.dateTime(e['at']),
                    if ((e['note']?.toString() ?? '').isNotEmpty) e['note'].toString(),
                  ].join(' · ')),
                ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                children: [
                  if (jobId != null)
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pop(ctx, 'job'),
                      icon: const Icon(Icons.work_outline, size: 18),
                      label: const Text('Open job'),
                    ),
                  if (refundCase.isEmpty &&
                      jobId != null &&
                      a['outcome'] == 'duplicate_capture')
                    FilledButton.icon(
                      onPressed: () => Navigator.pop(ctx, 'request_refund'),
                      icon: const Icon(Icons.undo, size: 18),
                      label: const Text('Request refund of this capture'),
                    ),
                  if (refundCase.isNotEmpty)
                    OutlinedButton.icon(
                      onPressed: () => Navigator.pop(ctx, 'refund'),
                      icon: const Icon(Icons.undo, size: 18),
                      label: const Text('Open refund case'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || go == null) return;
    if (go == 'job' && jobId != null) {
      await Navigator.of(context).pushNamed(Routes.jobDetailPath(jobId));
    } else if (go == 'request_refund' && jobId != null) {
      await RefundActions.requestForJob(
        context,
        jobId: jobId,
        jobLabel: PaymentUi.jobLabel(a),
        attemptId: a['_id']?.toString(),
      );
    } else if (go == 'refund') {
      await Navigator.of(context).pushNamed(Routes.refundDetailPath(refundCase));
    }
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final flagged = _items
        .where((a) => a['outcome'] == 'duplicate_capture' || a['outcome'] == 'amount_mismatch')
        .length;
    return PaymentsListLayout(
      title: 'Payment ledger',
      description: 'Every SkipCash payment link and capture. Red rows need a person: '
          'a duplicate capture should be refunded, an amount mismatch reviewed. '
          '"Stale" links have been pending for more than 48 hours.',
      filterOptions: _filters,
      selectedFilter: _filter,
      onFilter: (value) {
        setState(() => _filter = value);
        _load();
      },
      columns: const [
        AdminTableColumn(label: 'Job / created', flex: 4),
        AdminTableColumn(label: 'Amount', flex: 3),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Flag', flex: 3, badge: true),
        AdminTableColumn(label: 'SkipCash id', flex: 4),
      ],
      rows: _items.map(_row).toList(),
      loading: _loading,
      error: _error,
      onRefresh: _load,
      onRowTap: (index) => _openAttempt(_items[index]),
      emptyMessage: 'No payment attempts for this filter',
      footer: _items.length >= _limit
          ? 'Showing the latest $_limit attempts. Narrow the filter to see older ones.'
          : (flagged > 0 ? '$flagged flagged capture(s) in this list.' : null),
    );
  }
}
