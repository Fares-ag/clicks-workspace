import 'package:clicks_technician/core/constants/job_status_labels.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/activity_details_screen.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/activity_calendar_sheet.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/activity_job_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

/// Activities listing — Figma card layout, calendar filter, pagination.
class ActivityTab extends StatefulWidget {
  const ActivityTab({super.key, this.visible = false});

  /// When false the tab stays mounted but ignores session/GPS ticks.
  final bool visible;

  @override
  State<ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends State<ActivityTab> {
  static const _pageSize = 4;
  int _page = 0;
  DateTime? _filterDay;
  late DateTime _month;
  _ActivityStatusFilter _statusFilter = _ActivityStatusFilter.all;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = DateTime(now.year, now.month);
    _scrollController.addListener(_onScroll);
  }

  @override
  void didUpdateWidget(covariant ActivityTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.visible && !oldWidget.visible) {
      context.read<HomeCubit>().fetchHistory();
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final max = _scrollController.position.maxScrollExtent;
    if (_scrollController.offset >= max - 120) {
      context.read<HomeCubit>().loadMoreHistory();
    }
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

  String _jobStatus(Map<String, dynamic> job) =>
      (job['job_status'] ?? job['status'] ?? '').toString();

  bool _matchesStatusFilter(Map<String, dynamic> job) {
    final status = _jobStatus(job).toLowerCase();
    switch (_statusFilter) {
      case _ActivityStatusFilter.all:
        return true;
      case _ActivityStatusFilter.active:
        return status != 'completed' && status != 'cancelled';
      case _ActivityStatusFilter.pending:
        return status == 'pending';
      case _ActivityStatusFilter.assigned:
        return status == 'assigned';
      case _ActivityStatusFilter.accepted:
        return status == 'accepted';
      case _ActivityStatusFilter.enRoute:
        return status == 'en_route';
      case _ActivityStatusFilter.arrived:
        return status == 'arrived';
      case _ActivityStatusFilter.inProgress:
        return status == 'in_progress';
      case _ActivityStatusFilter.onHold:
        return status == 'on_hold';
      case _ActivityStatusFilter.completed:
        return status == 'completed';
      case _ActivityStatusFilter.cancelled:
        return status == 'cancelled';
    }
  }

  String _emptyStatusLabel() {
    if (_statusFilter == _ActivityStatusFilter.all) {
      return 'No jobs in this period.';
    }
    if (_statusFilter == _ActivityStatusFilter.active) {
      return 'No active jobs right now.';
    }
    return 'No ${_statusFilter.label.toLowerCase()} jobs.';
  }

  List<Map<String, dynamic>> _filterByStatus(
    List<Map<String, dynamic>> jobs,
  ) =>
      jobs.where(_matchesStatusFilter).toList();

  void _openCalendar(List<Map<String, dynamic>> statusFilteredJobs) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) => ActivityCalendarSheet(
        initialMonth: _month,
        markedDays: _daysWithJobs(statusFilteredJobs),
        selectedDay: _filterDay,
        onMonthChanged: (m) => setState(() => _month = m),
        onDaySelected: (day) => setState(() {
          _filterDay = day;
          if (day != null) {
            _month = DateTime(day.year, day.month);
          }
          _page = 0;
        }),
        onClear: () => setState(() {
          _filterDay = null;
          _page = 0;
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: BlocBuilder<HomeCubit, HomeState>(
          buildWhen: (_, __) => widget.visible,
          builder: (context, state) {
            final cubit = context.read<HomeCubit>();
            final seen = <String>{};
            final allJobs = <Map<String, dynamic>>[];
            for (final job in [...cubit.activeJobs, ...cubit.jobHistory]) {
              final id = (job['_id'] ?? job['job_id'])?.toString();
              if (id == null || id.isEmpty || !seen.add(id)) continue;
              allJobs.add(job);
            }
            final statusFilteredJobs = _filterByStatus(allJobs);

            var jobs = statusFilteredJobs.where((j) {
              final local = _jobDate(j);
              if (_filterDay != null) {
                return local != null && _sameDay(local, _filterDay!);
              }
              // Open work stays visible even when its scheduled date is in
              // another month — otherwise an accepted job disappears until
              // the technician happens to page the calendar forward.
              final status = _jobStatus(j).toLowerCase();
              final open = status.isNotEmpty &&
                  status != 'completed' &&
                  status != 'cancelled';
              if (open) return true;
              if (local == null) return true;
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

            final emptyLabel = allJobs.isEmpty
                ? 'No activities yet.'
                : statusFilteredJobs.isEmpty
                    ? _emptyStatusLabel()
                    : _filterDay != null
                        ? 'No jobs on ${DateFormat('d MMM').format(_filterDay!)}'
                        : 'No jobs in ${DateFormat('MMMM yyyy').format(_month)}';

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 8.h),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Activities',
                          style: TextStyles.font16RegularBlack.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 24.sp,
                            color: ColorsManager.blackColor,
                          ),
                        ),
                      ),
                      _CalendarHeaderButton(
                        onPressed: () => _openCalendar(statusFilteredJobs),
                        active: _filterDay != null,
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 8.h),
                  child: _ActivityStatusFilterBar(
                    selected: _statusFilter,
                    onChanged: (filter) => setState(() {
                      _statusFilter = filter;
                      _page = 0;
                    }),
                  ),
                ),
                if (_filterDay != null)
                  Padding(
                    padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 8.h),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        DateFormat('EEE, d MMM yyyy').format(_filterDay!),
                        style: TextStyles.font12RegularGrey.copyWith(
                          color: ColorsManager.greyColor,
                          fontWeight: FontWeight.w500,
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
                              style: TextStyles.font14RegularGrey.copyWith(
                                color: ColorsManager.greyColor,
                              ),
                            ),
                          ),
                        )
                      : ListView.separated(
                          controller: _scrollController,
                          padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 12.h),
                          itemCount: pageJobs.length + (cubit.historyHasMore ? 1 : 0),
                          separatorBuilder: (_, __) => SizedBox(height: 12.h),
                          itemBuilder: (context, i) {
                            if (i >= pageJobs.length) {
                              return Center(
                                child: Padding(
                                  padding: EdgeInsets.symmetric(vertical: 12.h),
                                  child: cubit.historyLoadingMore
                                      ? const CircularProgressIndicator()
                                      : const SizedBox.shrink(),
                                ),
                              );
                            }
                            final job = pageJobs[i];
                            return ActivityJobCard(
                              job: job,
                              onViewDetails: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ActivityDetailsScreen(
                                      job: job,
                                      cubit: cubit,
                                    ),
                                  ),
                                );
                              },
                            );
                          },
                        ),
                ),
                if (jobs.isNotEmpty)
                  Padding(
                    padding: EdgeInsets.fromLTRB(16.w, 4.h, 16.w, 8.h),
                    child: _ActivityPagination(
                      page: page,
                      pageCount: pageCount,
                      onPrevious: page > 0
                          ? () => setState(() => _page = page - 1)
                          : null,
                      onNext: page < pageCount - 1
                          ? () => setState(() => _page = page + 1)
                          : null,
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

enum _ActivityStatusFilter {
  all,
  active,
  pending,
  assigned,
  accepted,
  enRoute,
  arrived,
  inProgress,
  onHold,
  completed,
  cancelled;

  String get label {
    switch (this) {
      case _ActivityStatusFilter.all:
        return 'All';
      case _ActivityStatusFilter.active:
        return 'Active';
      case _ActivityStatusFilter.pending:
        return JobStatusLabels.labelFor('pending');
      case _ActivityStatusFilter.assigned:
        return JobStatusLabels.labelFor('assigned');
      case _ActivityStatusFilter.accepted:
        return JobStatusLabels.labelFor('accepted');
      case _ActivityStatusFilter.enRoute:
        return JobStatusLabels.labelFor('en_route');
      case _ActivityStatusFilter.arrived:
        return JobStatusLabels.labelFor('arrived');
      case _ActivityStatusFilter.inProgress:
        return JobStatusLabels.labelFor('in_progress');
      case _ActivityStatusFilter.onHold:
        return JobStatusLabels.labelFor('on_hold');
      case _ActivityStatusFilter.completed:
        return JobStatusLabels.labelFor('completed');
      case _ActivityStatusFilter.cancelled:
        return JobStatusLabels.labelFor('cancelled');
    }
  }

  static const filterOptions = [
    _ActivityStatusFilter.all,
    _ActivityStatusFilter.active,
    _ActivityStatusFilter.pending,
    _ActivityStatusFilter.assigned,
    _ActivityStatusFilter.accepted,
    _ActivityStatusFilter.enRoute,
    _ActivityStatusFilter.arrived,
    _ActivityStatusFilter.inProgress,
    _ActivityStatusFilter.onHold,
    _ActivityStatusFilter.completed,
    _ActivityStatusFilter.cancelled,
  ];
}

class _ActivityStatusFilterBar extends StatelessWidget {
  const _ActivityStatusFilterBar({
    required this.selected,
    required this.onChanged,
  });

  final _ActivityStatusFilter selected;
  final ValueChanged<_ActivityStatusFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final filter in _ActivityStatusFilter.filterOptions) ...[
            _FilterChip(
              label: filter.label,
              selected: selected == filter,
              onTap: () => onChanged(filter),
            ),
            SizedBox(width: 8.w),
          ],
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? ColorsManager.mainColor : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(99.r),
        side: BorderSide(
          color: selected ? ColorsManager.mainColor : ColorsManager.border,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(99.r),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 8.h),
          child: Text(
            label,
            style: TextStyles.font12RegularGrey.copyWith(
              color: selected ? Colors.white : ColorsManager.greyColor,
              fontWeight: FontWeight.w600,
              fontSize: 13.sp,
            ),
          ),
        ),
      ),
    );
  }
}

class _CalendarHeaderButton extends StatelessWidget {
  const _CalendarHeaderButton({
    required this.onPressed,
    required this.active,
  });

  final VoidCallback onPressed;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8.r),
        side: BorderSide(
          color: active ? ColorsManager.mainColor : ColorsManager.border,
          width: active ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(8.r),
        child: SizedBox(
          width: 44.w,
          height: 44.w,
          child: Icon(
            Icons.calendar_today_outlined,
            size: 22.sp,
            color: active ? ColorsManager.mainColor : ColorsManager.blackColor,
          ),
        ),
      ),
    );
  }
}

class _ActivityPagination extends StatelessWidget {
  const _ActivityPagination({
    required this.page,
    required this.pageCount,
    required this.onPrevious,
    required this.onNext,
  });

  final int page;
  final int pageCount;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _PaginationArrow(enabled: onPrevious != null, onTap: onPrevious),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 16.w),
          child: Text(
            'Page ${page + 1} of $pageCount',
            style: TextStyles.font14RegularGrey.copyWith(
              color: ColorsManager.greyColor,
              fontWeight: FontWeight.w500,
              fontSize: 14.sp,
            ),
          ),
        ),
        _PaginationArrow(
          enabled: onNext != null,
          onTap: onNext,
          forward: true,
        ),
      ],
    );
  }
}

class _PaginationArrow extends StatelessWidget {
  const _PaginationArrow({
    required this.enabled,
    required this.onTap,
    this.forward = false,
  });

  final bool enabled;
  final VoidCallback? onTap;
  final bool forward;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(6.r),
        side: BorderSide(color: ColorsManager.border),
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(6.r),
        child: SizedBox(
          width: 36.w,
          height: 36.w,
          child: Icon(
            forward ? Icons.chevron_right : Icons.chevron_left,
            size: 22.sp,
            color: enabled ? ColorsManager.greyColor : ColorsManager.border,
          ),
        ),
      ),
    );
  }
}
