import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/routing/routes.dart';
import 'payment_ui.dart';

/// Refund cases (full admin). Requested by any full admin, approved or
/// rejected by a different Super Admin; card refunds then wait for SkipCash.
class RefundsScreen extends StatefulWidget {
  const RefundsScreen({super.key});

  @override
  State<RefundsScreen> createState() => _RefundsScreenState();
}

class _RefundsScreenState extends State<RefundsScreen> {
  static const _pageSize = 50;
  static const _filters = [
    FilterChipOption(label: 'Awaiting approval', value: 'requested'),
    FilterChipOption(label: 'Awaiting SkipCash', value: 'processing'),
    FilterChipOption(label: 'Failed', value: 'failed'),
    FilterChipOption(label: 'Refunded', value: 'succeeded'),
    FilterChipOption(label: 'Rejected', value: 'rejected'),
    FilterChipOption(label: 'All', value: ''),
  ];

  String _status = 'requested';
  final List<Map<String, dynamic>> _items = [];
  int _total = 0;
  int _page = 1;
  bool _loading = false;
  String? _error;

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
      url: EndPoints.refunds,
      query: {
        'page': _page,
        'limit': _pageSize,
        if (_status.isNotEmpty) 'status': _status,
      },
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      final data = res.data;
      if (res.statusCode == 200 && data is Map) {
        final list = data['refunds'];
        if (list is List) {
          _items.addAll(list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
        }
        _total = int.tryParse('${data['total']}') ?? _items.length;
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load refunds';
      }
    });
  }

  void _loadMore() {
    _page += 1;
    _load();
  }

  Future<void> _open(Map<String, dynamic> refund) async {
    final id = refund['_id']?.toString() ?? '';
    if (id.isEmpty) return;
    await Navigator.of(context).pushNamed(Routes.refundDetailPath(id));
    if (mounted) _load(refresh: true);
  }

  List<Widget> _row(Map<String, dynamic> r) {
    final status = r['status']?.toString() ?? '';
    final error = r['error']?.toString() ?? '';
    return [
      PaymentCell(
        PaymentUi.jobLabel(r),
        sub: r['kind'] == 'membership' ? 'Membership' : null,
        bold: true,
      ),
      PaymentCell(PaymentUi.money(r['amount']), bold: true),
      PaymentCell(
        r['reason']?.toString() ?? '—',
        sub: 'source: ${r['source'] ?? '—'} · ${r['method'] == 'manual' ? 'manual (cash/portal)' : 'SkipCash'}',
      ),
      PaymentCell(
        PaymentUi.actorLabel(r['requested_by']),
        sub: PaymentUi.dateTime(r['createdAt']),
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          PaymentUi.refundStatusPill(status),
          if (status == 'failed' && error.isNotEmpty)
            PaymentCell(error, color: Theme.of(context).colorScheme.error),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final approver = PaymentUi.canApproveRefunds();
    return PaymentsListLayout(
      title: 'Refunds',
      description: approver
          ? 'Approve or reject cases you did not request yourself. Card refunds '
              'stay "Awaiting SkipCash" until SkipCash confirms; the credit note is '
              'issued then.'
          : 'Refund cases need a Super Admin other than the requester to approve '
              'them. You can request refunds from a paid job.',
      filterOptions: _filters,
      selectedFilter: _status,
      onFilter: (value) {
        setState(() => _status = value);
        _load(refresh: true);
      },
      columns: const [
        AdminTableColumn(label: 'Job', flex: 3),
        AdminTableColumn(label: 'Amount', flex: 2),
        AdminTableColumn(label: 'Reason', flex: 4),
        AdminTableColumn(label: 'Requested', flex: 3),
        AdminTableColumn(label: 'Status', flex: 3, badge: true),
      ],
      rows: _items.map(_row).toList(),
      loading: _loading,
      error: _error,
      onRefresh: () => _load(refresh: true),
      hasMore: _items.isNotEmpty && _items.length < _total,
      onLoadMore: _loadMore,
      onRowTap: (index) => _open(_items[index]),
      emptyMessage: 'No refund cases',
    );
  }
}
