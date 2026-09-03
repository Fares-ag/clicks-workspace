import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_empty_state.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_metric_card.dart';
import '../../core/components/primary_button.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: EndPoints.dashboardSummary);
      if (res.statusCode == 200 && res.data is Map) {
        setState(() {
          _summary = Map<String, dynamic>.from(res.data as Map);
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Failed to load dashboard';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load dashboard';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AdminLoadingState(message: 'Loading dashboard…');
    }
    if (_error != null) {
      return AdminEmptyState(
        message: _error!,
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }

    final s = _summary ?? {};
    final money = NumberFormat('#,##0', 'en_US');
    final width = MediaQuery.sizeOf(context).width;
    final columns = width >= 1100 ? 3 : (width >= 700 ? 2 : 1);

    final metrics = [
      AdminMetricCard(
        label: 'Open SOS',
        value: '${s['openSos'] ?? s['pendingSos'] ?? 0}',
        icon: Icons.emergency_outlined,
      ),
      AdminMetricCard(
        label: 'Open Leads',
        value: '${s['openLeads'] ?? 0}',
        icon: Icons.filter_alt_outlined,
      ),
      AdminMetricCard(
        label: 'Active Jobs',
        value: '${s['activeJobs'] ?? s['ongoingJobs'] ?? 0}',
        icon: Icons.work_outline,
      ),
      AdminMetricCard(
        label: 'Online Techs',
        value: '${s['onlineTechnicians'] ?? 0}',
        icon: Icons.engineering_outlined,
      ),
      AdminMetricCard(
        label: "Today's Jobs",
        value: '${s['todayJobs'] ?? 0}',
        icon: Icons.today_outlined,
      ),
      AdminMetricCard(
        label: "Today's Revenue",
        value: '${money.format(s['todayRevenue'] ?? s['todayEarnings'] ?? 0)} QAR',
        icon: Icons.payments_outlined,
        accent: true,
      ),
    ];

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Text(
            'Dashboard',
            style: AdminTypography.pageTitle,
          ),
          const SizedBox(height: 4),
          Text(
            'Operations overview',
            style: AdminTypography.caption.copyWith(
              color: AppColors.muted,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisSpacing: AppSpacing.md,
              crossAxisSpacing: AppSpacing.md,
              childAspectRatio: 1.55,
            ),
            itemCount: metrics.length,
            itemBuilder: (_, i) => metrics[i],
          ),
        ],
      ),
    );
  }
}
