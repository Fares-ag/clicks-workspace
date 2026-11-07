import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/primary_button.dart';
import '../../core/components/status_pill.dart';
import '../../core/cubit/paginated_list_cubit.dart';
import '../../core/forms/form_fields.dart';
import '../../core/helper/list_row_helpers.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../main/admin_shell.dart';

class SosScreen extends StatelessWidget {
  const SosScreen({super.key, this.refreshTick = 0});

  final int refreshTick;

  static bool _canAct(String status) =>
      status == 'pending' || status == 'in_call';

  static String _vehicleLabel(dynamic vehicle) {
    if (vehicle is! Map) return '—';
    final parts = <String>[
      if (vehicle['year'] != null) vehicle['year'].toString(),
      if (vehicle['color'] != null) vehicle['color'].toString().trim(),
      if (vehicle['make'] != null) vehicle['make'].toString().trim(),
      if (vehicle['model'] != null) vehicle['model'].toString().trim(),
    ].where((p) => p.isNotEmpty);
    if (parts.isNotEmpty) return parts.join(' ');
    final fallback =
        '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim();
    return fallback.isEmpty ? '—' : fallback;
  }

  static String _formatWhen(dynamic value) {
    if (value == null) return '—';
    final dt = DateTime.tryParse(value.toString());
    if (dt == null) return '—';
    return DateFormat.yMd().add_jms().format(dt.toLocal());
  }

  static void _refreshList(BuildContext context) {
    try {
      context.read<PaginatedListCubit>().load(refresh: true);
    } catch (_) {}
  }

  static void _toast(BuildContext context, String message, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : null,
      ),
    );
  }

  Future<void> _claimAndCreate(
    BuildContext context,
    Map<String, dynamic> item,
    String status,
  ) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty) return;

    if (_canAct(status)) {
      final res = await DioHelper.postData(url: '${EndPoints.sos}/$id/claim');
      if (!context.mounted) return;
      if (res.statusCode != 200) {
        _toast(context, DioHelper.errorMessage(res) ?? 'Claim failed', error: true);
        return;
      }
    }

    if (!context.mounted) return;
    final payload = Map<String, dynamic>.from(item);
    payload['sos_id'] = id;
    await Navigator.of(context).pushNamed(Routes.jobNew, arguments: payload);
    if (context.mounted) _refreshList(context);
  }

  Future<void> _scheduleSos(BuildContext context, Map<String, dynamic> item) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty) return;

    final serviceCtrl = TextEditingController(
      text: item['service_type']?.toString() ?? 'Roadside service',
    );
    DateTime? when = DateTime.now().add(const Duration(hours: 2));

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setLocal) {
            return AlertDialog(
              title: const Text('Schedule for later'),
              content: SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: serviceCtrl,
                      decoration: const InputDecoration(labelText: 'Service type'),
                    ),
                    const SizedBox(height: 12),
                    DateTimePickerField(
                      value: when,
                      onChanged: (dt) => setLocal(() => when = dt),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                FilledButton(
                  onPressed: when == null ? null : () => Navigator.pop(ctx, true),
                  child: const Text('Confirm booking'),
                ),
              ],
            );
          },
        );
      },
    );

    if (ok != true || when == null || !context.mounted) {
      serviceCtrl.dispose();
      return;
    }

    final res = await DioHelper.postData(
      url: '${EndPoints.sos}/$id/schedule',
      data: {
        'service_type': serviceCtrl.text.trim().isEmpty
            ? 'Roadside service'
            : serviceCtrl.text.trim(),
        'scheduled_for': when!.toUtc().toIso8601String(),
        if (item['customer_vehicle_id'] != null)
          'customer_vehicle_id': item['customer_vehicle_id'],
      },
    );
    serviceCtrl.dispose();
    if (!context.mounted) return;
    if (res.statusCode == 200) {
      _toast(context, 'SOS scheduled as booking');
      _refreshList(context);
    } else {
      _toast(context, DioHelper.errorMessage(res) ?? 'Schedule failed', error: true);
    }
  }

  Future<void> _closeNotAJob(BuildContext context, Map<String, dynamic> item) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty) return;

    final reasonCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Not a job'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Reason the customer will see',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Close request'),
          ),
        ],
      ),
    );

    if (ok != true || !context.mounted) {
      reasonCtrl.dispose();
      return;
    }

    final reason = reasonCtrl.text.trim();
    reasonCtrl.dispose();
    if (reason.isEmpty) {
      _toast(context, 'Enter a reason', error: true);
      return;
    }

    final res = await DioHelper.postData(
      url: '${EndPoints.sos}/$id/close',
      data: {'reason': reason},
    );
    if (!context.mounted) return;
    if (res.statusCode == 200) {
      _toast(context, 'SOS closed');
      _refreshList(context);
    } else {
      _toast(context, DioHelper.errorMessage(res) ?? 'Close failed', error: true);
    }
  }

  Widget _actionsCell(
    BuildContext context,
    Map<String, dynamic> item,
    String status,
  ) {
    if (!_canAct(status)) {
      return Align(
        alignment: Alignment.centerRight,
        child: Text(
          item['cancel_reason']?.toString() ?? '—',
          style: AdminTypography.caption,
          textAlign: TextAlign.end,
        ),
      );
    }

    return Align(
      alignment: Alignment.centerRight,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        reverse: true,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            PrimaryButton(
              label: 'Not a job',
              compact: true,
              outlined: true,
              onPressed: () => _closeNotAJob(context, item),
            ),
            const SizedBox(width: AppSpacing.sm),
            PrimaryButton(
              label: 'Schedule',
              compact: true,
              outlined: true,
              onPressed: () => _scheduleSos(context, item),
            ),
            const SizedBox(width: AppSpacing.sm),
            PrimaryButton(
              label: 'Create job',
              compact: true,
              onPressed: () => _claimAndCreate(context, item, status),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _sosRow(BuildContext context, Map<String, dynamic> item) {
    final status = item['status']?.toString() ?? 'pending';
    final customer = item['customer'];
    final name = personName(customer, fallback: 'Customer');

    return [
      Text(name, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
      Text(_vehicleLabel(item['vehicle']), style: AdminTypography.body),
      StatusPill(label: status.replaceAll('_', ' '), status: status),
      Text(
        status == 'cancelled'
            ? (item['cancel_reason']?.toString() ?? '—')
            : '—',
        style: AdminTypography.body,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      Text(
        _formatWhen(item['expires_at'] ?? item['updatedAt'] ?? item['createdAt']),
        style: AdminTypography.body,
      ),
      _actionsCell(context, item, status),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'SOS Inbox',
      endpoint: EndPoints.sos,
      refreshTick: tick,
      emptyMessage: 'No SOS requests',
      searchHint: 'Search SOS',
      filterKey: 'status',
      filterOptions: const [
        FilterChipOption(label: 'All', value: ''),
        FilterChipOption(label: 'Pending', value: 'pending'),
        FilterChipOption(label: 'In call', value: 'in_call'),
        FilterChipOption(label: 'Claimed', value: 'claimed'),
        FilterChipOption(label: 'Expired', value: 'expired'),
        FilterChipOption(label: 'Cancelled', value: 'cancelled'),
      ],
      columns: const [
        AdminTableColumn(label: 'Customer', flex: 2),
        AdminTableColumn(label: 'Vehicle', flex: 3),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Cancel reason', flex: 2),
        AdminTableColumn(label: 'Updated', flex: 2),
        AdminTableColumn(label: 'Actions', flex: 4, align: TextAlign.end),
      ],
      rowBuilder: (item) => _sosRow(context, item),
    );
  }
}
