import 'package:flutter/material.dart';

import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_spacing.dart';

/// Placeholder — matches web Calls.jsx sample page.
class CallsScreen extends StatelessWidget {
  const CallsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Calls', style: AdminTypography.pageTitle),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Call tracking integration is not configured yet. Use SOS inbox and job detail call actions for dispatch.',
            style: AdminTypography.body,
          ),
        ],
      ),
    );
  }
}
