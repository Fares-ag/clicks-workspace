import 'dart:math' as math;

import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/notifications_popup.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:intl/intl.dart';

/// Figma Earnings — welcome header, total card, mini stats, chart, performance.
class EarningsTab extends StatefulWidget {
  const EarningsTab({super.key, this.visible = false});

  /// [MainShell] IndexedStack builds all tabs at once — only fetch when shown.
  final bool visible;

  @override
  State<EarningsTab> createState() => _EarningsTabState();
}

class _EarningsTabState extends State<EarningsTab> {
  static const _dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  bool _loading = false;
  bool _loadedOnce = false;
  String? _error;
  Map<String, dynamic> _perf = {};

  @override
  void initState() {
    super.initState();
    if (widget.visible) _load();
  }

  @override
  void didUpdateWidget(covariant EarningsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.visible && !oldWidget.visible && !_loadedOnce) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: EndPoints.dashboard);
      if (res.statusCode == 200) {
        final perf = res.data['performance'];
        _perf = perf is Map
            ? Map<String, dynamic>.from(perf)
            : <String, dynamic>{};
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load earnings';
      }
    } catch (_) {
      _error = 'Failed to load earnings';
    }
    if (mounted) {
      setState(() {
        _loading = false;
        _loadedOnce = true;
      });
    }
  }

  num _n(String key) {
    final v = _perf[key];
    if (v is num) return v;
    return num.tryParse(v?.toString() ?? '') ?? 0;
  }

  String _fmt(num value) =>
      NumberFormat('#,##0').format(value.round());

  String _firstName(String full) {
    final t = full.trim();
    if (t.isEmpty) return 'Technician';
    return t.split(RegExp(r'\s+')).first;
  }

  /// Always 7 bars Sun→Sat for the chart axis.
  List<({String label, double amount})> _weeklyBars() {
    final raw = _perf['earningsData'];
    final byDay = List<double>.filled(7, 0);
    if (raw is List) {
      for (final e in raw) {
        if (e is! Map) continue;
        final amount = e['amount'];
        final a = amount is num
            ? amount.toDouble()
            : double.tryParse(amount?.toString() ?? '') ?? 0;
        final d = DateTime.tryParse((e['date'] ?? '').toString());
        final dayIndex = e['dayIndex'];
        if (dayIndex is num && dayIndex >= 0 && dayIndex < 7) {
          byDay[dayIndex.toInt()] += a;
        } else if (d != null) {
          // Sunday=0: DateTime.weekday is Mon=1..Sun=7
          final idx = d.toUtc().weekday % 7;
          byDay[idx] += a;
        }
      }
    }
    return List.generate(
      7,
      (i) => (label: _dayLabels[i], amount: byDay[i]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<HomeCubit>();
    final name = _firstName(cubit.technicianName);

    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F8),
      body: Column(
        children: [
          _WelcomeHeader(
            name: name,
            hasUnread: cubit.unreadNotifications > 0,
          ),
          Expanded(
            child: RefreshIndicator(
              color: ColorsManager.mainColor,
              onRefresh: () async {
                await _load();
                if (mounted) await cubit.fetchHomeMeta();
              },
              child: _loading
                  ? ListView(
                      children: [
                        SizedBox(height: 120.h),
                        Center(
                          child: CircularProgressIndicator(
                            color: ColorsManager.mainColor,
                          ),
                        ),
                      ],
                    )
                  : _error != null
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: EdgeInsets.all(16.w),
                          children: [
                            SizedBox(height: 80.h),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: TextStyles.font14RegularGrey,
                            ),
                            SizedBox(height: 12.h),
                            TextButton(
                              onPressed: _load,
                              child: Text(
                                'Retry',
                                style: TextStyle(color: ColorsManager.mainColor),
                              ),
                            ),
                          ],
                        )
                      : ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 28.h),
                          children: [
                            _TotalEarningsCard(
                              amount: _fmt(_n('totalEarnings')),
                            ),
                            SizedBox(height: 12.h),
                            Row(
                              children: [
                                Expanded(
                                  child: _MiniStatCard(
                                    icon: Icons.monetization_on_outlined,
                                    iconColor: const Color(0xFFF79009),
                                    label: 'Cash Balance',
                                    value: _fmt(_n('cashBalance')),
                                  ),
                                ),
                                SizedBox(width: 12.w),
                                Expanded(
                                  child: _MiniStatCard(
                                    icon: Icons.watch_later_outlined,
                                    iconColor: ColorsManager.mainColor,
                                    label: 'Weekly Hours',
                                    value: _fmt(_n('weeklyOnlineHours')),
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 12.h),
                            _CompletedJobsCard(
                              count: _fmt(_n('completedJobs')),
                              changePct: _n('completedJobsChangePct').toDouble(),
                            ),
                            SizedBox(height: 16.h),
                            _WeeklyEarningChart(
                              bars: _weeklyBars(),
                              weekTotal: _n('weeklyEarningsTotal').toDouble() > 0
                                  ? _n('weeklyEarningsTotal').toDouble()
                                  : _weeklyBars().fold<double>(
                                      0, (s, b) => s + b.amount),
                            ),
                            SizedBox(height: 16.h),
                            _WeeklyPerformanceCard(
                              hours: _n('weeklyOnlineHours').toDouble(),
                              hoursChangePct:
                                  _n('weeklyOnlineHoursChangePct').toDouble(),
                              completed: _fmt(_n('weeklyCompletedJobs')),
                              rejected: _fmt(_n('weeklyRejectedJobs')),
                              cancelled: _fmt(_n('weeklyCancelledJobs')),
                              completedTrend:
                                  _n('completedJobsTrendPct').toDouble(),
                              rejectedTrend:
                                  _n('rejectedJobsTrendPct').toDouble(),
                              cancelledTrend:
                                  _n('cancelledJobsTrendPct').toDouble(),
                            ),
                          ],
                        ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WelcomeHeader extends StatelessWidget {
  const _WelcomeHeader({required this.name, required this.hasUnread});
  final String name;
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFB42828), Color(0xFF7A1515)],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 18.h),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  "Welcome $name, Ready for today's jobs?",
                  style: TextStyles.font16RegularBlack.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15.sp,
                    height: 1.25,
                  ),
                ),
              ),
              SizedBox(width: 10.w),
              _EarningsBell(hasUnread: hasUnread),
            ],
          ),
        ),
      ),
    );
  }
}

class _EarningsBell extends StatelessWidget {
  const _EarningsBell({required this.hasUnread});
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        await showNotificationsPopup(context);
        if (context.mounted) {
          context.read<HomeCubit>().fetchHomeMeta();
        }
      },
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: EdgeInsets.all(10.w),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFFE4E7EC)),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Icon(
              Icons.notifications_none_rounded,
              size: 20.sp,
              color: ColorsManager.blackColor,
            ),
            if (hasUnread)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF79009),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TotalEarningsCard extends StatelessWidget {
  const _TotalEarningsCard({required this.amount});
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(20.w, 22.h, 16.w, 22.h),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16.r),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFC43A3A), Color(0xFF861818)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF981F1F).withValues(alpha: 0.28),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Total Earnings',
                  style: TextStyles.font14RegularGrey.copyWith(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                SizedBox(height: 8.h),
                Text(
                  amount,
                  style: TextStyles.font28Bold.copyWith(
                    color: Colors.white,
                    fontSize: 40.sp,
                    height: 1.05,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          SvgPicture.asset(
            AssetsManager.arrowSvg,
            width: 72.w,
            height: 70.h,
          ),
        ],
      ),
    );
  }
}

class _MiniStatCard extends StatelessWidget {
  const _MiniStatCard({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(color: const Color(0xFFECECEC)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor, size: 22.sp),
          SizedBox(height: 10.h),
          Text(label, style: TextStyles.font12RegularGrey),
          SizedBox(height: 4.h),
          Text(
            value,
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 22.sp,
            ),
          ),
        ],
      ),
    );
  }
}

class _CompletedJobsCard extends StatelessWidget {
  const _CompletedJobsCard({required this.count, required this.changePct});
  final String count;
  final double changePct;

  @override
  Widget build(BuildContext context) {
    final positive = changePct >= 0;
    final pctLabel =
        '${positive ? '+' : ''}${changePct.toStringAsFixed(2)}%';

    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 16.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(color: const Color(0xFFA6F4C5), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Completed Jobs', style: TextStyles.font12RegularGrey),
                SizedBox(height: 4.h),
                Text(
                  count,
                  style: TextStyles.font16RegularBlack.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 26.sp,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 6.h),
            decoration: BoxDecoration(
              color: positive
                  ? const Color(0xFFECFDF3)
                  : const Color(0xFFFEF3F2),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '$pctLabel Vs last month',
              style: TextStyles.font12RegularGrey.copyWith(
                color: positive
                    ? const Color(0xFF039855)
                    : const Color(0xFFD92D20),
                fontWeight: FontWeight.w600,
                fontSize: 11.sp,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _WeeklyEarningChart extends StatelessWidget {
  const _WeeklyEarningChart({required this.bars, required this.weekTotal});
  final List<({String label, double amount})> bars;
  final double weekTotal;

  @override
  Widget build(BuildContext context) {
    final maxAmt = bars.isEmpty
        ? 0.0
        : bars.map((b) => b.amount).reduce((a, b) => a > b ? a : b);
    final axisMax = maxAmt <= 0
        ? 200.0
        : (maxAmt <= 200 ? 200.0 : (maxAmt * 1.15).ceilToDouble());

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(14.w, 16.h, 14.w, 14.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(color: const Color(0xFFECECEC)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Weekly Earning',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 4.h),
          Text(
            'Total earning in this week : ${NumberFormat('#,##0').format(weekTotal.round())} QAR',
            style: TextStyles.font12RegularGrey,
          ),
          SizedBox(height: 18.h),
          SizedBox(
            height: 172.h,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 28.w,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        axisMax.toStringAsFixed(0),
                        style: TextStyles.font12RegularGrey
                            .copyWith(fontSize: 10.sp),
                      ),
                      // Leave room so the axis "0" sits above day labels.
                      Padding(
                        padding: EdgeInsets.only(bottom: 18.h),
                        child: Text(
                          '0',
                          style: TextStyles.font12RegularGrey
                              .copyWith(fontSize: 10.sp),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final labelGap = 8.h;
                      final labelH = 14.h;
                      final hasHighlight = maxAmt > 0;
                      final badgeReserve = hasHighlight ? 28.h : 0.0;
                      final maxBarH = math.max(
                        6.0,
                        constraints.maxHeight -
                            labelGap -
                            labelH -
                            badgeReserve,
                      );
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: bars.map((b) {
                          final ratio = axisMax <= 0
                              ? 0.0
                              : (b.amount / axisMax).clamp(0.0, 1.0);
                          final h = math.max(6.0, maxBarH * ratio);
                          final highlight = b.amount == maxAmt && maxAmt > 0;
                          return Expanded(
                            child: Padding(
                              padding: EdgeInsets.symmetric(horizontal: 3.w),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (highlight)
                                    Container(
                                      margin: EdgeInsets.only(bottom: 6.h),
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 6.w,
                                        vertical: 2.h,
                                      ),
                                      decoration: BoxDecoration(
                                        color: ColorsManager.mainColor,
                                        borderRadius:
                                            BorderRadius.circular(6.r),
                                      ),
                                      child: Text(
                                        b.amount.toStringAsFixed(0),
                                        style: TextStyles.font12RegularGrey
                                            .copyWith(
                                          color: Colors.white,
                                          fontSize: 9.sp,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  Container(
                                    height: h,
                                    decoration: BoxDecoration(
                                      gradient: highlight
                                          ? const LinearGradient(
                                              begin: Alignment.topCenter,
                                              end: Alignment.bottomCenter,
                                              colors: [
                                                Color(0xFFD64545),
                                                Color(0xFF981F1F),
                                              ],
                                            )
                                          : null,
                                      color: highlight
                                          ? null
                                          : const Color(0xFFEDEDED),
                                      borderRadius: BorderRadius.circular(6.r),
                                    ),
                                  ),
                                  SizedBox(height: labelGap),
                                  Text(
                                    b.label,
                                    maxLines: 1,
                                    overflow: TextOverflow.clip,
                                    style: TextStyles.font12RegularGrey.copyWith(
                                      fontSize: 10.sp,
                                      height: 1.1,
                                      fontWeight: highlight
                                          ? FontWeight.w700
                                          : FontWeight.w400,
                                      color: highlight
                                          ? ColorsManager.mainColor
                                          : ColorsManager.greyColor,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _WeeklyPerformanceCard extends StatelessWidget {
  const _WeeklyPerformanceCard({
    required this.hours,
    required this.hoursChangePct,
    required this.completed,
    required this.rejected,
    required this.cancelled,
    required this.completedTrend,
    required this.rejectedTrend,
    required this.cancelledTrend,
  });

  final double hours;
  final double hoursChangePct;
  final String completed;
  final String rejected;
  final String cancelled;
  final double completedTrend;
  final double rejectedTrend;
  final double cancelledTrend;

  @override
  Widget build(BuildContext context) {
    final maxHours = 80.0;
    final progress = (hours / maxHours).clamp(0.0, 1.0);
    final hoursUp = hoursChangePct >= 0;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(14.w, 16.h, 14.w, 16.h),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14.r),
        border: Border.all(color: const Color(0xFFECECEC)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Weekly Performance',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 8.h),
          SizedBox(
            height: 150.h,
            width: double.infinity,
            child: CustomPaint(
              painter: _SemiGaugePainter(progress: progress),
              child: Center(
                child: Padding(
                  padding: EdgeInsets.only(top: 42.h),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${hours.toStringAsFixed(0)} Hrs',
                            style: TextStyles.font28Bold.copyWith(
                              color: ColorsManager.blackColor,
                              fontSize: 28.sp,
                            ),
                          ),
                          SizedBox(width: 6.w),
                          Container(
                            margin: EdgeInsets.only(top: 4.h),
                            padding: EdgeInsets.symmetric(
                              horizontal: 6.w,
                              vertical: 2.h,
                            ),
                            decoration: BoxDecoration(
                              color: hoursUp
                                  ? const Color(0xFFECFDF3)
                                  : const Color(0xFFFEF3F2),
                              borderRadius: BorderRadius.circular(6.r),
                            ),
                            child: Text(
                              '${hoursUp ? '+' : ''}${hoursChangePct.toStringAsFixed(0)}%',
                              style: TextStyles.font12RegularGrey.copyWith(
                                color: hoursUp
                                    ? const Color(0xFF039855)
                                    : const Color(0xFFD92D20),
                                fontWeight: FontWeight.w700,
                                fontSize: 10.sp,
                              ),
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 4.h),
                      Text(
                        'Total Hours Online This Week',
                        style: TextStyles.font12RegularGrey,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SizedBox(height: 8.h),
          const Divider(height: 1, color: Color(0xFFEEEEEE)),
          SizedBox(height: 12.h),
          Row(
            children: [
              Expanded(
                child: _PerfMetric(
                  label: 'Completed Jobs',
                  value: completed,
                  trendPct: completedTrend,
                  // Higher completed is good → green up / red down
                  goodWhenUp: true,
                ),
              ),
              Expanded(
                child: _PerfMetric(
                  label: 'Rejected Jobs',
                  value: rejected,
                  trendPct: rejectedTrend,
                  // Higher rejected is bad → red up / green down
                  goodWhenUp: false,
                ),
              ),
              Expanded(
                child: _PerfMetric(
                  label: 'Canceled Jobs',
                  value: cancelled,
                  trendPct: cancelledTrend,
                  goodWhenUp: false,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PerfMetric extends StatelessWidget {
  const _PerfMetric({
    required this.label,
    required this.value,
    required this.trendPct,
    required this.goodWhenUp,
  });

  final String label;
  final String value;
  final double trendPct;
  final bool goodWhenUp;

  @override
  Widget build(BuildContext context) {
    final up = trendPct > 0;
    final flat = trendPct.abs() < 0.01;
    final isGood = flat ? true : (up ? goodWhenUp : !goodWhenUp);
    final arrowColor = flat
        ? ColorsManager.greyColor
        : (isGood ? const Color(0xFF12B76A) : const Color(0xFFF04438));

    return Column(
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyles.font12RegularGrey.copyWith(fontSize: 10.sp),
        ),
        SizedBox(height: 6.h),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              value,
              style: TextStyles.font16RegularBlack.copyWith(
                fontWeight: FontWeight.w700,
                fontSize: 18.sp,
              ),
            ),
            if (!flat) ...[
              SizedBox(width: 4.w),
              Icon(
                up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
                size: 14.sp,
                color: arrowColor,
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _SemiGaugePainter extends CustomPainter {
  _SemiGaugePainter({required this.progress});
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.88);
    final radius = math.min(size.width / 2 - 12, size.height - 16);
    const start = math.pi;
    const sweep = math.pi;

    final bg = Paint()
      ..color = const Color(0xFFEDEDED)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 16
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep,
      false,
      bg,
    );

    final fg = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFFC43A3A), Color(0xFF981F1F)],
      ).createShader(Rect.fromCircle(center: center, radius: radius))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 16
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      start,
      sweep * progress,
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(covariant _SemiGaugePainter oldDelegate) =>
      oldDelegate.progress != progress;
}
