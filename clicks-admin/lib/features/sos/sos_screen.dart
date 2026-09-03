import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class SosScreen extends StatelessWidget {
  const SosScreen({super.key, this.refreshTick = 0});

  final int refreshTick;

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
        AdminTableColumn(label: 'Customer', flex: 3),
        AdminTableColumn(label: 'Vehicle', flex: 2),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Action', flex: 2, align: TextAlign.end),
      ],
      rowBuilder: (item) => _sosRow(context, item),
    );
  }

  Future<void> _claimAndCreate(BuildContext context, Map<String, dynamic> item, String status) async {
    final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
    if (id.isEmpty) return;

    if (status == 'pending' || status == 'in_call') {
      final res = await DioHelper.postData(url: '${EndPoints.sos}/$id/claim');
      if (!context.mounted) return;
      if (res.statusCode != 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(DioHelper.errorMessage(res) ?? 'Claim failed')),
        );
        return;
      }
    }

    if (!context.mounted) return;
    final payload = Map<String, dynamic>.from(item);
    payload['sos_id'] = id;
    Navigator.of(context).pushNamed(Routes.jobNew, arguments: payload);
  }

  List<Widget> _sosRow(BuildContext context, Map<String, dynamic> item) {
    final status = item['status']?.toString() ?? 'pending';
    final customer = item['customer'];
    var name = 'Customer';
    if (customer is Map) {
      name = '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim();
      if (name.isEmpty) name = customer['phone']?.toString() ?? name;
    }
    final vehicle = item['vehicle'];
    var vehicleLabel = '—';
    if (vehicle is Map) {
      vehicleLabel =
          '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim();
      if (vehicleLabel.isEmpty) vehicleLabel = '—';
    }

    return [
      Text(name, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
      Text(vehicleLabel, style: AdminTypography.body),
      StatusPill(label: status.replaceAll('_', ' '), status: status),
      Align(
        alignment: Alignment.centerRight,
        child: status == 'cancelled' || status == 'expired'
            ? Text(item['cancel_reason']?.toString() ?? '—', style: AdminTypography.caption)
            : TextButton(
                onPressed: () => _claimAndCreate(context, item, status),
                child: const Text('Create job'),
              ),
      ),
    ];
  }
}
