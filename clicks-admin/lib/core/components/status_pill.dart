import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';

class StatusPillStyle {
  const StatusPillStyle({
    required this.textColor,
    required this.backgroundColor,
    this.borderColor,
  });

  final Color textColor;
  final Color backgroundColor;
  final Color? borderColor;
}

/// Job / SOS / lead / payment status pill — mirrors web JobStatusPill colors.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, this.status});

  final String label;
  final String? status;

  static StatusPillStyle styleFor(String? raw) {
    final s = (raw ?? '').toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
    switch (s) {
      case 'pending':
      case 'new':
      case 'open':
        return const StatusPillStyle(
          textColor: Color(0xFFDC6803),
          backgroundColor: Color(0xFFFEF4E6),
          borderColor: Color(0xFFFECF85),
        );
      case 'assigned':
      case 'technician_assigned':
        return const StatusPillStyle(
          textColor: Color(0xFF252525),
          backgroundColor: Color(0xFFF2F4F7),
          borderColor: Color(0xFFD0D5DD),
        );
      case 'accepted':
      case 'confirmed':
      case 'contacted':
        return const StatusPillStyle(
          textColor: Color(0xFF026AA2),
          backgroundColor: Color(0xFFF0F9FF),
          borderColor: Color(0xFF7CD4FD),
        );
      case 'in_call':
        return const StatusPillStyle(
          textColor: Color(0xFF92400E),
          backgroundColor: Color(0xFFFDE68A),
          borderColor: Color(0xFFFCD34D),
        );
      case 'claimed':
        return const StatusPillStyle(
          textColor: Color(0xFF175CD3),
          backgroundColor: Color(0xFFEFF8FF),
          borderColor: Color(0xFFB2DDFF),
        );
      case 'approved':
      case 'completed':
      case 'active':
      case 'paid':
      case 'converted':
      case 'audited':
        return const StatusPillStyle(
          textColor: Color(0xFF027A48),
          backgroundColor: Color(0xFFECFDF3),
          borderColor: Color(0xFFA7F3D0),
        );
      case 'cancelled':
      case 'canceled':
      case 'rejected':
      case 'lost':
        return const StatusPillStyle(
          textColor: Color(0xFFD92D20),
          backgroundColor: Color(0xFFFEF3F2),
          borderColor: Color(0xFFFECACA),
        );
      case 'in_progress':
        return const StatusPillStyle(
          textColor: Color(0xFFFB6514),
          backgroundColor: Color(0xFFFFF4ED),
          borderColor: Color(0xFFFDBA74),
        );
      case 'enroute':
      case 'en_route':
        return const StatusPillStyle(
          textColor: Color(0xFF175CD3),
          backgroundColor: Color(0xFFEFF6FF),
          borderColor: Color(0xFFBFDBFE),
        );
      case 'arrived':
        return const StatusPillStyle(
          textColor: Color(0xFF107569),
          backgroundColor: Color(0xFFF0FDFA),
          borderColor: Color(0xFF99F6E4),
        );
      case 'on_hold':
      case 'unpaid':
        return const StatusPillStyle(
          textColor: Color(0xFFB54708),
          backgroundColor: Color(0xFFFFFAEB),
          borderColor: Color(0xFFFEC84B),
        );
      case 'online':
        return const StatusPillStyle(
          textColor: Color(0xFF027A48),
          backgroundColor: Color(0xFFECFDF3),
          borderColor: Color(0xFFA7F3D0),
        );
      case 'on_job':
        return const StatusPillStyle(
          textColor: Color(0xFF175CD3),
          backgroundColor: Color(0xFFEFF6FF),
          borderColor: Color(0xFFBFDBFE),
        );
      case 'offline':
      case 'inactive':
      case 'expired':
        return const StatusPillStyle(
          textColor: Color(0xFF667085),
          backgroundColor: Color(0xFFF2F4F7),
          borderColor: Color(0xFFE4E7EC),
        );
      default:
        return StatusPillStyle(
          textColor: AppColors.textPrimary,
          backgroundColor: const Color(0xFFF3F4F6),
          borderColor: const Color(0xFFD1D5DB),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = styleFor(status ?? label);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: style.backgroundColor,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: style.borderColor ?? style.backgroundColor),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: AdminTypography.caption.copyWith(
          color: style.textColor,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}
