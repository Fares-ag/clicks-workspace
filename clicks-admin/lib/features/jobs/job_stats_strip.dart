import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/auth/admin_roles.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class JobStatsStrip extends StatefulWidget {
  const JobStatsStrip({
    super.key,
    required this.activeStatus,
    required this.onStatusTap,
  });

  final String activeStatus;
  final ValueChanged<String> onStatusTap;

  @override
  State<JobStatsStrip> createState() => _JobStatsStripState();
}

class _JobStatsStripState extends State<JobStatsStrip> {
  Map<String, dynamic> _summary = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.dashboardSummary);
      if (res.statusCode == 200 && res.data is Map && mounted) {
        setState(() => _summary = Map<String, dynamic>.from(res.data as Map));
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final jobs = _summary['jobs'] is Map
        ? Map<String, dynamic>.from(_summary['jobs'] as Map)
        : _summary;
    final earnings = _summary['earnings'] is Map
        ? Map<String, dynamic>.from(_summary['earnings'] as Map)
        : <String, dynamic>{};
    final showRevenue = AdminRoles.isFullAdmin(
      CacheHelper.getUserProfileSync()?['role']?.toString(),
    );

    void toggle(String key) {
      widget.onStatusTap(widget.activeStatus == key ? '' : key);
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _chip('Pending', '${jobs['pending'] ?? 0}', 'pending', toggle),
          _chip('Ongoing', '${jobs['ongoing'] ?? jobs['activeJobs'] ?? 0}', '', toggle),
          _chip('On hold', '${jobs['onHold'] ?? 0}', 'on_hold', toggle),
          _chip('Done today', '${jobs['completedToday'] ?? 0}', 'completed', toggle),
          _chip('Cancelled', '${jobs['cancelled'] ?? 0}', 'cancelled', toggle),
          if (showRevenue)
            _chip('Revenue', '${earnings['today'] ?? _summary['todayRevenue'] ?? 0} QAR', '', null),
        ],
      ),
    );
  }

  Widget _chip(String label, String value, String status, void Function(String)? onTap) {
    final active = status.isNotEmpty && widget.activeStatus == status;
    return Padding(
      padding: const EdgeInsets.only(right: AppSpacing.sm),
      child: ActionChip(
        label: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: AdminTypography.caption),
            Text(value, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
        backgroundColor: active ? AppColors.navHighlight : AppColors.surface,
        onPressed: onTap == null || status.isEmpty ? null : () => onTap(status),
      ),
    );
  }
}
