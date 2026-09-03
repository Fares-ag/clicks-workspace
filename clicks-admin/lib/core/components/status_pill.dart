import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';

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

/// Job / SOS / lead status pill — mirrors web JobStatusPill colors.
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, this.status});

  final String label;
  final String? status;

  static StatusPillStyle styleFor(String? raw) {
    final s = (raw ?? '').toLowerCase().replaceAll(' ', '_');
    switch (s) {
      case 'pending':
      case 'new':
        return const StatusPillStyle(
          textColor: Color(0xFFDC6803),
          backgroundColor: Color(0xFFFFFAEB),
          borderColor: Color(0xFFFECF85),
        );
      case 'in_call':
        return const StatusPillStyle(
          textColor: Color(0xFF92400E),
          backgroundColor: Color(0xFFFDE68A),
          borderColor: Color(0xFFFCD34D),
        );
      case 'approved':
      case 'completed':
      case 'active':
        return const StatusPillStyle(
          textColor: Color(0xFF039855),
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
      case 'enroute':
      case 'en_route':
        return const StatusPillStyle(
          textColor: Color(0xFFFB6514),
          backgroundColor: Color(0xFFFFF4ED),
          borderColor: Color(0xFFFDBA74),
        );
      case 'online':
        return const StatusPillStyle(
          textColor: Color(0xFF039855),
          backgroundColor: Color(0xFFECFDF3),
          borderColor: Color(0xFFA7F3D0),
        );
      case 'on_job':
      case 'on job':
        return const StatusPillStyle(
          textColor: Color(0xFF2563EB),
          backgroundColor: Color(0xFFEFF6FF),
          borderColor: Color(0xFFBFDBFE),
        );
      case 'offline':
      case 'inactive':
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
        borderRadius: BorderRadius.circular(AppRadii.md),
        border: Border.all(color: style.borderColor ?? style.backgroundColor),
      ),
      child: Text(
        label,
        style: AdminTypography.caption.copyWith(
          color: style.textColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
