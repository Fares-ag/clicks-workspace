import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class TechniciansScreen extends StatelessWidget {
  const TechniciansScreen({super.key, this.refreshTick = 0});
  final int refreshTick;

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'Technicians',
      endpoint: EndPoints.technicians,
      refreshTick: tick,
      emptyMessage: 'No technicians found',
      searchHint: 'Search technicians',
      filterKey: 'applicationStatus',
      filterOptions: const [
        FilterChipOption(label: 'All', value: ''),
        FilterChipOption(label: 'Approved', value: 'Approved'),
        FilterChipOption(label: 'Pending', value: 'Pending'),
        FilterChipOption(label: 'Rejected', value: 'Rejected'),
      ],
      columns: const [
        AdminTableColumn(label: 'Name', flex: 3),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Application', flex: 2),
        AdminTableColumn(label: 'Expertise', flex: 3),
      ],
      onRowTap: (item) {
        final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
        if (id.isNotEmpty) {
          Navigator.of(context).pushNamed(Routes.technicianDetailPath(id));
        }
      },
      rowBuilder: (item) {
        final name =
            '${item['firstName'] ?? ''} ${item['lastName'] ?? ''}'.trim();
        final status = item['currentStatus']?.toString() ?? '';
        final appStatus = item['applicationStatus']?.toString() ?? '';
        final expertise = (item['expertise'] as List?)?.join(', ') ?? '';
        return [
          Text(
            name.isEmpty ? 'Technician' : name,
            style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600),
          ),
          StatusPill(label: status, status: status),
          Text(appStatus, style: AdminTypography.body),
          Text(expertise, style: AdminTypography.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
        ];
      },
    );
  }
}
