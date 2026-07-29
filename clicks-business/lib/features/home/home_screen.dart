import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../core/helper/assets_manager.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';
import 'home_cubit.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => HomeCubit()..load()..startPolling(),
      child: const _HomeView(),
    );
  }
}

class _HomeView extends StatefulWidget {
  const _HomeView();

  @override
  State<_HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<_HomeView> {
  @override
  void dispose() {
    // Cubit closed by BlocProvider
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final businessName = CacheHelper.get('business_name') ?? 'Partner';
    final userName = CacheHelper.get('user_name') ?? '';
    final cutPercent = CacheHelper.get('cut_percent');
    final cutType = CacheHelper.get('cut_type') ?? 'revenue';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Row(
          children: [
            SvgPicture.asset(AssetsManager.clicksLogoSvg, height: 28),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    businessName,
                    style: GoogleFonts.dmSans(
                      fontWeight: FontWeight.w700,
                      color: AppColors.text,
                      fontSize: 16,
                    ),
                  ),
                  if (userName.isNotEmpty ||
                      (cutPercent != null && cutPercent.isNotEmpty))
                    Text(
                      [
                        if (userName.isNotEmpty) userName,
                        if (cutPercent != null && cutPercent.isNotEmpty)
                          '${cutType.isEmpty ? 'Revenue' : '${cutType[0].toUpperCase()}${cutType.substring(1)}'} cut $cutPercent%',
                      ].join(' · '),
                      style: GoogleFonts.dmSans(
                        fontSize: 12,
                        color: AppColors.muted,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Log out',
            onPressed: () async {
              await CacheHelper.clear();
              if (context.mounted) {
                Navigator.of(context).pushNamedAndRemoveUntil(
                  Routes.login,
                  (_) => false,
                );
              }
            },
            icon: const Icon(Icons.logout, color: AppColors.muted),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        onPressed: () async {
          final created = await Navigator.of(context).pushNamed(Routes.newJob);
          if (created == true && context.mounted) {
            context.read<HomeCubit>().load();
          }
        },
        icon: SvgPicture.asset(
          AssetsManager.rightArrowSvg,
          width: 18,
          height: 18,
          colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
        ),
        label: const Text('New Job'),
      ),
      body: BlocBuilder<HomeCubit, HomeState>(
        builder: (context, state) {
          final cubit = context.watch<HomeCubit>();
          if (state is HomeLoading && cubit.jobs.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state is HomeError && cubit.jobs.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(state.message),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => cubit.load(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => cubit.load(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: [
                _AnalyticsCard(cubit: cubit),
                const SizedBox(height: 20),
                Row(
                  children: [
                    _CountCard(
                      label: 'Open',
                      value: cubit.open,
                      color: AppColors.primary,
                      selected: cubit.bucket == JobBucket.open,
                      onTap: () => cubit.setBucket(
                        cubit.bucket == JobBucket.open
                            ? JobBucket.all
                            : JobBucket.open,
                      ),
                    ),
                    const SizedBox(width: 10),
                    _CountCard(
                      label: 'In progress',
                      value: cubit.inProgress,
                      color: AppColors.accent,
                      selected: cubit.bucket == JobBucket.inProgress,
                      onTap: () => cubit.setBucket(
                        cubit.bucket == JobBucket.inProgress
                            ? JobBucket.all
                            : JobBucket.inProgress,
                      ),
                    ),
                    const SizedBox(width: 10),
                    _CountCard(
                      label: 'Completed',
                      value: cubit.completed,
                      color: const Color(0xFF039855),
                      selected: cubit.bucket == JobBucket.completed,
                      onTap: () => cubit.setBucket(
                        cubit.bucket == JobBucket.completed
                            ? JobBucket.all
                            : JobBucket.completed,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  cubit.bucket == JobBucket.all
                      ? 'Recent jobs'
                      : cubit.bucket == JobBucket.open
                          ? 'Open jobs'
                          : cubit.bucket == JobBucket.inProgress
                              ? 'In progress'
                              : 'Completed jobs',
                  style: GoogleFonts.dmSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                if (cubit.jobs.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 40),
                    child: Text(
                      cubit.bucket == JobBucket.all
                          ? 'No jobs yet. Tap New Job to create one for a customer.'
                          : 'No jobs in this filter.',
                      style: GoogleFonts.dmSans(color: AppColors.muted),
                      textAlign: TextAlign.center,
                    ),
                  )
                else
                  ...cubit.jobs.map((job) => _JobTile(job: job)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AnalyticsCard extends StatelessWidget {
  const _AnalyticsCard({required this.cubit});
  final HomeCubit cubit;

  static const _periods = [
    ('today', 'Today'),
    ('week', 'Week'),
    ('month', 'Month'),
    ('all', 'All'),
  ];

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(symbol: '', decimalDigits: 0);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Analytics',
            style: GoogleFonts.dmSans(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: _periods.map((p) {
              final selected = cubit.analyticsPeriod == p.$1;
              return ChoiceChip(
                label: Text(p.$2),
                selected: selected,
                onSelected: (_) => cubit.setAnalyticsPeriod(p.$1),
                selectedColor: AppColors.primary.withValues(alpha: 0.15),
                labelStyle: GoogleFonts.dmSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: selected ? AppColors.primary : AppColors.text,
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          if (cubit.analyticsError != null) ...[
            Text(
              cubit.analyticsError!,
              style: GoogleFonts.dmSans(fontSize: 13, color: AppColors.primary),
            ),
            TextButton(
              onPressed: () => cubit.loadAnalytics(),
              child: Text(
                'Retry',
                style: GoogleFonts.dmSans(
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(height: 8),
          ],
          Text(
            '${money.format(cubit.estimatedEarnings)} QAR',
            style: GoogleFonts.dmSans(
              fontSize: 28,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          Text(
            'Estimated earnings (your cut)',
            style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _metric('Created', '${cubit.jobsCreated}'),
              _metric('Completed', '${cubit.jobsCompletedPeriod}'),
              _metric('Cancelled', '${cubit.jobsCancelled}'),
            ],
          ),
          if (cubit.byJobType.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'By job type (completed)',
              style: GoogleFonts.dmSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
              ),
            ),
            const SizedBox(height: 6),
            ...cubit.byJobType.entries.map((e) {
              final count = (e.value['count'] as num?)?.toInt() ?? 0;
              final earn =
                  (e.value['estimatedEarnings'] as num?)?.toDouble() ?? 0;
              return Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        e.key,
                        style: GoogleFonts.dmSans(fontWeight: FontWeight.w500),
                      ),
                    ),
                    Text(
                      '$count · ${money.format(earn)} QAR',
                      style: GoogleFonts.dmSans(
                        fontSize: 13,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _metric(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.dmSans(fontSize: 11, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class _CountCard extends StatelessWidget {
  const _CountCard({
    required this.label,
    required this.value,
    required this.color,
    required this.onTap,
    this.selected = false,
  });

  final String label;
  final int value;
  final Color color;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? color : Colors.transparent,
              width: 2,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$value',
                style: GoogleFonts.dmSans(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.job});

  final Map<String, dynamic> job;

  Color _statusColor(String status) {
    switch (status) {
      case 'completed':
        return const Color(0xFF039855);
      case 'cancelled':
        return AppColors.primary;
      case 'en_route':
      case 'arrived':
      case 'in_progress':
        return AppColors.accent;
      case 'assigned':
      case 'accepted':
        return const Color(0xFF1570EF);
      default:
        return const Color(0xFFF79009);
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = job['_id']?.toString() ?? '';
    final name = job['clientName']?.toString() ?? 'Customer';
    final status = job['job_status']?.toString() ?? '';
    final issue = job['issue']?.toString() ?? '';
    final plate = job['licensePlate']?.toString() ?? '';
    final jobType = job['jobType']?.toString() ?? '';
    DateTime? dt;
    final raw = job['dateTime'];
    if (raw != null) dt = DateTime.tryParse(raw.toString());
    final when = dt != null
        ? DateFormat('dd MMM · HH:mm').format(dt.toLocal())
        : '';

    final meta = [
      if (jobType.isNotEmpty) jobType,
      if (plate.isNotEmpty) plate,
      if (when.isNotEmpty) when,
    ].join(' · ');

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      color: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Row(
          children: [
            Expanded(
              child: Text(
                name,
                style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
              ),
            ),
            _StatusPill(status: status, color: _statusColor(status)),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (meta.isNotEmpty)
                Text(
                  meta,
                  style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
                ),
              if (issue.isNotEmpty)
                Text(
                  issue,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.dmSans(fontSize: 13, color: AppColors.text),
                ),
            ],
          ),
        ),
        onTap: () async {
          if (id.isEmpty) return;
          await Navigator.of(context).pushNamed(Routes.jobDetail, arguments: id);
          if (context.mounted) context.read<HomeCubit>().load(silent: true);
        },
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status, required this.color});
  final String status;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final label = status.replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: GoogleFonts.dmSans(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
