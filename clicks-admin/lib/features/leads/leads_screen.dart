import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class LeadsScreen extends StatelessWidget {
  const LeadsScreen({super.key, this.refreshTick = 0});
  final int refreshTick;

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'Leads',
      endpoint: EndPoints.leads,
      refreshTick: tick,
      emptyMessage: 'No leads',
      searchHint: 'Search leads',
      filterKey: 'open',
      initialFilter: '1',
      filterOptions: const [
        FilterChipOption(label: 'Open', value: '1'),
        FilterChipOption(label: 'All', value: ''),
      ],
      floatingAction: PrimaryButton(
        label: 'Add Lead',
        compact: true,
        icon: const Icon(Icons.add, size: 18, color: Colors.white),
        onPressed: () => Navigator.of(context).pushNamed(Routes.leadNew),
      ),
      columns: const [
        AdminTableColumn(label: 'Client', flex: 3),
        AdminTableColumn(label: 'Inquiry', flex: 3),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Phone', flex: 2),
      ],
      onRowTap: (item) {
        final id = item['_id']?.toString() ?? item['lead_id']?.toString() ?? '';
        if (id.isNotEmpty) {
          Navigator.of(context).pushNamed(Routes.leadDetailPath(id));
        }
      },
      rowBuilder: (item) {
        final name = item['clientName']?.toString() ?? 'Lead';
        final status = item['status']?.toString() ?? '';
        final inquiry = item['inquiry']?.toString() ?? '';
        final phone = item['clientMobileNumber']?.toString() ?? '';
        return [
          Text(name, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
          Text(inquiry, style: AdminTypography.body, maxLines: 1, overflow: TextOverflow.ellipsis),
          StatusPill(label: status, status: status),
          Text(phone, style: AdminTypography.body),
        ];
      },
    );
  }
}
