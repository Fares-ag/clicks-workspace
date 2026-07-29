import 'package:bloc/bloc.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kDebugMode;

import '../../../core/api/dio_helper.dart';
import '../../../core/api/end_points.dart';
import '../models/notification_model.dart';

part 'notifications_state.dart';

void _log(String msg) {
  if (kDebugMode) {
    // ignore: avoid_print
    print(msg);
  }
}

class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit() : super(NotificationsInitial());

  List<NotificationModel> _notifications = [];
  int _unreadCount = 0;
  int _currentPage = 1;
  int _totalPages = 1;

  /// Fetch notifications (page 1 by default, or load more)
  Future<void> fetchNotifications({int page = 1}) async {
    if (page == 1) {
      emit(NotificationsLoading());
    }

    try {
      final response = await DioHelper.getData(
        url: EndPoints.notifications,
        query: {'page': page, 'limit': 20},
        auth: true,
      );

      if (response.statusCode == 200) {
        final data = response.data;
        final List<dynamic> list = data['notifications'] ?? [];
        final parsed = list
            .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
            .toList();

        final pagination = data['pagination'] ?? {};
        _currentPage = pagination['page'] ?? 1;
        _totalPages = pagination['pages'] ?? 1;
        _unreadCount = data['count'] ?? data['unreadCount'] ?? 0;

        if (page == 1) {
          _notifications = parsed;
        } else {
          _notifications = [..._notifications, ...parsed];
        }

        emit(NotificationsLoaded(
          notifications: _notifications,
          unreadCount: _unreadCount,
          currentPage: _currentPage,
          totalPages: _totalPages,
        ));
      } else {
        emit(NotificationsError(
          response.data?['message'] ?? 'notifications.failed_to_load'.tr(),
        ));
      }
    } catch (e) {
      emit(NotificationsError('notifications.failed_to_load'.tr()));
    }
  }

  /// Load more (next page)
  Future<void> loadMore() async {
    if (_currentPage < _totalPages) {
      await fetchNotifications(page: _currentPage + 1);
    }
  }

  /// Mark all notifications as read
  Future<void> markAllRead() async {
    try {
      await DioHelper.postData(
        url: EndPoints.notificationsMarkAllRead,
        data: {},
        auth: true,
      );

      // Update local state
      _notifications = _notifications.map((n) {
        return NotificationModel(
          id: n.id,
          customerId: n.customerId,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: true,
          createdAt: n.createdAt,
          data: n.data,
        );
      }).toList();
      _unreadCount = 0;

      emit(NotificationsLoaded(
        notifications: _notifications,
        unreadCount: _unreadCount,
        currentPage: _currentPage,
        totalPages: _totalPages,
      ));
    } catch (e) {
      _log('⚠️ Failed to mark all as read: $e');
    }
  }

  /// Mark a single notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await DioHelper.patchData(
        url: '${EndPoints.notifications}/$notificationId/read',
        data: {},
        auth: true,
      );

      // Update local state
      _notifications = _notifications.map((n) {
        if (n.id == notificationId) {
          return NotificationModel(
            id: n.id,
            customerId: n.customerId,
            title: n.title,
            message: n.message,
            type: n.type,
            isRead: true,
            createdAt: n.createdAt,
            data: n.data,
          );
        }
        return n;
      }).toList();
      if (_unreadCount > 0) _unreadCount--;

      emit(NotificationsLoaded(
        notifications: _notifications,
        unreadCount: _unreadCount,
        currentPage: _currentPage,
        totalPages: _totalPages,
      ));
    } catch (e) {
      _log('⚠️ Failed to mark notification as read: $e');
    }
  }

  /// Delete all notifications
  Future<void> clearAll() async {
    try {
      await DioHelper.deleteData(
        url: '${EndPoints.notifications}/clear-all',
        auth: true,
      );

      _notifications = [];
      _unreadCount = 0;
      _currentPage = 1;
      _totalPages = 1;

      emit(NotificationsLoaded(
        notifications: _notifications,
        unreadCount: _unreadCount,
        currentPage: _currentPage,
        totalPages: _totalPages,
      ));
    } catch (e) {
      _log('⚠️ Failed to clear notifications: $e');
    }
  }

  /// Fetch unread count only (lightweight)
  Future<int> fetchUnreadCount() async {
    try {
      final response = await DioHelper.getData(
        url: EndPoints.notificationsUnreadCount,
        auth: true,
      );
      if (response.statusCode == 200) {
        _unreadCount =
            response.data['count'] ?? response.data['unreadCount'] ?? 0;
        return _unreadCount;
      }
    } catch (_) {}
    return _unreadCount;
  }
}
