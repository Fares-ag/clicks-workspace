import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/primary_button.dart';
import '../../core/constants/job_status_labels.dart';
import '../../core/constants/job_types.dart';
import '../../core/helper/admin_time_picker.dart';
import '../../core/helper/qatar_date.dart';
import '../../core/theme/app_spacing.dart';
import 'job_filters.dart';

class JobFilterSheet extends StatefulWidget {
  const JobFilterSheet({super.key, required this.initial});
  final JobFilters initial;

  static Future<JobFilters?> show(BuildContext context, JobFilters initial) {
    return showModalBottomSheet<JobFilters>(
      context: context,
      isScrollControlled: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: JobFilterSheet(initial: initial),
      ),
    );
  }

  @override
  State<JobFilterSheet> createState() => _JobFilterSheetState();
}

class _JobFilterSheetState extends State<JobFilterSheet> {
  late JobFilters _filters;
  List<Map<String, dynamic>> _technicians = [];
  List<Map<String, dynamic>> _sources = [];

  static const _statusKeys = [
    '',
    'pending',
    'assigned',
    'accepted',
    'en_route',
    'arrived',
    'in_progress',
    'on_hold',
    'completed',
    'cancelled',
  ];

  @override
  void initState() {
    super.initState();
    _filters = widget.initial;
    _loadMeta();
  }

  Future<void> _loadMeta() async {
    try {
      final results = await Future.wait([
        DioHelper.getData(url: '${EndPoints.technicians}?limit=200'),
        DioHelper.getData(url: EndPoints.sources),
      ]);
      if (!mounted) return;
      setState(() {
        _technicians = _list(results[0].data, 'technicians');
        _sources = _list(results[1].data, 'sources');
      });
    } catch (_) {}
  }

  List<Map<String, dynamic>> _list(dynamic data, String key) {
    if (data is! Map) return [];
    final list = data[key];
    if (list is! List) return [];
    return list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }

  Future<void> _pickTime({required bool from}) async {
    final current = parseAdminTimeString(from ? _filters.timeFrom : _filters.timeTo);
    final time = await showAdminTimePicker(
      context,
      initialTime: current ?? const TimeOfDay(hour: 8, minute: 0),
      title: from ? 'From time' : 'To time',
    );
    if (time == null) return;
    final value = formatAdminTimeString(time);
    setState(() {
      _filters = from ? _filters.copyWith(timeFrom: value) : _filters.copyWith(timeTo: value);
    });
  }

  Future<void> _pickDate({required bool from}) async {
    final current = QatarDate.parseLocalDate(from ? _filters.dateFrom : _filters.dateTo);
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      initialDate: current ?? DateTime.now(),
    );
    if (date == null) return;
    final value = QatarDate.toLocalDateString(date);
    setState(() {
      _filters = from ? _filters.copyWith(dateFrom: value) : _filters.copyWith(dateTo: value);
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filter jobs', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: AppSpacing.md),
            DropdownButtonFormField<String>(
              value: _filters.status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: _statusKeys
                  .map((s) => DropdownMenuItem(
                        value: s,
                        child: Text(s.isEmpty ? 'Any status' : JobStatusLabels.labelFor(s)),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _filters = _filters.copyWith(status: v ?? '')),
            ),
            DropdownButtonFormField<String>(
              value: _filters.jobType,
              decoration: const InputDecoration(labelText: 'Job type'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any type')),
                ...kJobTypes.map((t) => DropdownMenuItem(value: t.value, child: Text(t.label))),
              ],
              onChanged: (v) => setState(() => _filters = _filters.copyWith(jobType: v ?? '')),
            ),
            DropdownButtonFormField<String>(
              value: _technicians.any((t) =>
                      '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim() ==
                      _filters.technician)
                  ? _filters.technician
                  : '',
              decoration: const InputDecoration(labelText: 'Technician'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any technician')),
                ..._technicians.map((t) {
                  final name = '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim();
                  return DropdownMenuItem(value: name, child: Text(name.isEmpty ? 'Technician' : name));
                }),
              ],
              onChanged: (v) => setState(() => _filters = _filters.copyWith(technician: v ?? '')),
            ),
            DropdownButtonFormField<String>(
              value: _sources.any((s) => s['_id']?.toString() == _filters.source)
                  ? _filters.source
                  : '',
              decoration: const InputDecoration(labelText: 'Source'),
              items: [
                const DropdownMenuItem(value: '', child: Text('Any source')),
                ..._sources.map((s) => DropdownMenuItem(
                      value: s['_id']?.toString() ?? '',
                      child: Text(s['mainSourceName']?.toString() ?? 'Source'),
                    )),
              ],
              onChanged: (v) => setState(() => _filters = _filters.copyWith(source: v ?? '')),
            ),
            DropdownButtonFormField<String>(
              value: _filters.jobOrigin,
              decoration: const InputDecoration(labelText: 'Origin'),
              items: JobFilters.originOptions
                  .map((o) => DropdownMenuItem(value: o.value, child: Text(o.label)))
                  .toList(),
              onChanged: (v) => setState(() => _filters = _filters.copyWith(jobOrigin: v ?? '')),
            ),
            DropdownButtonFormField<String>(
              value: _filters.paymentStatus,
              decoration: const InputDecoration(labelText: 'Payment'),
              items: JobFilters.paymentOptions
                  .map((o) => DropdownMenuItem(value: o.value, child: Text(o.label)))
                  .toList(),
              onChanged: (v) => setState(() => _filters = _filters.copyWith(paymentStatus: v ?? '')),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pickDate(from: true),
                    child: Text(_filters.dateFrom.isEmpty ? 'From date' : _filters.dateFrom),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pickDate(from: false),
                    child: Text(_filters.dateTo.isEmpty ? 'To date' : _filters.dateTo),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pickTime(from: true),
                    child: Text(_filters.timeFrom.isEmpty ? 'From time' : _filters.timeFrom),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pickTime(from: false),
                    child: Text(_filters.timeTo.isEmpty ? 'To time' : _filters.timeTo),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            PrimaryButton(
              label: 'Apply filters',
              onPressed: () => Navigator.pop(context, _filters),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, JobFilters.empty),
              child: const Text('Clear all'),
            ),
          ],
        ),
      ),
    );
  }
}
