import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/activity_details_screen.dart';
import 'package:clicks_technician/features/home/ui/view/add_job_screen.dart';
import 'package:clicks_technician/features/home/ui/view/add_subscription_screen.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

/// Activities listing with month calendar + status pills + view details.
class ActivityTab extends StatefulWidget {
  const ActivityTab({super.key});

  @override
  State<ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends State<ActivityTab> {
  static const _pageSize = 5;
  /// Calendar columns: Sun → Sat (matches Dart `weekday % 7` padding).
  static const _weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  int _page = 0;
  DateTime? _filterDay;
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
  }

  DateTime? _jobDate(Map<String, dynamic> job) {
    final raw = job['dateTime'] ?? job['createdAt'] ?? job['completed_at'];
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    return dt?.toLocal();
  }

  Set<int> _daysWithJobs(List<Map<String, dynamic>> jobs) {
    final days = <int>{};
    for (final j in jobs) {
      final local = _jobDate(j);
      if (local == null) continue;
      if (local.year == _month.year && local.month == _month.month) {
        days.add(local.day);
      }
    }
    return days;
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FloatingActionButton.extended(
            heroTag: 'add_sub',
            onPressed: () {
              final cubit = context.read<HomeCubit>();
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => AddSubscriptionScreen(cubit: cubit),
                ),
              );
            },
            backgroundColor: Colors.white,
            foregroundColor: ColorsManager.mainColor,
            label: const Text('Subscription'),
            icon: const Icon(Icons.card_membership_outlined),
          ),
          SizedBox(height: 10.h),
          FloatingActionButton.extended(
            heroTag: 'add_job',
            onPressed: () {
              final cubit = context.read<HomeCubit>();
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => AddJobScreen(cubit: cubit),
                ),
              );
            },
            backgroundColor: ColorsManager.mainColor,
            foregroundColor: Colors.white,
            label: const Text('Add job'),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: SafeArea(
        child: BlocBuilder<HomeCubit, HomeState>(
          builder: (context, state) {
            final cubit = context.read<HomeCubit>();
            final allJobs = List<Map<String, dynamic>>.from(cubit.jobHistory);
            final marked = _daysWithJobs(allJobs);
            final now = DateTime.now();

            // Default: jobs in the visible month. Tap a day to filter to that day.
            var jobs = allJobs.where((j) {
              final local = _jobDate(j);
              if (local == null) return false;
              if (_filterDay != null) return _sameDay(local, _filterDay!);
              return local.year == _month.year && local.month == _month.month;
            }).toList();

            final pageCount =
                jobs.isEmpty ? 1 : ((jobs.length - 1) ~/ _pageSize) + 1;
            final page = _page.clamp(0, pageCount - 1);
            final start = page * _pageSize;
            final pageJobs = jobs.isEmpty
                ? <Map<String, dynamic>>[]
                : jobs.sublist(
                    start,
                    (start + _pageSize).clamp(0, jobs.length),
                  );

            // Dart weekday: Mon=1 … Sun=7 → pad so column 0 is Sunday.
            final firstWeekday =
                DateTime(_month.year, _month.month, 1).weekday % 7;
            final daysInMonth =
                DateTime(_month.year, _month.month + 1, 0).day;
            final monthLabel = DateFormat('MMMM yyyy').format(_month);
            final listLabel = _filterDay != null
                ? DateFormat('EEE, d MMM').format(_filterDay!)
                : 'Jobs in $monthLabel';
            final emptyLabel = allJobs.isEmpty
                ? 'No jobs yet. Tap + Add job to create one.'
                : _filterDay != null
                    ? 'No jobs on ${DateFormat('d MMM').format(_filterDay!)}'
                    : 'No jobs in $monthLabel';

            return Column(
              children: [
                Padding(
                  padding:
                      EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Activities',
                          style: TextStyles.font16RegularBlack.copyWith(
                            fontWeight: FontWeight.bold,
                            fontSize: 22.sp,
                          ),
                        ),
                      ),
                      if (_filterDay != null)
                        TextButton(
                          onPressed: () => setState(() {
                            _filterDay = null;
                            _page = 0;
                          }),
                          child: const Text('Show month'),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8.w),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: 'Previous month',
                        onPressed: () => setState(() {
                          _month = DateTime(_month.year, _month.month - 1);
                          _filterDay = null;
                          _page = 0;
                        }),
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Expanded(
                        child: Text(
                          monthLabel,
                          textAlign: TextAlign.center,
                          style: TextStyles.font14RegularGrey.copyWith(
                            fontWeight: FontWeight.w700,
                            color: Colors.black87,
                            fontSize: 15.sp,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Next month',
                        onPressed: () => setState(() {
                          _month = DateTime(_month.year, _month.month + 1);
                          _filterDay = null;
                          _page = 0;
                        }),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(12.w, 0, 12.w, 4.h),
                  child: Row(
                    children: _weekdays
                        .map(
                          (d) => Expanded(
                            child: Text(
                              d,
                              textAlign: TextAlign.center,
                              style: TextStyles.font12RegularGrey.copyWith(
                                fontWeight: FontWeight.w600,
                                fontSize: 11.sp,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12.w),
                  child: GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: firstWeekday + daysInMonth,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 7,
                      childAspectRatio: 1.05,
                    ),
                    itemBuilder: (context, index) {
                      if (index < firstWeekday) {
                        return const SizedBox.shrink();
                      }
                      final day = index - firstWeekday + 1;
                      final date = DateTime(_month.year, _month.month, day);
                      final has = marked.contains(day);
                      final selected =
                          _filterDay != null && _sameDay(_filterDay!, date);
                      final isToday = _sameDay(date, now);
                      return InkWell(
                        borderRadius: BorderRadius.circular(8.r),
                        onTap: () => setState(() {
                          _filterDay = selected ? null : date;
                          _page = 0;
                        }),
                        child: Container(
                          margin: EdgeInsets.all(2.w),
                          decoration: BoxDecoration(
                            color: selected
                                ? ColorsManager.mainColor
                                    .withValues(alpha: 0.15)
                                : null,
                            border: isToday && !selected
                                ? Border.all(
                                    color: ColorsManager.mainColor,
                                    width: 1.2,
                                  )
                                : null,
                            borderRadius: BorderRadius.circular(8.r),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                '$day',
                                style: TextStyles.font12RegularGrey.copyWith(
                                  color: selected
                                      ? ColorsManager.mainColor
                                      : Colors.black87,
                                  fontWeight: selected || isToday
                                      ? FontWeight.bold
                                      : FontWeight.w500,
                                ),
                              ),
                              SizedBox(height: 3.h),
                              // Always reserve space so day numbers stay aligned.
                              SizedBox(
                                width: 5.w,
                                height: 5.w,
                                child: has
                                    ? Container(
                                        decoration: const BoxDecoration(
                                          color: ColorsManager.mainColor,
                                          shape: BoxShape.circle,
                                        ),
                                      )
                                    : null,
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 4.h),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      listLabel,
                      style: TextStyles.font14RegularGrey.copyWith(
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: pageJobs.isEmpty
                      ? Center(
                          child: Padding(
                            padding: EdgeInsets.symmetric(horizontal: 32.w),
                            child: Text(
                              emptyLabel,
                              textAlign: TextAlign.center,
                              style: TextStyles.font14RegularGrey,
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 100.h),
                          itemCount: pageJobs.length,
                          separatorBuilder: (_, __) => SizedBox(height: 10.h),
                          itemBuilder: (context, i) {
                            final job = pageJobs[i];
                            return ListTile(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12.r),
                                side: BorderSide(color: ColorsManager.border),
                              ),
                              title: Text(
                                (job['clientName'] ?? 'Customer').toString(),
                                style: TextStyles.font14RegularGrey.copyWith(
                                  color: Colors.black87,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(
                                JobDisplay.statusLabel(
                                  (job['job_status'] ?? job['status'] ?? '')
                                      .toString(),
                                ),
                                style: TextStyles.font12RegularGrey,
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        ActivityDetailsScreen(job: job),
                                  ),
                                );
                              },
                            );
                          },
                        ),
                ),
                if (pageCount > 1)
                  Padding(
                    padding: EdgeInsets.only(bottom: 12.h),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconButton(
                          onPressed: page > 0
                              ? () => setState(() => _page = page - 1)
                              : null,
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Text('${page + 1} / $pageCount',
                            style: TextStyles.font12RegularGrey),
                        IconButton(
                          onPressed: page < pageCount - 1
                              ? () => setState(() => _page = page + 1)
                              : null,
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
