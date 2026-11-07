import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/auth/admin_roles.dart';
import '../../core/components/admin_empty_state.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_metric_card.dart';
import '../../core/components/primary_button.dart';
import '../../core/components/status_pill.dart';
import '../../core/constants/job_status_labels.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/helper/dashboard_summary.dart';
import '../../core/helper/job_origin.dart';
import '../../core/helper/list_row_helpers.dart';
import '../../core/helper/qatar_date.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_decorations.dart';
import '../../core/theme/app_spacing.dart';
import 'dashboard_charts.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;
  Timer? _poll;
  String _pickedDate = QatarDate.toLocalDateString(DateTime.now());
  double _earningsByDate = 0;
  List<DashboardTechPerf> _rankings = [];

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 45), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final role = CacheHelper.getUserProfileSync()?['role']?.toString();
      final fullAdmin = AdminRoles.isFullAdmin(role);
      final summaryRes = await DioHelper.getData(url: EndPoints.dashboardSummary);
      if (!mounted) return;
      if (summaryRes.statusCode == 200 && summaryRes.data is Map) {
        _summary = Map<String, dynamic>.from(summaryRes.data as Map);
        _error = null;
      } else if (!silent) {
        _error = DioHelper.errorMessage(summaryRes) ?? 'Failed to load dashboard';
      }
      if (fullAdmin) {
        final extra = await Future.wait([
          DioHelper.getData(url: '${EndPoints.dashboardEarningsByDate}?date=$_pickedDate'),
          DioHelper.getData(url: EndPoints.dashboardTechnicianPerformance),
        ]);
        if (!mounted) return;
        final byDate = extra[0].data;
        if (byDate is Map) {
          _earningsByDate = asDouble(byDate['totalEarnings'] ?? byDate['earnings']);
        }
        _rankings = parseTechnicianPerformance(extra[1].data);
      }
      _loading = false;
      setState(() {});
    } catch (_) {
      if (!mounted) return;
      setState(() {
        if (!silent) _error = 'Failed to load dashboard';
        _loading = false;
      });
    }
  }

  String _dateButtonLabel() {
    final today = QatarDate.toLocalDateString(DateTime.now());
    final yesterday = QatarDate.toLocalDateString(DateTime.now().subtract(const Duration(days: 1)));
    if (_pickedDate == today) return 'Today';
    if (_pickedDate == yesterday) return 'Yesterday';
    final parsed = QatarDate.parseLocalDate(_pickedDate);
    if (parsed == null) return _pickedDate;
    return DateFormat('MMM d').format(parsed);
  }

  String? _trendLabel(num? pct, {String prefix = ''}) {
    if (pct == null) return null;
    final sign = pct >= 0 ? '+' : '';
    return '$prefix$sign${pct.toStringAsFixed(0)}% vs yesterday';
  }

  Future<void> _pickEarningsDate() async {
    final date = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDate: QatarDate.parseLocalDate(_pickedDate) ?? DateTime.now(),
    );
    if (date == null) return;
    setState(() => _pickedDate = QatarDate.toLocalDateString(date));
    await _load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _summary == null) {
      return const AdminLoadingState(message: 'Loading dashboard…');
    }
    if (_error != null && _summary == null) {
      return AdminEmptyState(
        message: _error!,
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }

    final snap = DashboardSnapshot(_summary ?? {});
    final money = NumberFormat('#,##0', 'en_US');
    final width = MediaQuery.sizeOf(context).width;
    final pad = width < 720 ? 16.0 : 24.0;
    final role = CacheHelper.getUserProfileSync()?['role']?.toString();
    final showRevenue = AdminRoles.isFullAdmin(role);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.fromLTRB(pad, 12, pad, 32),
        children: [
          Text('Dashboard', style: AdminTypography.pageTitle),
          const SizedBox(height: 2),
          Text(
            'Live ops snapshot · auto-refreshes every 45s',
            style: AdminTypography.caption.copyWith(fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: AppSpacing.md),
          _OpsStrip(snap: snap),
          const SizedBox(height: AppSpacing.md),
          _metricGrid(context, snap, showRevenue, money),
          if (showRevenue) ...[
            const SizedBox(height: 12),
            _EarningsCard(
              allTime: snap.totalEarnings,
              overall: _earningsByDate,
              asOf: snap.statsComputedAt,
              trend: _trendLabel(snap.earningsTrend, prefix: 'Today '),
              trendUp: (snap.earningsTrend ?? 0) >= 0,
              dateLabel: _dateButtonLabel(),
              onPickDate: _pickEarningsDate,
              money: money,
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          DashboardCharts(isFullAdmin: showRevenue),
          const SizedBox(height: 12),
          DashboardJobStatusPie(
            completed: snap.completedJobs,
            pending: snap.pendingJobs,
            ongoing: snap.ongoingJobs,
            onHold: snap.onHoldJobs,
            cancelled: snap.cancelledJobs,
          ),
          const SizedBox(height: 12),
          DashboardSourcesCard(title: 'Job Sources', rows: snap.topSources),
          const SizedBox(height: 12),
          DashboardSourcesCard(title: 'Job Sub-Sources', rows: snap.subSources),
          const SizedBox(height: 12),
          _QueueCard(
            title: 'Pending Jobs · ${snap.pendingJobs}',
            action: 'View all',
            onAction: () => Navigator.of(context).pushNamed(Routes.jobs),
            empty: 'No pending jobs',
            children: [
              for (final job in snap.pendingList) _PendingJobTile(job: job),
            ],
          ),
          const SizedBox(height: 12),
          _QueueCard(
            title: 'Waiting SOS · ${snap.sosOpen}',
            action: 'Open inbox',
            onAction: () => Navigator.of(context).pushNamed(Routes.sos),
            empty: 'No open SOS',
            children: [
              for (final sos in snap.sosWaitingList) _SosTile(sos: sos),
            ],
          ),
          const SizedBox(height: 12),
          DashboardTechRankings(rows: _rankings),
        ],
      ),
    );
  }

  Widget _metricGrid(
    BuildContext context,
    DashboardSnapshot snap,
    bool showRevenue,
    NumberFormat money,
  ) {
    final metrics = [
      AdminMetricCard(
        label: 'Submitted Jobs',
        value: '${snap.submittedJobs}',
        icon: Icons.assignment_outlined,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      AdminMetricCard(
        label: 'Completed Jobs',
        value: '${snap.completedJobs}',
        icon: Icons.check_circle_outline,
        trend: _trendLabel(snap.completedTrend),
        trendUp: (snap.completedTrend ?? 0) >= 0,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      AdminMetricCard(
        label: 'On Going Jobs',
        value: '${snap.ongoingJobs}',
        icon: Icons.timelapse,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      AdminMetricCard(
        label: 'On Hold Jobs',
        value: '${snap.onHoldJobs}',
        icon: Icons.pause_circle_outline,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      AdminMetricCard(
        label: 'Pending Jobs',
        value: '${snap.pendingJobs}',
        icon: Icons.pending_outlined,
        warning: snap.pendingJobs > 0,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      AdminMetricCard(
        label: 'Active Technicians',
        value: '${snap.techsActive}',
        icon: Icons.engineering_outlined,
        onTap: () => Navigator.of(context).pushNamed(Routes.technicians),
      ),
      AdminMetricCard(
        label: 'Total Vehicles',
        value: '${snap.vehicles}',
        icon: Icons.directions_car_outlined,
        onTap: () => Navigator.of(context).pushNamed(Routes.vehicles),
      ),
      AdminMetricCard(
        label: 'Total Clients',
        value: '${snap.clients}',
        icon: Icons.people_outline,
        onTap: () => Navigator.of(context).pushNamed(Routes.clients),
      ),
      AdminMetricCard(
        label: 'Insured Vehicles',
        value: '${snap.insuredVehicles}',
        icon: Icons.verified_user_outlined,
        onTap: () => Navigator.of(context).pushNamed(Routes.vehicles),
      ),
      if (showRevenue)
        AdminMetricCard(
          label: "Today's Earnings",
          value: '${money.format(asInt(snap.earnings['today']))} QAR',
          icon: Icons.payments_outlined,
          accent: true,
          trend: _trendLabel(snap.earningsTrend),
          trendUp: (snap.earningsTrend ?? 0) >= 0,
        ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900 ? 3 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: columns == 2 ? 1.08 : 1.35,
          ),
          itemCount: metrics.length,
          itemBuilder: (_, i) => metrics[i],
        );
      },
    );
  }
}

class _OpsStrip extends StatelessWidget {
  const _OpsStrip({required this.snap});
  final DashboardSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final chips = [
      _OpsChip(
        label: 'Open SOS',
        value: snap.sosOpen,
        alert: snap.sosOpen > 0,
        onTap: () => Navigator.of(context).pushNamed(Routes.sos),
      ),
      _OpsChip(
        label: 'Pending Jobs',
        value: snap.pendingJobs,
        warn: snap.pendingJobs > 0,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
      _OpsChip(
        label: 'Techs Online',
        value: snap.techsOnline,
        onTap: () => Navigator.of(context).pushNamed(Routes.liveMap),
      ),
      _OpsChip(
        label: 'On Job',
        value: snap.techsOnJob,
        onTap: () => Navigator.of(context).pushNamed(Routes.liveMap),
      ),
      _OpsChip(
        label: JobStatusLabels.labelFor('en_route'),
        value: snap.enRouteJobs,
        onTap: () => Navigator.of(context).pushNamed(Routes.jobs),
      ),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < chips.length; i++) ...[
            if (i > 0) const SizedBox(width: 8),
            chips[i],
          ],
        ],
      ),
    );
  }
}

class _OpsChip extends StatelessWidget {
  const _OpsChip({
    required this.label,
    required this.value,
    required this.onTap,
    this.alert = false,
    this.warn = false,
  });

  final String label;
  final int value;
  final VoidCallback onTap;
  final bool alert;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final bg = alert
        ? const Color(0xFFFEF3F2)
        : warn
            ? const Color(0xFFFFFAEB)
            : AppColors.surface;
    final border = alert
        ? const Color(0xFFF97066)
        : warn
            ? const Color(0xFFF79009)
            : AppColors.border;
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Container(
          width: 118,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.lg),
            border: Border.all(color: border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AdminTypography.caption.copyWith(fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text('$value', style: AdminTypography.pageTitle.copyWith(fontSize: 22)),
            ],
          ),
        ),
      ),
    );
  }
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({
    required this.allTime,
    required this.overall,
    required this.dateLabel,
    required this.onPickDate,
    required this.money,
    this.asOf,
    this.trend,
    this.trendUp = true,
  });

  final double allTime;
  final double overall;
  final String dateLabel;
  final VoidCallback onPickDate;
  final NumberFormat money;
  final String? asOf;
  final String? trend;
  final bool trendUp;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        gradient: AppColors.earningsGradient,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        boxShadow: AppShadows.card,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total Earnings', style: AdminTypography.caption.copyWith(color: Colors.white70)),
          if (asOf != null && asOf!.isNotEmpty)
            Text(
              'As of ${formatWhen(asOf)}',
              style: AdminTypography.caption.copyWith(color: Colors.white54, fontSize: 11),
            ),
          const SizedBox(height: 4),
          Text(
            '${money.format(allTime)} QAR',
            style: AdminTypography.pageTitle.copyWith(color: Colors.white, fontSize: 28),
          ),
          if (trend != null)
            Text(
              trend!,
              style: AdminTypography.caption.copyWith(
                color: trendUp ? const Color(0xFFA6F4C5) : const Color(0xFFFECDCA),
                fontWeight: FontWeight.w600,
              ),
            ),
          const SizedBox(height: 16),
          Text('Overall Earnings · $dateLabel', style: AdminTypography.caption.copyWith(color: Colors.white70)),
          const SizedBox(height: 2),
          Text(
            '${money.format(overall)} QAR',
            style: AdminTypography.heading.copyWith(color: Colors.white, fontSize: 20),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: onPickDate,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white54),
            ),
            icon: const Icon(Icons.calendar_today_outlined, size: 16),
            label: Text(dateLabel),
          ),
        ],
      ),
    );
  }
}

class _QueueCard extends StatelessWidget {
  const _QueueCard({
    required this.title,
    required this.action,
    required this.onAction,
    required this.empty,
    required this.children,
  });

  final String title;
  final String action;
  final VoidCallback onAction;
  final String empty;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: AppDecorations.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: AdminTypography.heading)),
              TextButton(onPressed: onAction, child: Text(action)),
            ],
          ),
          if (children.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(empty, style: AdminTypography.caption),
            )
          else
            ...children,
        ],
      ),
    );
  }
}

class _PendingJobTile extends StatelessWidget {
  const _PendingJobTile({required this.job});
  final Map<String, dynamic> job;

  @override
  Widget build(BuildContext context) {
    final id = entityId(job);
    final title = job['issue']?.toString().trim().isNotEmpty == true
        ? job['issue'].toString()
        : (job['jobType']?.toString() ?? 'New job request');
    final client = [
      job['clientName'],
      job['clientMobileNumber'],
    ].where((e) => e != null && e.toString().isNotEmpty).join(', ');

    return InkWell(
      onTap: id == null ? null : () => Navigator.of(context).pushNamed(Routes.jobDetailPath(id)),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 72,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(formatWhen(job['dateTime'], pattern: 'EEE d MMM'), style: AdminTypography.caption),
                  Text(formatWhen(job['dateTime'], pattern: 'HH:mm'), style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
                  if (client.isNotEmpty) SecondaryLine(client),
                  if (isBusinessPortalJob(job) || isTechnicianCreatedJob(job))
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(
                        spacing: 4,
                        children: [
                          if (isBusinessPortalJob(job))
                            OriginChip(
                              label: job['businessName']?.toString().trim().isNotEmpty == true
                                  ? job['businessName'].toString()
                                  : 'Business',
                              tone: OriginChipTone.business,
                            ),
                          if (isTechnicianCreatedJob(job))
                            const OriginChip(label: 'Technician', tone: OriginChipTone.technician),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.muted),
          ],
        ),
      ),
    );
  }
}

class _SosTile extends StatelessWidget {
  const _SosTile({required this.sos});
  final Map<String, dynamic> sos;

  @override
  Widget build(BuildContext context) {
    final status = sos['status']?.toString() ?? 'pending';
    final client = [
      sos['customerName'],
      sos['customerPhone'],
    ].where((e) => e != null && e.toString().isNotEmpty).join(', ');
    return InkWell(
      onTap: () => Navigator.of(context).pushNamed(Routes.sos),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            SizedBox(
              width: 72,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(formatWhen(sos['createdAt'], pattern: 'EEE d MMM'), style: AdminTypography.caption),
                  Text(formatWhen(sos['createdAt'], pattern: 'HH:mm'), style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status == 'in_call' ? 'In call' : 'Waiting for claim',
                    style: AdminTypography.body.copyWith(fontWeight: FontWeight.w600),
                  ),
                  if (client.isNotEmpty) SecondaryLine(client),
                ],
              ),
            ),
            StatusPill(label: status.replaceAll('_', ' '), status: status),
          ],
        ),
      ),
    );
  }
}
