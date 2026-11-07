import 'dart:convert';

import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'payment_ui.dart';

/// Outbox events (technician credit, partner earnings, ...) that exhausted
/// their retries. Replay puts one back in the queue with a fresh retry budget
/// and tries it immediately; handlers are idempotent, so replay never double-pays.
class FailedEventsScreen extends StatefulWidget {
  const FailedEventsScreen({super.key});

  @override
  State<FailedEventsScreen> createState() => _FailedEventsScreenState();
}

class _FailedEventsScreenState extends State<FailedEventsScreen> {
  static const _pageSize = 50;
  final List<Map<String, dynamic>> _items = [];
  int _total = 0;
  int _page = 1;
  bool _loading = false;
  String? _error;
  final Set<String> _replaying = {};

  @override
  void initState() {
    super.initState();
    _load(refresh: true);
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      if (refresh) {
        _page = 1;
        _items.clear();
      }
    });
    final res = await DioHelper.getData(
      url: EndPoints.outboxFailed,
      query: {'page': _page, 'limit': _pageSize},
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      final data = res.data;
      if (res.statusCode == 200 && data is Map) {
        final list = data['events'];
        if (list is List) {
          _items.addAll(list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
        }
        _total = int.tryParse('${data['total']}') ?? _items.length;
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load events';
      }
    });
  }

  Future<void> _replay(Map<String, dynamic> event) async {
    final id = event['_id']?.toString() ?? '';
    if (id.isEmpty || _replaying.contains(id)) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Replay event'),
        content: Text(
          'Re-run "${event['type']}" now with a fresh retry budget? The handler is '
          'idempotent, so money already credited is not credited twice.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Back')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Replay')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _replaying.add(id));
    final res = await DioHelper.postData(url: EndPoints.outboxReplay(id));
    if (!mounted) return;
    setState(() => _replaying.remove(id));
    final data = res.data;
    if (res.statusCode == 200 && data is Map) {
      final delivered = data['delivered'] == true;
      PaymentUi.snack(
        context,
        delivered
            ? 'Replayed and delivered'
            : 'Requeued — it did not go through yet; the worker keeps retrying',
        error: !delivered,
      );
    } else {
      PaymentUi.snack(
        context,
        DioHelper.errorMessage(res) ?? 'Replay failed',
        error: true,
      );
    }
    _load(refresh: true);
  }

  void _showPayload(Map<String, dynamic> event) {
    String pretty;
    try {
      pretty = const JsonEncoder.withIndent('  ').convert(event['payload']);
    } catch (_) {
      pretty = event['payload']?.toString() ?? '';
    }
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(event['type']?.toString() ?? 'Event'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Last error', style: AdminTypography.label),
                SelectableText(
                  event['last_error']?.toString() ?? '—',
                  style: AdminTypography.body.copyWith(color: AppColors.danger),
                ),
                const SizedBox(height: AppSpacing.md),
                Text('Payload', style: AdminTypography.label),
                SelectableText(
                  pretty,
                  style: AdminTypography.caption.copyWith(fontFamily: 'monospace'),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        ],
      ),
    );
  }

  List<Widget> _row(Map<String, dynamic> e) {
    final id = e['_id']?.toString() ?? '';
    final busy = _replaying.contains(id);
    return [
      PaymentCell(
        e['type']?.toString() ?? '—',
        sub: PaymentUi.dateTime(e['created_at']),
        bold: true,
      ),
      PaymentCell('${e['attempts'] ?? 0}'),
      PaymentCell(e['last_error']?.toString() ?? '—', color: AppColors.danger),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton.icon(
          onPressed: busy ? null : () => _replay(e),
          icon: busy
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.replay, size: 18),
          label: const Text('Replay'),
        ),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return PaymentsListLayout(
      title: 'Failed events',
      description: 'Background jobs (technician credit, partner earnings, ...) that '
          'failed every retry. Fix the cause, then Replay. Tap a row for the payload.',
      columns: const [
        AdminTableColumn(label: 'Type / created', flex: 3),
        AdminTableColumn(label: 'Attempts', flex: 1),
        AdminTableColumn(label: 'Last error', flex: 5),
        AdminTableColumn(label: '', flex: 2, badge: true),
      ],
      rows: _items.map(_row).toList(),
      loading: _loading,
      error: _error,
      onRefresh: () => _load(refresh: true),
      hasMore: _items.isNotEmpty && _items.length < _total,
      onLoadMore: () {
        _page += 1;
        _load();
      },
      onRowTap: (index) => _showPayload(_items[index]),
      emptyMessage: 'No failed events',
    );
  }
}
