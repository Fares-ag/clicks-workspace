import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/status_pill.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class VehiclesScreen extends StatelessWidget {
  const VehiclesScreen({super.key, this.refreshTick = 0});
  final int refreshTick;

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'Vehicles',
      endpoint: EndPoints.vehicles,
      refreshTick: tick,
      emptyMessage: 'No vehicles',
      searchHint: 'Search vehicles',
      columns: const [
        AdminTableColumn(label: 'Plate', flex: 2),
        AdminTableColumn(label: 'Make / Model', flex: 3),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Technician', flex: 3),
      ],
      rowBuilder: (item) {
        final plate = item['plateNumber']?.toString() ?? '—';
        final make = item['make']?.toString() ?? '';
        final model = item['model']?.toString() ?? '';
        final active = item['isActive'] == true;
        final tech = item['assignedTechnician'];
        var techName = '—';
        if (tech is Map) {
          techName = '${tech['firstName'] ?? ''} ${tech['lastName'] ?? ''}'.trim();
        }
        return [
          Text(plate, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
          Text('$make $model'.trim(), style: AdminTypography.body),
          StatusPill(label: active ? 'Active' : 'Inactive', status: active ? 'active' : 'offline'),
          Text(techName.isEmpty ? '—' : techName, style: AdminTypography.body),
        ];
      },
    );
  }
}
