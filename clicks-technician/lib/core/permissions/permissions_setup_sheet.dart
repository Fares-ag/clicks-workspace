import 'package:clicks_technician/core/permissions/background_location_disclosure.dart';
import 'package:clicks_technician/core/permissions/technician_permissions.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Guided step-by-step permission wizard. Re-checks on resume after Settings.
class PermissionsSetupSheet extends StatefulWidget {
  const PermissionsSetupSheet({
    super.key,
    required this.steps,
    this.onComplete,
  });

  final List<PermissionSetupStep> steps;
  final VoidCallback? onComplete;

  /// Shows the wizard when anything required is missing. Returns true if ready.
  static Future<bool> showIfNeeded(BuildContext context) async {
    final missing = await TechnicianPermissions.missingSteps();
    if (missing.isEmpty) return true;
    if (!context.mounted) return false;

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => PermissionsSetupSheet(steps: missing),
    );
    return result == true;
  }

  @override
  State<PermissionsSetupSheet> createState() => _PermissionsSetupSheetState();
}

class _PermissionsSetupSheetState extends State<PermissionsSetupSheet>
    with WidgetsBindingObserver {
  late int _index;
  bool _busy = false;

  PermissionSetupStep get _current => widget.steps[_index];

  @override
  void initState() {
    super.initState();
    _index = 0;
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _recheckAfterExternalSettings();
    }
  }

  Future<void> _recheckAfterExternalSettings() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      if (!await _ensureBackgroundLocationDisclosure()) {
        return;
      }
      final ok = await TechnicianPermissions.runStep(_current);
      if (!mounted) return;
      if (ok) {
        _advanceOrFinish();
      } else {
        setState(() {});
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _advanceOrFinish() {
    if (_index + 1 >= widget.steps.length) {
      widget.onComplete?.call();
      Navigator.of(context).pop(true);
      return;
    }
    setState(() => _index += 1);
  }

  Future<bool> _ensureBackgroundLocationDisclosure() async {
    if (_current != PermissionSetupStep.locationAlways) return true;
    return BackgroundLocationDisclosure.ensureAccepted(context);
  }

  Future<void> _onPrimaryPressed() async {
    setState(() => _busy = true);
    try {
      if (!await _ensureBackgroundLocationDisclosure()) {
        return;
      }
      final ok = await TechnicianPermissions.runStep(_current);
      if (!mounted) return;
      if (ok) {
        _advanceOrFinish();
      } else if (_current.opensExternalSettings) {
        // User was sent to Settings — wait for resume to re-check.
        setState(() {});
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  IconData _iconFor(PermissionSetupStep step) {
    switch (step) {
      case PermissionSetupStep.notifications:
        return Icons.notifications_active_outlined;
      case PermissionSetupStep.locationAlways:
        return Icons.location_on_outlined;
      case PermissionSetupStep.doNotDisturb:
        return Icons.do_not_disturb_off_outlined;
      case PermissionSetupStep.fullScreenAlerts:
        return Icons.lock_open_outlined;
      case PermissionSetupStep.battery:
        return Icons.battery_charging_full_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final step = _current;
    final total = widget.steps.length;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(24.w, 12.h, 24.w, 24.h),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40.w,
                height: 4.h,
                decoration: BoxDecoration(
                  color: ColorsManager.border,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            SizedBox(height: 16.h),
            Text(
              'Setup required',
              style: TextStyles.font12RegularGrey.copyWith(
                color: ColorsManager.mainColor,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 4.h),
            Text(
              'Step ${_index + 1} of $total',
              style: TextStyles.font12RegularGrey,
            ),
            SizedBox(height: 20.h),
            Icon(_iconFor(step), size: 44.sp, color: ColorsManager.mainColor),
            SizedBox(height: 16.h),
            Text(
              step.title,
              style: TextStyles.font16RegularBlack.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: 10.h),
            Text(
              step.body,
              style: TextStyles.font14RegularGrey.copyWith(
                color: Colors.black87,
                height: 1.45,
              ),
            ),
            if (_busy) ...[
              SizedBox(height: 20.h),
              const Center(child: CircularProgressIndicator()),
            ],
            SizedBox(height: 24.h),
            FilledButton(
              onPressed: _busy ? null : _onPrimaryPressed,
              style: FilledButton.styleFrom(
                backgroundColor: ColorsManager.mainColor,
                padding: EdgeInsets.symmetric(vertical: 14.h),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10.r),
                ),
              ),
              child: Text(
                step.actionLabel,
                style: TextStyles.font14RegularGrey.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (step.opensExternalSettings) ...[
              SizedBox(height: 8.h),
              Text(
                'Return here after changing the setting — we\'ll continue automatically.',
                textAlign: TextAlign.center,
                style: TextStyles.font12RegularGrey,
              ),
            ],
            TextButton(
              onPressed: _busy ? null : () => Navigator.of(context).pop(false),
              child: Text(
                'Not now',
                style: TextStyles.font14RegularGrey,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
