import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';

/// Admin membership actions (all audited server-side):
/// grant / comp, extend, cancel (period end or immediate), refund request,
/// usage adjustment. Each returns true when the server accepted it.
class MembershipActions {
  MembershipActions._();

  static String _path(String id, String action) =>
      '${EndPoints.customerSubscriptions}/$id/$action';

  static Future<bool> _send(
    BuildContext context,
    Future<dynamic> Function() call,
    String success,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await call();
      final ok = res.statusCode == 200 || res.statusCode == 201;
      messenger.showSnackBar(
        SnackBar(content: Text(ok ? success : (DioHelper.errorMessage(res) ?? 'Request failed'))),
      );
      return ok;
    } catch (err) {
      messenger.showSnackBar(SnackBar(content: Text('Request failed: $err')));
      return false;
    }
  }

  /// Opens the action sheet for one membership row.
  static Future<bool> openFor(BuildContext context, Map<String, dynamic> item) async {
    final id = item['id']?.toString() ?? item['_id']?.toString() ?? '';
    if (id.isEmpty) return false;
    final status = item['status']?.toString() ?? '';
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('${item['planName'] ?? 'Membership'} · $status'),
              subtitle: Text(
                [
                  if (item['comp'] == true) 'Complimentary',
                  if (item['cancel_at_period_end'] == true) 'Ends at period end',
                  if ((item['endDate'] ?? '').toString().isNotEmpty) 'Until ${item['endDate']}',
                ].join(' · '),
              ),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.event_repeat),
              title: const Text('Extend end date'),
              onTap: () => Navigator.pop(ctx, 'extend'),
            ),
            ListTile(
              leading: const Icon(Icons.tune),
              title: const Text('Adjust usage'),
              onTap: () => Navigator.pop(ctx, 'usage'),
            ),
            ListTile(
              leading: const Icon(Icons.schedule),
              title: const Text('Cancel at period end'),
              onTap: () => Navigator.pop(ctx, 'cancel_period_end'),
            ),
            ListTile(
              leading: const Icon(Icons.cancel_outlined),
              title: const Text('Cancel immediately'),
              onTap: () => Navigator.pop(ctx, 'cancel_immediate'),
            ),
            ListTile(
              leading: const Icon(Icons.undo),
              title: const Text('Request refund'),
              subtitle: const Text('Needs approval by a different Super Admin / finance admin'),
              onTap: () => Navigator.pop(ctx, 'refund'),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !context.mounted) return false;
    switch (choice) {
      case 'extend':
        return _extend(context, id);
      case 'usage':
        return _usage(context, id, item);
      case 'cancel_period_end':
        return _cancel(context, id, immediate: false);
      case 'cancel_immediate':
        return _cancel(context, id, immediate: true);
      case 'refund':
        return _refund(context, id);
    }
    return false;
  }

  static Future<Map<String, String>?> _form(
    BuildContext context, {
    required String title,
    required List<_Field> fields,
    String confirm = 'Save',
  }) {
    final controllers = {for (final f in fields) f.key: TextEditingController(text: f.initial)};
    return showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final f in fields)
                TextField(
                  controller: controllers[f.key],
                  keyboardType: f.number ? TextInputType.number : TextInputType.text,
                  decoration: InputDecoration(labelText: f.label, helperText: f.helper),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
          FilledButton(
            onPressed: () => Navigator.pop(
              ctx,
              {for (final e in controllers.entries) e.key: e.value.text.trim()},
            ),
            child: Text(confirm),
          ),
        ],
      ),
    ).whenComplete(() {
      for (final c in controllers.values) {
        c.dispose();
      }
    });
  }

  static Future<bool> _extend(BuildContext context, String id) async {
    final values = await _form(context, title: 'Extend membership', fields: const [
      _Field('days', 'Days to add', number: true, initial: '30'),
      _Field('reason', 'Reason (required)'),
    ]);
    if (values == null || !context.mounted) return false;
    return _send(
      context,
      () => DioHelper.postData(
        url: _path(id, 'extend'),
        data: {'days': int.tryParse(values['days'] ?? ''), 'reason': values['reason']},
      ),
      'Membership extended',
    );
  }

  static Future<bool> _usage(BuildContext context, String id, Map<String, dynamic> item) async {
    final included = item['included'] is List ? item['included'] as List : const [];
    final firstBucket = included.whereType<Map>().map((row) {
      final bucket = row['bucket']?.toString() ?? '';
      if (bucket.isNotEmpty) return bucket;
      final types = row['serviceTypes'];
      return types is List && types.isNotEmpty ? types.first.toString() : '';
    }).firstWhere((b) => b.isNotEmpty, orElse: () => '');
    final values = await _form(context, title: 'Adjust usage', fields: [
      _Field('bucket', 'Bucket', initial: firstBucket, helper: 'e.g. wash, oil'),
      const _Field('used', 'Used visits (absolute)', number: true),
      const _Field('reason', 'Reason (required)'),
    ]);
    if (values == null || !context.mounted) return false;
    return _send(
      context,
      () => DioHelper.postData(
        url: _path(id, 'usage'),
        data: {
          'bucket': values['bucket'],
          'used': int.tryParse(values['used'] ?? ''),
          'reason': values['reason'],
        },
      ),
      'Usage updated',
    );
  }

  static Future<bool> _cancel(BuildContext context, String id, {required bool immediate}) async {
    final values = await _form(
      context,
      title: immediate ? 'Cancel immediately' : 'Cancel at period end',
      confirm: 'Cancel membership',
      fields: const [_Field('reason', 'Reason (required)')],
    );
    if (values == null || !context.mounted) return false;
    return _send(
      context,
      () => DioHelper.postData(
        url: _path(id, 'cancel'),
        data: {'mode': immediate ? 'immediate' : 'period_end', 'reason': values['reason']},
      ),
      immediate ? 'Membership cancelled' : 'Membership will end at period end',
    );
  }

  static Future<bool> _refund(BuildContext context, String id) async {
    final values = await _form(context, title: 'Request refund', confirm: 'Request', fields: const [
      _Field('amount', 'Amount (QAR) — empty = everything refundable', number: true),
      _Field('reason', 'Reason (required)'),
    ]);
    if (values == null || !context.mounted) return false;
    final amount = num.tryParse(values['amount'] ?? '');
    return _send(
      context,
      () => DioHelper.postData(
        url: _path(id, 'refund'),
        data: {'amount': amount, 'reason': values['reason']},
      ),
      'Refund requested — awaiting approval',
    );
  }

  /// Grant (comp) a membership with no payment.
  static Future<bool> grant(BuildContext context) async {
    final plansRes = await DioHelper.getData(url: EndPoints.subscriptionPlans);
    if (!context.mounted) return false;
    final plans = plansRes.statusCode == 200 && plansRes.data is Map && (plansRes.data as Map)['plans'] is List
        ? ((plansRes.data as Map)['plans'] as List).whereType<Map>().toList()
        : <Map>[];
    if (plans.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No membership plans to grant')),
      );
      return false;
    }
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => _GrantDialog(plans: plans),
    );
    if (result == null || !context.mounted) return false;
    return _send(
      context,
      () => DioHelper.postData(url: EndPoints.customerSubscriptions, data: result),
      'Membership granted',
    );
  }
}

class _Field {
  const _Field(this.key, this.label, {this.number = false, this.initial = '', this.helper});

  final String key;
  final String label;
  final bool number;
  final String initial;
  final String? helper;
}

class _GrantDialog extends StatefulWidget {
  const _GrantDialog({required this.plans});

  final List<Map> plans;

  @override
  State<_GrantDialog> createState() => _GrantDialogState();
}

class _GrantDialogState extends State<_GrantDialog> {
  final _vehicle = TextEditingController();
  final _months = TextEditingController();
  final _reason = TextEditingController();
  late String _planId;
  var _interval = 'month';

  @override
  void initState() {
    super.initState();
    _planId = (widget.plans.first['id'] ?? widget.plans.first['_id']).toString();
  }

  @override
  void dispose() {
    _vehicle.dispose();
    _months.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Grant membership (no payment)'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _vehicle,
              decoration: const InputDecoration(labelText: 'Customer vehicle ID'),
            ),
            DropdownButtonFormField<String>(
              initialValue: _planId,
              decoration: const InputDecoration(labelText: 'Plan'),
              items: [
                for (final plan in widget.plans)
                  DropdownMenuItem(
                    value: (plan['id'] ?? plan['_id']).toString(),
                    child: Text(plan['name_en']?.toString() ?? plan['code']?.toString() ?? 'Plan'),
                  ),
              ],
              onChanged: (v) => setState(() => _planId = v ?? _planId),
            ),
            DropdownButtonFormField<String>(
              initialValue: _interval,
              decoration: const InputDecoration(labelText: 'Interval'),
              items: const [
                DropdownMenuItem(value: 'month', child: Text('Monthly')),
                DropdownMenuItem(value: 'year', child: Text('Yearly')),
              ],
              onChanged: (v) => setState(() => _interval = v ?? _interval),
            ),
            TextField(
              controller: _months,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Months (empty = plan length)'),
            ),
            TextField(
              controller: _reason,
              decoration: const InputDecoration(labelText: 'Reason (required)'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close')),
        FilledButton(
          onPressed: () => Navigator.pop(context, {
            'customer_vehicle_id': _vehicle.text.trim(),
            'plan_id': _planId,
            'interval': _interval,
            if (int.tryParse(_months.text.trim()) != null) 'months': int.parse(_months.text.trim()),
            'reason': _reason.text.trim(),
          }),
          child: const Text('Grant'),
        ),
      ],
    );
  }
}
