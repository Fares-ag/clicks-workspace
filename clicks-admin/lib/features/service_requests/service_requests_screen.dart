import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class ServiceRequestsScreen extends StatelessWidget {
  const ServiceRequestsScreen({super.key, this.refreshTick = 0});

  final int refreshTick;

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'Service Requests',
      endpoint: EndPoints.serviceRequests,
      refreshTick: tick,
      emptyMessage: 'No service requests',
      searchHint: 'Search requests',
      filterKey: 'status',
      filterOptions: const [
        FilterChipOption(label: 'All', value: ''),
        FilterChipOption(label: 'Pending', value: 'pending'),
        FilterChipOption(label: 'Accepted', value: 'accepted'),
        FilterChipOption(label: 'Cancelled', value: 'cancelled'),
      ],
      columns: const [
        AdminTableColumn(label: 'Service', flex: 3),
        AdminTableColumn(label: 'Timing', flex: 2),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Customer', flex: 3),
      ],
      onRowTap: (item) {
        final status = item['status']?.toString() ?? '';
        if (status == 'pending') {
          Navigator.of(context).pushNamed(Routes.leadNew, arguments: item);
        }
      },
      rowBuilder: (item) {
        final serviceType = item['service_type']?.toString() ?? 'Service';
        final status = item['status']?.toString() ?? '';
        final timing = item['timing']?.toString() ?? '';
        final customer = item['customer'];
        var name = '—';
        if (customer is Map) {
          name = customer['name']?.toString() ??
              '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim();
        }
        return [
          Text(serviceType, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
          Text(timing, style: AdminTypography.body),
          StatusPill(label: status, status: status),
          Text(name, style: AdminTypography.body),
        ];
      },
    );
  }
}
