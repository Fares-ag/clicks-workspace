import 'package:flutter/material.dart';

import '../theme/admin_typography.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import 'primary_button.dart';

/// Page header matching `.admin-page` layout.
class AdminPageScaffold extends StatelessWidget {
  const AdminPageScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions,
    this.subtitle,
  });

  final String title;
  final Widget body;
  final List<Widget>? actions;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AdminTypography.pageTitle),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(subtitle!, style: AdminTypography.caption),
                    ],
                  ],
                ),
              ),
              if (actions != null) ...actions!,
            ],
          ),
        ),
        Expanded(child: body),
      ],
    );
  }
}

/// Form section header used in job/lead forms.
class AdminFormSection extends StatelessWidget {
  const AdminFormSection({
    super.key,
    required this.title,
    required this.children,
  });

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: AdminTypography.heading),
        const SizedBox(height: AppSpacing.sm),
        const Divider(height: 1, color: AppColors.border),
        const SizedBox(height: AppSpacing.md),
        ...children,
      ],
    );
  }
}

class AdminFormActions extends StatelessWidget {
  const AdminFormActions({
    super.key,
    required this.onCancel,
    required this.onSave,
    this.saveLabel = 'Save',
    this.loading = false,
  });

  final VoidCallback onCancel;
  final VoidCallback onSave;
  final String saveLabel;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: PrimaryButton(
            label: 'Cancel',
            outlined: true,
            onPressed: loading ? null : onCancel,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: PrimaryButton(
            label: saveLabel,
            loading: loading,
            onPressed: loading ? null : onSave,
          ),
        ),
      ],
    );
  }
}

class AdminLabeledField extends StatelessWidget {
  const AdminLabeledField({
    super.key,
    required this.label,
    required this.child,
    this.required = false,
    this.error,
  });

  final String label;
  final Widget child;
  final bool required;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            required ? '$label*' : label,
            style: AdminTypography.label,
          ),
          const SizedBox(height: 6),
          child,
          if (error != null && error!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                error!,
                style: AdminTypography.caption.copyWith(color: AppColors.danger),
              ),
            ),
        ],
      ),
    );
  }
}
