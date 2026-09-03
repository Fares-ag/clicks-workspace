import 'package:flutter/material.dart';

import '../../core/socket/admin_socket_service.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_decorations.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/components/primary_button.dart';

class DispatchNotificationOverlay extends StatelessWidget {
  const DispatchNotificationOverlay({
    super.key,
    required this.event,
    required this.queueCount,
    required this.onDismiss,
    required this.onAction,
  });

  final AdminSocketEvent event;
  final int queueCount;
  final VoidCallback onDismiss;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: AppSpacing.lg,
      right: AppSpacing.lg,
      bottom: AppSpacing.lg,
      child: Material(
        elevation: 12,
        shadowColor: const Color(0x40101828),
        borderRadius: BorderRadius.circular(AppRadii.xl),
        color: Colors.transparent,
        child: Container(
          decoration: AppDecorations.card().copyWith(
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
          ),
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.navHighlight,
                      borderRadius: BorderRadius.circular(AppRadii.md),
                    ),
                    child: Icon(_icon, color: AppColors.primary, size: 22),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_title, style: AdminTypography.heading),
                        Text(
                          _subtitle,
                          style: AdminTypography.caption.copyWith(
                            color: AppColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (queueCount > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.pageBackground,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '+${queueCount - 1}',
                        style: AdminTypography.caption.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: PrimaryButton(
                      label: 'Dismiss',
                      outlined: true,
                      onPressed: onDismiss,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: PrimaryButton(
                      label: _actionLabel,
                      onPressed: onAction,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData get _icon {
    switch (event.type) {
      case AdminNotificationType.sos:
        return Icons.emergency;
      case AdminNotificationType.serviceRequest:
        return Icons.inbox_outlined;
      default:
        return Icons.notifications_active_outlined;
    }
  }

  String get _title {
    switch (event.type) {
      case AdminNotificationType.sos:
        return 'New SOS request';
      case AdminNotificationType.serviceRequest:
        return 'New service request';
      case AdminNotificationType.businessLead:
        return 'New business lead';
      case AdminNotificationType.businessJob:
        return 'New business job';
      case AdminNotificationType.technicianJob:
        return 'New technician job';
    }
  }

  String get _subtitle {
    final customer = event.data['customer'];
    if (customer is Map) {
      final name =
          '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim();
      if (name.isNotEmpty) return name;
    }
    return 'Tap to review';
  }

  String get _actionLabel {
    switch (event.type) {
      case AdminNotificationType.sos:
        return 'Create job';
      case AdminNotificationType.serviceRequest:
        return 'Add lead';
      case AdminNotificationType.businessLead:
        return 'Convert';
      default:
        return 'Open';
    }
  }
}
