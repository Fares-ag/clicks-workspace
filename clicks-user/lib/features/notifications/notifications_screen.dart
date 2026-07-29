import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'cubit/notifications_cubit.dart';
import 'models/notification_model.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => NotificationsCubit()..fetchNotifications(),
      child: const _NotificationsBody(),
    );
  }
}

class _NotificationsBody extends StatelessWidget {
  const _NotificationsBody();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(16.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'notifications.notifications'.tr(),
                    style: TextStyle(
                      fontSize: 20.sp,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Row(
                    children: [
                      // Mark all read
                      BlocBuilder<NotificationsCubit, NotificationsState>(
                        builder: (context, state) {
                          if (state is NotificationsLoaded &&
                              state.unreadCount > 0) {
                            return IconButton(
                              onPressed: () {
                                context
                                    .read<NotificationsCubit>()
                                    .markAllRead();
                              },
                              icon: Icon(Icons.done_all,
                                  size: 24, color: Colors.blue),
                              tooltip: 'notifications.mark_all_read'.tr(),
                            );
                          }
                          return const SizedBox.shrink();
                        },
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close, size: 26),
                      ),
                    ],
                  ),
                ],
              ),
              Divider(height: 20.h, thickness: 1),

              // Content
              Expanded(
                child: BlocBuilder<NotificationsCubit, NotificationsState>(
                  builder: (context, state) {
                    if (state is NotificationsLoading) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    if (state is NotificationsError) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.error_outline,
                                size: 48.sp, color: Colors.grey),
                            SizedBox(height: 12.h),
                            Text(state.message,
                                style: TextStyle(
                                    fontSize: 14.sp, color: Colors.grey)),
                            SizedBox(height: 16.h),
                            TextButton(
                              onPressed: () => context
                                  .read<NotificationsCubit>()
                                  .fetchNotifications(),
                              child: Text('common.retry'.tr()),
                            ),
                          ],
                        ),
                      );
                    }

                    if (state is NotificationsLoaded) {
                      if (state.notifications.isEmpty) {
                        return Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.notifications_off_outlined,
                                  size: 64.sp, color: Colors.grey.shade300),
                              SizedBox(height: 16.h),
                              Text(
                                'notifications.no_notifications'.tr(),
                                style: TextStyle(
                                  fontSize: 16.sp,
                                  color: Colors.grey.shade500,
                                ),
                              ),
                              SizedBox(height: 8.h),
                              Text(
                                'notifications.no_notifications_subtitle'.tr(),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 13.sp,
                                  color: Colors.grey.shade400,
                                ),
                              ),
                            ],
                          ),
                        );
                      }

                      return RefreshIndicator(
                        onRefresh: () => context
                            .read<NotificationsCubit>()
                            .fetchNotifications(),
                        child: NotificationListener<ScrollNotification>(
                          onNotification: (scrollInfo) {
                            if (scrollInfo.metrics.pixels >=
                                scrollInfo.metrics.maxScrollExtent - 100) {
                              context.read<NotificationsCubit>().loadMore();
                            }
                            return false;
                          },
                          child: ListView.builder(
                            itemCount: state.notifications.length,
                            itemBuilder: (context, index) {
                              final notif = state.notifications[index];
                              return _NotificationTile(
                                notification: notif,
                                onTap: () {
                                  if (!notif.isRead) {
                                    context
                                        .read<NotificationsCubit>()
                                        .markAsRead(notif.id);
                                  }
                                },
                              );
                            },
                          ),
                        ),
                      );
                    }

                    return const SizedBox.shrink();
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationTile({
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: EdgeInsets.symmetric(vertical: 4.h),
        padding: EdgeInsets.all(12.w),
        decoration: BoxDecoration(
          color: notification.isRead
              ? Colors.transparent
              : Colors.blue.shade50.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Icon
            Container(
              width: 40.w,
              height: 40.w,
              decoration: BoxDecoration(
                color: _iconColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(_icon, color: _iconColor, size: 20.sp),
            ),
            SizedBox(width: 12.w),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          notification.title,
                          style: TextStyle(
                            fontSize: 15.sp,
                            fontWeight: notification.isRead
                                ? FontWeight.w500
                                : FontWeight.bold,
                          ),
                        ),
                      ),
                      if (!notification.isRead)
                        Container(
                          width: 8.w,
                          height: 8.w,
                          decoration: const BoxDecoration(
                            color: Colors.blue,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  SizedBox(height: 4.h),
                  Text(
                    notification.message,
                    style: TextStyle(
                      fontSize: 13.sp,
                      color: Colors.grey.shade700,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  SizedBox(height: 6.h),
                  Text(
                    _formatTime(notification.createdAt),
                    style: TextStyle(
                      fontSize: 11.sp,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData get _icon {
    switch (notification.type) {
      case 'technician_assigned':
        return Icons.person_pin;
      case 'en_route':
        return Icons.directions_car;
      case 'arrived':
        return Icons.location_on;
      case 'in_progress':
        return Icons.build;
      case 'job_completed':
        return Icons.check_circle;
      case 'payment_received':
        return Icons.payment;
      case 'sos_created':
        return Icons.emergency;
      case 'sos_update':
        return Icons.update;
      default:
        return Icons.notifications;
    }
  }

  Color get _iconColor {
    switch (notification.type) {
      case 'technician_assigned':
        return Colors.blue;
      case 'en_route':
        return Colors.orange;
      case 'arrived':
        return Colors.green;
      case 'in_progress':
        return Colors.amber.shade700;
      case 'job_completed':
        return Colors.green.shade700;
      case 'payment_received':
        return Colors.teal;
      case 'sos_created':
        return Colors.red;
      case 'sos_update':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  String _formatTime(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inMinutes < 1) return 'notifications.just_now'.tr();
    if (diff.inMinutes < 60) return 'notifications.min_ago'.tr(namedArgs: {'count': '${diff.inMinutes}'});
    if (diff.inHours < 24) return 'notifications.hours_ago'.tr(namedArgs: {'count': '${diff.inHours}'});
    if (diff.inDays < 7) return 'notifications.days_ago'.tr(namedArgs: {'count': '${diff.inDays}'});

    return DateFormat('MMM d, yyyy').format(dateTime);
  }
}
