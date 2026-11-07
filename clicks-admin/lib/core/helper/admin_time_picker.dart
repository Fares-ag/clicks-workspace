import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Ops-friendly time selection — bottom sheet with 24h wheels (no clock dial).
Future<TimeOfDay?> showAdminTimePicker(
  BuildContext context, {
  TimeOfDay? initialTime,
  String title = 'Select time',
}) async {
  final initial = initialTime ?? TimeOfDay.now();
  var picked = DateTime(2000, 1, 1, initial.hour, initial.minute);

  return showModalBottomSheet<TimeOfDay>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) {
      return SafeArea(
        child: StatefulBuilder(
          builder: (ctx, setLocal) {
            final preview = DateFormat('HH:mm').format(picked);
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Cancel'),
                      ),
                      Expanded(
                        child: Text(
                          title,
                          textAlign: TextAlign.center,
                          style: Theme.of(ctx).textTheme.titleSmall,
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(
                          ctx,
                          TimeOfDay(hour: picked.hour, minute: picked.minute),
                        ),
                        child: const Text('Done'),
                      ),
                    ],
                  ),
                  Text(
                    preview,
                    textAlign: TextAlign.center,
                    style: Theme.of(ctx).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.2,
                        ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 216,
                    child: CupertinoTheme(
                      data: CupertinoTheme.of(ctx).copyWith(
                        textTheme: CupertinoTheme.of(ctx).textTheme.copyWith(
                              dateTimePickerTextStyle: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                      ),
                      child: CupertinoDatePicker(
                        mode: CupertinoDatePickerMode.time,
                        use24hFormat: true,
                        initialDateTime: picked,
                        onDateTimeChanged: (dt) => setLocal(() => picked = dt),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );
}

/// Parses `HH:mm` from filters/API; returns null if empty or invalid.
TimeOfDay? parseAdminTimeString(String? raw) {
  final s = raw?.trim() ?? '';
  if (s.isEmpty) return null;
  final parts = s.split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return TimeOfDay(hour: h, minute: m);
}

String formatAdminTimeString(TimeOfDay time) {
  final h = time.hour.toString().padLeft(2, '0');
  final m = time.minute.toString().padLeft(2, '0');
  return '$h:$m';
}
