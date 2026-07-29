import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Thin technician notification inbox (GET /api/notifications/technician).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];

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
      final res = await DioHelper.getData(url: EndPoints.technicianNotifications);
      if (res.statusCode == 200) {
        final raw = res.data['notifications'];
        _items = raw is List
            ? raw
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList()
            : [];
        await DioHelper.postData(
          url: EndPoints.technicianNotificationsMarkRead,
          data: {},
        );
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load notifications';
      }
    } catch (_) {
      _error = 'Failed to load notifications';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Notifications',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: RefreshIndicator(
        color: ColorsManager.mainColor,
        onRefresh: _load,
        child: _loading
            ? ListView(
                children: [
                  SizedBox(height: 120.h),
                  Center(
                    child: CircularProgressIndicator(
                        color: ColorsManager.mainColor),
                  ),
                ],
              )
            : _error != null
                ? ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.all(16.w),
                    children: [
                      SizedBox(height: 80.h),
                      Text(_error!,
                          textAlign: TextAlign.center,
                          style: TextStyles.font14RegularGrey),
                      TextButton(
                        onPressed: _load,
                        child: Text('Retry',
                            style: TextStyle(color: ColorsManager.mainColor)),
                      ),
                    ],
                  )
                : _items.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [
                          SizedBox(height: 120.h),
                          Icon(Icons.notifications_none_rounded,
                              size: 48.sp, color: ColorsManager.greyColor),
                          SizedBox(height: 12.h),
                          Text(
                            'No notifications yet',
                            textAlign: TextAlign.center,
                            style: TextStyles.font14RegularGrey,
                          ),
                        ],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.all(16.w),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => SizedBox(height: 10.h),
                        itemBuilder: (_, i) {
                          final n = _items[i];
                          final title = n['title']?.toString() ?? 'Notification';
                          final body = n['body']?.toString() ?? '';
                          return Container(
                            padding: EdgeInsets.all(14.w),
                            decoration: BoxDecoration(
                              color: ColorsManager.scaffoldColor,
                              borderRadius: BorderRadius.circular(10.r),
                              border: Border.all(color: ColorsManager.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: TextStyles.font14RegularGrey.copyWith(
                                    color: Colors.black87,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                if (body.isNotEmpty) ...[
                                  SizedBox(height: 4.h),
                                  Text(body, style: TextStyles.font12RegularGrey),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
