import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/view/notifications_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Compact Figma notifications panel (bell → popup; See all → full page).
Future<void> showNotificationsPopup(BuildContext context) async {
  await showDialog<void>(
    context: context,
    barrierColor: Colors.black54,
    builder: (ctx) => const _NotificationsPopup(),
  );
}

class _NotificationsPopup extends StatefulWidget {
  const _NotificationsPopup();

  @override
  State<_NotificationsPopup> createState() => _NotificationsPopupState();
}

class _NotificationsPopupState extends State<_NotificationsPopup> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res =
          await DioHelper.getData(url: EndPoints.technicianNotifications);
      if (res.statusCode == 200) {
        final raw = res.data['notifications'];
        _items = raw is List
            ? raw
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : [];
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      alignment: Alignment.topCenter,
      insetPadding: EdgeInsets.fromLTRB(16.w, 72.h, 16.w, 24.h),
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16.r)),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: 360.h, maxWidth: 400.w),
        child: Padding(
          padding: EdgeInsets.all(16.w),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Notifications',
                      style: TextStyles.font16RegularBlack
                          .copyWith(fontWeight: FontWeight.bold),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
              SizedBox(height: 8.h),
              if (_loading)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 40.h),
                  child: Center(
                    child: CircularProgressIndicator(
                        color: ColorsManager.mainColor),
                  ),
                )
              else if (_items.isEmpty)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 36.h),
                  child: Column(
                    children: [
                      Icon(Icons.notifications_none_rounded,
                          size: 40.sp, color: ColorsManager.greyColor),
                      SizedBox(height: 8.h),
                      Text('No in-app history yet',
                          style: TextStyles.font14RegularGrey),
                      SizedBox(height: 6.h),
                      Text(
                        'New job assignments are delivered via push notifications.',
                        textAlign: TextAlign.center,
                        style: TextStyles.font12RegularGrey,
                      ),
                    ],
                  ),
                )
              else
                Flexible(
                  child: ListView.separated(
                    shrinkWrap: true,
                    itemCount: _items.take(5).length,
                    separatorBuilder: (_, __) => SizedBox(height: 8.h),
                    itemBuilder: (_, i) {
                      final n = _items[i];
                      return Container(
                        padding: EdgeInsets.all(12.w),
                        decoration: BoxDecoration(
                          color: ColorsManager.scaffoldColor,
                          borderRadius: BorderRadius.circular(10.r),
                        ),
                        child: Text(
                          n['title']?.toString() ?? 'Notification',
                          style: TextStyles.font14RegularGrey.copyWith(
                            color: Colors.black87,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              SizedBox(height: 12.h),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const NotificationsScreen()),
                  );
                },
                child: Text(
                  'See all',
                  style: TextStyle(
                    color: ColorsManager.mainColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
