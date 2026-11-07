import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/primary_button.dart';
import '../../core/theme/app_spacing.dart';

class MembershipPlanFormScreen extends StatefulWidget {
  const MembershipPlanFormScreen({super.key, this.planId});

  final String? planId;

  @override
  State<MembershipPlanFormScreen> createState() =>
      _MembershipPlanFormScreenState();
}

class _MembershipPlanFormScreenState extends State<MembershipPlanFormScreen> {
  final _code = TextEditingController();
  final _nameEn = TextEditingController();
  final _nameAr = TextEditingController();
  final _discount = TextEditingController(text: '10');
  final _monthlyPrice = TextEditingController();
  final _yearlyPrice = TextEditingController();
  final _monthlyIncluded = TextEditingController();
  final _yearlyIncluded = TextEditingController();
  bool _active = true;
  bool _saving = false;
  bool get _isEdit => widget.planId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _load();
    }
  }

  String _encodeIncluded(dynamic raw) {
    if (raw is! List) return '';
    return raw
        .whereType<Map>()
        .map((row) {
          final quota = row['quota'] ?? 0;
          final bucket = row['bucket'] ?? '';
          final types = (row['serviceTypes'] is List)
              ? (row['serviceTypes'] as List).join(',')
              : '';
          return '$quota|$bucket|$types';
        })
        .join('\n');
  }

  List<Map<String, dynamic>> _decodeIncluded(String raw) {
    return raw
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .map((line) {
          final parts = line.split('|');
          return {
            'quota': int.tryParse(parts.isNotEmpty ? parts[0].trim() : '') ?? 0,
            'bucket': parts.length > 1 ? parts[1].trim() : '',
            'serviceTypes': parts.length > 2
                ? parts[2].split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList()
                : <String>[],
          };
        })
        .toList();
  }

  Map<String, dynamic>? _interval(List intervals, String name) {
    for (final row in intervals) {
      if (row is Map && row['interval']?.toString() == name) {
        return Map<String, dynamic>.from(row);
      }
    }
    return null;
  }

  Future<void> _load() async {
    final res = await DioHelper.getData(
      url: '${EndPoints.subscriptionPlans}/${widget.planId}',
    );
    if (res.statusCode != 200 || res.data is! Map || !mounted) return;
    final data = res.data as Map;
    final plan = Map<String, dynamic>.from((data['plan'] ?? data) as Map);
    _code.text = plan['code']?.toString() ?? '';
    _nameEn.text = plan['name_en']?.toString() ?? '';
    _nameAr.text = plan['name_ar']?.toString() ?? '';
    _discount.text = plan['discountPercent']?.toString() ?? '0';
    _active = plan['active'] != false;
    final intervals = plan['intervals'] is List ? plan['intervals'] as List : [];
    final month = _interval(intervals, 'month');
    final year = _interval(intervals, 'year');
    _monthlyPrice.text = month?['priceQar']?.toString() ?? '';
    _yearlyPrice.text = year?['priceQar']?.toString() ?? '';
    _monthlyIncluded.text = _encodeIncluded(month?['included']);
    _yearlyIncluded.text = _encodeIncluded(year?['included']);
    setState(() {});
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final body = {
      'code': _code.text.trim().toLowerCase(),
      'name_en': _nameEn.text.trim(),
      'name_ar': _nameAr.text.trim(),
      'discountPercent': num.tryParse(_discount.text.trim()) ?? 0,
      'active': _active,
      'intervals': [
        {
          'interval': 'month',
          'durationMonths': 1,
          'priceQar': num.tryParse(_monthlyPrice.text.trim()) ?? 0,
          'included': _decodeIncluded(_monthlyIncluded.text),
        },
        {
          'interval': 'year',
          'durationMonths': 12,
          'priceQar': num.tryParse(_yearlyPrice.text.trim()) ?? 0,
          'included': _decodeIncluded(_yearlyIncluded.text),
        },
      ],
    };
    final res = _isEdit
        ? await DioHelper.patchData(
            url: '${EndPoints.subscriptionPlans}/${widget.planId}',
            data: body,
          )
        : await DioHelper.postData(url: EndPoints.subscriptionPlans, data: body);
    if (!mounted) return;
    setState(() => _saving = false);
    if (res.statusCode == 200 || res.statusCode == 201) {
      Navigator.pop(context, true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(DioHelper.errorMessage(res) ?? 'Save failed')),
      );
    }
  }

  @override
  void dispose() {
    _code.dispose();
    _nameEn.dispose();
    _nameAr.dispose();
    _discount.dispose();
    _monthlyPrice.dispose();
    _yearlyPrice.dispose();
    _monthlyIncluded.dispose();
    _yearlyIncluded.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AdminPageContent(
      children: [
        Text(_isEdit ? 'Edit membership plan' : 'New membership plan'),
        TextField(
          controller: _code,
          enabled: !_isEdit,
          decoration: const InputDecoration(labelText: 'Code (basic / plus)'),
        ),
        TextField(
          controller: _nameEn,
          decoration: const InputDecoration(labelText: 'Name (EN)'),
        ),
        TextField(
          controller: _nameAr,
          decoration: const InputDecoration(labelText: 'Name (AR)'),
        ),
        TextField(
          controller: _discount,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Discount % on other services'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Active'),
          value: _active,
          onChanged: (v) => setState(() => _active = v),
        ),
        TextField(
          controller: _monthlyPrice,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Monthly price (QAR)'),
        ),
        TextField(
          controller: _yearlyPrice,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Yearly price (QAR)'),
        ),
        TextField(
          controller: _monthlyIncluded,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Monthly included (quota|bucket|type,type)',
          ),
        ),
        TextField(
          controller: _yearlyIncluded,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Yearly included (quota|bucket|type,type)',
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PrimaryButton(label: 'Save', loading: _saving, onPressed: _save),
      ],
    );
  }
}
