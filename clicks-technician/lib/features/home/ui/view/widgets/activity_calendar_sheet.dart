import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

/// Month calendar filter — opened from the Activities header calendar button.
class ActivityCalendarSheet extends StatefulWidget {
  const ActivityCalendarSheet({
    super.key,
    required this.initialMonth,
    required this.markedDays,
    required this.selectedDay,
    required this.onMonthChanged,
    required this.onDaySelected,
    required this.onClear,
  });

  final DateTime initialMonth;
  final Set<int> markedDays;
  final DateTime? selectedDay;
  final ValueChanged<DateTime> onMonthChanged;
  final ValueChanged<DateTime?> onDaySelected;
  final VoidCallback onClear;

  @override
  State<ActivityCalendarSheet> createState() => _ActivityCalendarSheetState();
}

class _ActivityCalendarSheetState extends State<ActivityCalendarSheet> {
  static const _weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    _month = widget.initialMonth;
  }

  bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final firstWeekday = DateTime(_month.year, _month.month, 1).weekday % 7;
    final daysInMonth = DateTime(_month.year, _month.month + 1, 0).day;
    final monthLabel = DateFormat('MMMM yyyy').format(_month);

    return Padding(
      padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 24.h),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40.w,
            height: 4.h,
            decoration: BoxDecoration(
              color: ColorsManager.border,
              borderRadius: BorderRadius.circular(99.r),
            ),
          ),
          SizedBox(height: 16.h),
          Row(
            children: [
              IconButton(
                onPressed: () {
                  setState(() {
                    _month = DateTime(_month.year, _month.month - 1);
                  });
                  widget.onMonthChanged(_month);
                },
                icon: const Icon(Icons.chevron_left),
              ),
              Expanded(
                child: Text(
                  monthLabel,
                  textAlign: TextAlign.center,
                  style: TextStyles.font14RegularGrey.copyWith(
                    fontWeight: FontWeight.w700,
                    color: ColorsManager.blackColor,
                  ),
                ),
              ),
              IconButton(
                onPressed: () {
                  setState(() {
                    _month = DateTime(_month.year, _month.month + 1);
                  });
                  widget.onMonthChanged(_month);
                },
                icon: const Icon(Icons.chevron_right),
              ),
              if (widget.selectedDay != null)
                TextButton(
                  onPressed: () {
                    widget.onClear();
                    Navigator.pop(context);
                  },
                  child: const Text('Clear'),
                ),
            ],
          ),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 8.h),
            child: Row(
              children: _weekdays
                  .map(
                    (d) => Expanded(
                      child: Text(
                        d,
                        textAlign: TextAlign.center,
                        style: TextStyles.font12RegularGrey.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: firstWeekday + daysInMonth,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 1.05,
            ),
            itemBuilder: (context, index) {
              if (index < firstWeekday) return const SizedBox.shrink();
              final day = index - firstWeekday + 1;
              final date = DateTime(_month.year, _month.month, day);
              final has = widget.markedDays.contains(day);
              final selected = widget.selectedDay != null &&
                  _sameDay(widget.selectedDay!, date);
              final isToday = _sameDay(date, now);
              return InkWell(
                borderRadius: BorderRadius.circular(8.r),
                onTap: () {
                  widget.onDaySelected(selected ? null : date);
                  Navigator.pop(context);
                },
                child: Container(
                  margin: EdgeInsets.all(2.w),
                  decoration: BoxDecoration(
                    color: selected
                        ? ColorsManager.mainColor.withValues(alpha: 0.15)
                        : null,
                    border: isToday && !selected
                        ? Border.all(color: ColorsManager.mainColor, width: 1.2)
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
                              : ColorsManager.blackColor,
                          fontWeight:
                              selected || isToday ? FontWeight.bold : FontWeight.w500,
                        ),
                      ),
                      SizedBox(height: 3.h),
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
        ],
      ),
    );
  }
}
