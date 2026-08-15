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
      child: const _MainShell(),
    );
  }
}

class _MainShell extends StatefulWidget {
  const _MainShell();

  @override
  State<_MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<_MainShell> {
  int _tab = 0;

  Future<void> _openNewJob() async {
    final created = await Navigator.of(context).pushNamed(Routes.newJob);
    if (created == true && mounted) {
      context.read<HomeCubit>().load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final businessName = CacheHelper.get('business_name') ?? 'Business';
    final userName = CacheHelper.get('user_name') ?? '';

    return Scaffold(
      backgroundColor: AppColors.pageBackground,
      appBar: AppBar(
        title: Row(
          children: [
            SvgPicture.asset(AssetsManager.clicksLogoSvg, height: 24),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    userName.isNotEmpty ? userName : businessName,
                    style: GoogleFonts.dmSans(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  ),
                  if (userName.isNotEmpty && businessName != userName)
                    Text(
                      businessName,
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
            icon: const Icon(Icons.logout_outlined, color: AppColors.muted),
          ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: const [
          _DashboardTab(),
          _JobsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          if (i == 2) {
            _openNewJob();
            return;
          }
          setState(() => _tab = i);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.work_outline),
            selectedIcon: Icon(Icons.work),
            label: 'Jobs',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_circle_outline),
            selectedIcon: Icon(Icons.add_circle),
            label: 'New Job',
          ),
        ],
      ),
    );
  }
}

class _DashboardTab extends StatelessWidget {
  const _DashboardTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<HomeCubit, HomeState>(
      builder: (context, state) {
        final cubit = context.watch<HomeCubit>();
        if (state is HomeLoading && cubit.submitted == 0) {
          return const Center(child: CircularProgressIndicator());
        }
        if (state is HomeError && cubit.submitted == 0) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(state.message),
                TextButton(onPressed: () => cubit.load(), child: const Text('Retry')),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: () => cubit.load(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                'Dashboard',
                style: GoogleFonts.dmSans(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                'Your jobs & earnings',
                style: GoogleFonts.dmSans(fontSize: 14, color: AppColors.muted),
              ),
              const SizedBox(height: 16),
              _MetricsGrid(cubit: cubit),
              const SizedBox(height: 16),
              _EarningsCard(cubit: cubit),
              const SizedBox(height: 20),
              _SectionHeader(title: 'Pending Jobs · ${cubit.pending}'),
              const SizedBox(height: 8),
              if (cubit.pendingList.isEmpty)
                _EmptyCard(message: 'No pending jobs')
              else
                ...cubit.pendingList.map((job) => _PendingJobRow(job: job)),
            ],
          ),
        );
      },
    );
  }
}

class _JobsTab extends StatelessWidget {
  const _JobsTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<HomeCubit, HomeState>(
      builder: (context, state) {
        final cubit = context.watch<HomeCubit>();
        if (state is HomeLoading && cubit.jobs.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        return RefreshIndicator(
          onRefresh: () => cubit.load(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                'Job Management',
                style: GoogleFonts.dmSans(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Jobs',
                style: GoogleFonts.dmSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              if (cubit.jobs.isEmpty)
                _EmptyCard(message: 'No jobs yet. Tap New Job to create one.')
              else
                ...cubit.jobs.map((job) => _JobTile(job: job)),
            ],
          ),
        );
      },
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.45,
      children: [
        _MetricCard(
          label: 'Submitted Jobs',
          value: '${cubit.submitted}',
          icon: Icons.article_outlined,
          trend: cubit.completedTrendPct,
        ),
        _MetricCard(
          label: 'Completed Jobs',
          value: '${cubit.completed}',
          icon: Icons.check_circle_outline,
        ),
        _MetricCard(
          label: 'On Going Jobs',
          value: '${cubit.ongoing}',
          icon: Icons.timelapse_outlined,
        ),
        _MetricCard(
          label: 'Pending Jobs',
          value: '${cubit.pending}',
          icon: Icons.info_outline,
          warning: true,
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    this.trend,
    this.warning = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final double? trend;
  final bool warning;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: warning ? AppColors.warning : AppColors.border,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A101828),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22, color: AppColors.muted),
          const Spacer(),
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 24,
              fontWeight: FontWeight.w700,
            ),
          ),
          Text(
            label,
            style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
          ),
          if (trend != null) ...[
            const SizedBox(height: 4),
            Text(
              '${trend! >= 0 ? '+' : ''}${trend!.toStringAsFixed(1)}% vs yesterday',
              style: GoogleFonts.dmSans(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: trend! >= 0 ? AppColors.success : AppColors.danger,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EarningsCard extends StatelessWidget {
  const _EarningsCard({required this.cubit});
  final HomeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat('#,##0', 'en_US');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppColors.earningsGradient,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A101828),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Total Earnings',
            style: GoogleFonts.dmSans(
              fontSize: 16,
              color: Colors.white.withValues(alpha: 0.9),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${money.format(cubit.totalEarnings)} QAR',
            style: GoogleFonts.dmSans(
              fontSize: 32,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          if (cubit.earningsTrendPct != null) ...[
            const SizedBox(height: 6),
            Text(
              'Today ${cubit.earningsTrendPct! >= 0 ? '+' : ''}${cubit.earningsTrendPct!.toStringAsFixed(1)}% vs yesterday',
              style: GoogleFonts.dmSans(
                fontSize: 12,
                color: Colors.white.withValues(alpha: 0.85),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'Estimated earnings (your cut)',
            style: GoogleFonts.dmSans(
              fontSize: 12,
              color: Colors.white.withValues(alpha: 0.75),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w600),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: GoogleFonts.dmSans(color: AppColors.muted),
      ),
    );
  }
}

class _PendingJobRow extends StatelessWidget {
  const _PendingJobRow({required this.job});
  final Map<String, dynamic> job;

  @override
  Widget build(BuildContext context) {
    final id = job['_id']?.toString() ?? '';
    DateTime? dt;
    final raw = job['dateTime'];
    if (raw != null) dt = DateTime.tryParse(raw.toString());

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: id.isEmpty
            ? null
            : () async {
                await Navigator.of(context).pushNamed(
                  Routes.jobDetail,
                  arguments: id,
                );
                if (context.mounted) {
                  context.read<HomeCubit>().load(silent: true);
                }
              },
        title: Text(
          job['issue']?.toString() ?? job['jobType']?.toString() ?? 'Job',
          style: GoogleFonts.dmSans(fontWeight: FontWeight.w600, fontSize: 14),
        ),
        subtitle: Text(
          [
            job['clientName'],
            job['clientMobileNumber'],
          ].whereType<String>().where((s) => s.isNotEmpty).join(', '),
          style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
        ),
        trailing: dt != null
            ? Text(
                DateFormat('HH:mm').format(dt.toLocal()),
                style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
              )
            : null,
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
        return AppColors.success;
      case 'cancelled':
        return AppColors.danger;
      case 'en_route':
      case 'arrived':
      case 'in_progress':
        return AppColors.accent;
      case 'assigned':
      case 'accepted':
        return AppColors.info;
      default:
        return AppColors.warning;
    }
  }

  @override
  Widget build(BuildContext context) {
    final id = job['_id']?.toString() ?? '';
    final name = job['clientName']?.toString() ?? 'Customer';
    final status = job['job_status']?.toString() ?? '';
    final jobType = job['jobType']?.toString() ?? '';
    final price = job['price'];
    DateTime? dt;
    final raw = job['dateTime'] ?? job['createdAt'];
    if (raw != null) dt = DateTime.tryParse(raw.toString());

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: id.isEmpty
            ? null
            : () async {
                await Navigator.of(context).pushNamed(
                  Routes.jobDetail,
                  arguments: id,
                );
                if (context.mounted) {
                  context.read<HomeCubit>().load(silent: true);
                }
              },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: GoogleFonts.dmSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                  ),
                  _StatusPill(status: status, color: _statusColor(status)),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                [
                  if (jobType.isNotEmpty) jobType,
                  if (price != null) 'QR $price',
                  if (dt != null) DateFormat('dd MMM · HH:mm').format(dt.toLocal()),
                ].join(' · '),
                style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
              ),
              if (id.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  '#${id.length > 8 ? id.substring(id.length - 8).toUpperCase() : id.toUpperCase()}',
                  style: GoogleFonts.dmSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ],
          ),
        ),
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
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: GoogleFonts.dmSans(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
