import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/constants/job_status_labels.dart';
import '../../core/constants/job_types.dart';
import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../main/admin_shell.dart';

class JobsScreen extends StatelessWidget {
  const JobsScreen({super.key, this.refreshTick = 0});
  final int refreshTick;

  @override
  Widget build(BuildContext context) {
    final tick = refreshTick > 0 ? refreshTick : adminShellRefreshTick(context);
    return AdminListScreen(
      title: 'Jobs',
      endpoint: EndPoints.jobs,
      refreshTick: tick,
      emptyMessage: 'No jobs found',
      searchHint: 'Search jobs',
      filterKey: 'status',
      filterOptions: const [
        FilterChipOption(label: 'All', value: ''),
        FilterChipOption(label: 'Pending', value: 'pending'),
        FilterChipOption(label: 'Assigned', value: 'technician_assigned'),
        FilterChipOption(label: 'En route', value: 'enroute'),
        FilterChipOption(label: 'In progress', value: 'in_progress'),
        FilterChipOption(label: 'Completed', value: 'completed'),
        FilterChipOption(label: 'Cancelled', value: 'cancelled'),
      ],
      headerActions: [
        PrimaryButton(
          label: 'New job',
          compact: true,
          icon: const Icon(Icons.add, size: 18, color: Colors.white),
          onPressed: () => Navigator.of(context).pushNamed(Routes.jobNew),
        ),
      ],
      columns: const [
        AdminTableColumn(label: 'Client', flex: 3),
        AdminTableColumn(label: 'Job type', flex: 2),
        AdminTableColumn(label: 'Status', flex: 2),
        AdminTableColumn(label: 'Scheduled', flex: 2),
      ],
      onRowTap: (item) {
        final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
        if (id.isNotEmpty) {
          Navigator.of(context).pushNamed(Routes.jobDetailPath(id));
        }
      },
      rowBuilder: (item) {
        final name = item['clientName']?.toString() ?? 'Customer';
        final status = item['job_status']?.toString() ?? '';
        final jobType = jobTypeLabel(item['jobType']?.toString());
        DateTime? dt;
        final raw = item['dateTime'] ?? item['createdAt'];
        if (raw != null) dt = DateTime.tryParse(raw.toString());
        return [
          Text(name, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
          Text(jobType, style: AdminTypography.body),
          StatusPill(label: JobStatusLabels.labelFor(status), status: status),
          Text(
            dt != null ? DateFormat('dd MMM HH:mm').format(dt.toLocal()) : '—',
            style: AdminTypography.body,
          ),
        ];
      },
    );
  }
}
