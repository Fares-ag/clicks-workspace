import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:easy_localization/easy_localization.dart';

class NotificationModel {
  final String id;
  final String customerId;
  final String title;
  final String message;
  final String type;
  final bool isRead;
  final DateTime createdAt;
  final Map<String, dynamic>? data;

  NotificationModel({
    required this.id,
    required this.customerId,
    required this.title,
    required this.message,
    required this.type,
    required this.isRead,
    required this.createdAt,
    this.data,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['_id'] ?? json['id'] ?? '',
      customerId: json['customer_id']?.toString() ?? '',
      title: json['title'] ?? '',
      message: json['body'] ?? json['message'] ?? '',
      type: json['type'] ?? '',
      isRead: json['read'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      data: json['data'] is Map<String, dynamic> ? json['data'] : null,
    );
  }

  /// Human-readable label for the notification type
  String get typeLabel {
    switch (type) {
      case 'technician_assigned':
        return JobStatusLabels.labelFor('assigned');
      case 'en_route':
        return JobStatusLabels.labelFor('en_route');
      case 'arrived':
        return JobStatusLabels.labelFor('arrived');
      case 'in_progress':
        return JobStatusLabels.labelFor('in_progress');
      case 'job_completed':
        return JobStatusLabels.labelFor('completed');
      case 'payment_received':
        return 'notifications.notifications'.tr();
      case 'sos_update':
        return 'notifications.notifications'.tr();
      case 'sos_created':
        return 'notifications.notifications'.tr();
      default:
        return 'notifications.notifications'.tr();
    }
  }
}
