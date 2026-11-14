import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/components/clicks_card.dart';
import 'package:clicks_user/core/components/header_icon_button.dart';
import 'package:clicks_user/core/services/customer_notification_router.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
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
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        title: 'notifications.notifications'.tr(),
        automaticallyImplyLeading: true,
        actions: [
          BlocBuilder<NotificationsCubit, NotificationsState>(
            builder: (context, state) {
              if (state is NotificationsLoaded && state.unreadCount > 0) {
                return HeaderIconButton(
                  icon: Icons.done_all,
                  semanticsLabel: 'notifications.mark_all_read'.tr(),
                  onTap: () => context.read<NotificationsCubit>().markAllRead(),
                );
              }
              return const SizedBox.shrink();
            },
          ),
        ],
      ),
      body: BlocBuilder<NotificationsCubit, NotificationsState>(
        builder: (context, state) {
          if (state is NotificationsLoading) {
            return Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            );
          }

          if (state is NotificationsError) {
            return Center(
              child: Padding(
                padding: EdgeInsets.all(24.w),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 48.sp,
                      color: ColorsManager.greyColor,
                    ),
                    SizedBox(height: 12.h),
                    Text(
                      state.message,
                      style: TextStyles.font14RegularGrey,
                      textAlign: TextAlign.center,
                    ),
                    SizedBox(height: 16.h),
                    TextButton(
                      onPressed: () =>
                          context.read<NotificationsCubit>().fetchNotifications(),
                      child: Text('common.retry'.tr()),
                    ),
                  ],
                ),
              ),
            );
          }

          if (state is NotificationsLoaded) {
            if (state.notifications.isEmpty) {
              return Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 32.w),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.notifications_none_outlined,
                        size: 56.sp,
                        color: ColorsManager.hintColor,
                      ),
                      SizedBox(height: 16.h),
                      Text(
                        'notifications.no_notifications'.tr(),
                        style: TextStyles.font16RegularBlack.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      SizedBox(height: 8.h),
                      Text(
                        'notifications.no_notifications_subtitle'.tr(),
                        textAlign: TextAlign.center,
                        style: TextStyles.font14RegularGrey,
                      ),
                    ],
                  ),
                ),
              );
            }

            return RefreshIndicator(
              color: ColorsManager.mainColor,
              onRefresh: () =>
                  context.read<NotificationsCubit>().fetchNotifications(),
              child: NotificationListener<ScrollNotification>(
                onNotification: (scrollInfo) {
                  if (scrollInfo.metrics.pixels >=
                      scrollInfo.metrics.maxScrollExtent - 100) {
                    context.read<NotificationsCubit>().loadMore();
                  }
                  return false;
                },
                child: ListView.separated(
                  padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 24.h),
                  itemCount: state.notifications.length,
                  separatorBuilder: (_, __) => SizedBox(height: 12.h),
                  itemBuilder: (context, index) {
                    final notif = state.notifications[index];
                    return _NotificationCard(
                      notification: notif,
                      onTap: () {
                        if (!notif.isRead) {
                          context.read<NotificationsCubit>().markAsRead(notif.id);
                        }
                        final data = notif.data ?? const {};
                        if ((data['job_id'] ?? '').toString().isNotEmpty ||
                            (data['sos_id'] ?? '').toString().isNotEmpty ||
                            data['kind'] == 'support_ticket') {
                          CustomerNotificationRouter.handleTap({
                            ...data,
                            'event': data['event'] ?? notif.type,
                          });
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
    );
  }
}

class _NotificationCard extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;

  const _NotificationCard({
    required this.notification,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final unread = !notification.isRead;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12.r),
        child: Ink(
          decoration: BoxDecoration(
            color: unread ? ColorsManager.wash : ColorsManager.card,
            borderRadius: BorderRadius.circular(12.r),
            border: Border.all(
              color: unread
                  ? ColorsManager.washBorder
                  : ColorsManager.cardBorder,
            ),
          ),
          padding: EdgeInsets.all(14.w),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClicksIconWell(
                icon: _icon,
                foreground: _iconColor,
                size: 44,
              ),
              SizedBox(width: 12.w),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            notification.title,
                            style: TextStyles.font16RegularBlack.copyWith(
                              fontWeight:
                                  unread ? FontWeight.w700 : FontWeight.w500,
                              fontSize: 15.sp,
                              color: ColorsManager.blackColor,
                            ),
                          ),
                        ),
                        if (unread) ...[
                          SizedBox(width: 8.w),
                          Container(
                            width: 8.w,
                            height: 8.w,
                            margin: EdgeInsets.only(top: 6.h),
                            decoration: const BoxDecoration(
                              color: ColorsManager.mainColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ],
                    ),
                    SizedBox(height: 4.h),
                    Text(
                      notification.message,
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: ColorsManager.greyColor,
                        height: 1.35,
                      ),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                    SizedBox(height: 8.h),
                    Text(
                      _formatTime(notification.createdAt),
                      style: TextStyles.font12RegularGrey,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData get _icon {
    switch (notification.type) {
      case 'technician_assigned':
        return Icons.person_pin_outlined;
      case 'en_route':
        return Icons.directions_car_outlined;
      case 'arrived':
        return Icons.location_on_outlined;
      case 'in_progress':
        return Icons.build_outlined;
      case 'job_completed':
        return Icons.check_circle_outline;
      case 'payment_received':
        return Icons.payments_outlined;
      case 'sos_created':
        return Icons.emergency_outlined;
      case 'sos_update':
        return Icons.update;
      default:
        return Icons.notifications_none_outlined;
    }
  }

  Color get _iconColor {
    switch (notification.type) {
      case 'technician_assigned':
        return ColorsManager.mainColor;
      case 'en_route':
        return ColorsManager.progressOrangeColor;
      case 'arrived':
        return ColorsManager.green;
      case 'in_progress':
        return ColorsManager.progressOrangeColor;
      case 'job_completed':
        return ColorsManager.progressGreenColor;
      case 'payment_received':
        return ColorsManager.green;
      case 'sos_created':
        return ColorsManager.mainColor;
      case 'sos_update':
        return ColorsManager.mainColor;
      default:
        return ColorsManager.greyColor;
    }
  }

  String _formatTime(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inMinutes < 1) return 'notifications.just_now'.tr();
    if (diff.inMinutes < 60) {
      return 'notifications.min_ago'
          .tr(namedArgs: {'count': '${diff.inMinutes}'});
    }
    if (diff.inHours < 24) {
      return 'notifications.hours_ago'
          .tr(namedArgs: {'count': '${diff.inHours}'});
    }
    if (diff.inDays < 7) {
      return 'notifications.days_ago'.tr(namedArgs: {'count': '${diff.inDays}'});
    }

    return DateFormat('d MMM yyyy, HH:mm').format(dateTime.toLocal());
  }
}