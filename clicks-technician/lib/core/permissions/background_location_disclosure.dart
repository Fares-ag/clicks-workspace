import 'dart:io' show Platform;

import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Google Play prominent disclosure before background location permission.
class BackgroundLocationDisclosure {
  BackgroundLocationDisclosure._();

  static const _prefKey = 'background_location_disclosure_accepted_v1';

  static Future<bool> hasAccepted() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_prefKey) ?? false;
  }

  static Future<void> _markAccepted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, true);
  }

  /// Shows the disclosure when needed. Returns true if the user agreed.
  static Future<bool> ensureAccepted(BuildContext context) async {
    if (kIsWeb || !Platform.isAndroid) return true;
    if (await hasAccepted()) return true;
    if (!context.mounted) return false;
    return show(context);
  }

  /// Blocking dialog — must be shown before any background location request.
  static Future<bool> show(BuildContext context) async {
    if (kIsWeb || !Platform.isAndroid) return true;

    final accepted = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const _BackgroundLocationDisclosureDialog(),
    );

    if (accepted == true) {
      await _markAccepted();
      return true;
    }
    return false;
  }
}

class _BackgroundLocationDisclosureDialog extends StatelessWidget {
  const _BackgroundLocationDisclosureDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      scrollable: true,
      title: Text(
        'Background location access',
        style: TextStyles.font16RegularBlack.copyWith(
          fontWeight: FontWeight.bold,
        ),
      ),
      content: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Clicks Technician collects your device\'s precise location, '
            'including when the app is closed or not in use, while your status '
            'is Online or you have an active job.',
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              height: 1.45,
            ),
          ),
          SizedBox(height: 12.h),
          Text(
            'We use location data to:',
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              fontWeight: FontWeight.w600,
            ),
          ),
          SizedBox(height: 6.h),
          ...[
            'Show your position on the dispatch Live Map',
            'Assign and route you to nearby jobs',
            'Confirm arrival and job start when required',
          ].map(
            (line) => Padding(
              padding: EdgeInsets.only(bottom: 4.h),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('• ', style: TextStyles.font14RegularGrey),
                  Expanded(
                    child: Text(
                      line,
                      style: TextStyles.font14RegularGrey.copyWith(
                        color: Colors.black87,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          SizedBox(height: 12.h),
          Text(
            'Your live location is shared with Clicks operations staff and, '
            'during an active job, with the customer for that job. We do not sell '
            'your location data.',
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              height: 1.45,
            ),
          ),
          SizedBox(height: 12.h),
          Text(
            'You can stop background collection at any time by going Offline or '
            'revoking location permission in your device Settings.',
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              height: 1.45,
            ),
          ),
          SizedBox(height: 8.h),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () {
                Navigator.of(context).pop(false);
                context.toNamed(Routes.privacyPolicy);
              },
              style: TextButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(
                'View Privacy Policy',
                style: TextStyles.font14RegularGrey.copyWith(
                  color: ColorsManager.mainColor,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Not now'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(true),
          style: FilledButton.styleFrom(
            backgroundColor: ColorsManager.mainColor,
          ),
          child: const Text('Agree'),
        ),
      ],
    );
  }
}
