import 'package:flutter/material.dart';

import '../../core/api/end_points.dart';
import '../../core/components/admin_data_table.dart';
import '../../core/components/admin_list_screen.dart';
import '../../core/components/filter_chip_bar.dart';
import '../../core/components/status_pill.dart';
import '../../core/helper/list_row_helpers.dart';
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
        AdminTableColumn(label: 'Customer', flex: 3),
        AdminTableColumn(label: 'When', flex: 2),
        AdminTableColumn(label: 'Location', flex: 2),
        AdminTableColumn(label: 'Status', flex: 2, badge: true),
      ],
      onRowTap: (item) {
        final leadId = entityId(item['lead_id']) ?? entityId(item['lead']);
        if (leadId != null) {
          Navigator.of(context).pushNamed(Routes.leadDetailPath(leadId));
          return;
        }
        final jobId = entityId(item['job_id']) ?? entityId(item['job']);
        if (jobId != null) {
          Navigator.of(context).pushNamed(Routes.jobDetailPath(jobId));
          return;
        }
        final status = item['status']?.toString() ?? '';
        if (status == 'pending') {
          Navigator.of(context).pushNamed(Routes.leadNew, arguments: item);
        }
      },
      rowBuilder: (item) {
        final serviceType = item['service_type']?.toString() ?? item['jobType']?.toString() ?? 'Service';
        final status = item['status']?.toString() ?? '';
        final timing = item['timing']?.toString() ?? item['preferredTime']?.toString() ?? '';
        final customer = item['customer'];
        final customerId = entityId(item['customer_id']) ?? entityId(customer);
        final name = personName(
          customer,
          fallback: item['customerName']?.toString() ?? item['name']?.toString() ?? '—',
        );
        final phone = customer is Map
            ? (customer['phone'] ?? customer['phone_number'] ?? '').toString()
            : item['phone']?.toString() ?? '';
        final location = item['location']?.toString() ?? item['address']?.toString() ?? '';
        final leadId = entityId(item['lead_id']) ?? entityId(item['lead']);
        return [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(serviceType, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
              if (timing.isNotEmpty) SecondaryLine(timing),
              if (status == 'pending')
                TextButton(
                  onPressed: () => Navigator.of(context).pushNamed(Routes.leadNew, arguments: item),
                  child: const Text('Convert to lead'),
                ),
              if (leadId != null) EntityLink(label: 'Open lead', route: Routes.leadDetailPath(leadId)),
            ],
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              EntityLink(
                label: name,
                route: customerId == null ? null : Routes.clientDetailPath(customerId),
              ),
              if (phone.isNotEmpty) SecondaryLine(phone),
            ],
          ),
          Text(formatWhen(item['scheduledAt'] ?? item['createdAt'] ?? item['created_at']), style: AdminTypography.body),
          Text(location.isEmpty ? '—' : location, style: AdminTypography.body, maxLines: 2, overflow: TextOverflow.ellipsis),
          StatusPill(label: status.isEmpty ? '—' : status.replaceAll('_', ' '), status: status),
        ];
      },
    );
  }
}
