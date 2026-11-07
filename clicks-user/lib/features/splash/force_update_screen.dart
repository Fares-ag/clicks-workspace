import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/public_config.dart';
import '../../core/theme/colors_manager.dart';

/// Blocking "please update" screen (scenario 19). Shown when this build is
/// below `/api/config/public.min_app_version` or the API answered 426.
/// There is deliberately no way past it except updating — but the support
/// number stays reachable, since a customer may be stranded right now.
class ForceUpdateScreen extends StatelessWidget {
  const ForceUpdateScreen({super.key});

  Future<void> _openStore() async {
    final url = PublicConfig.storeUrl;
    if (url == null || url.isEmpty) return;
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.system_update, size: 72, color: ColorsManager.mainColor),
                const SizedBox(height: 24),
                Text(
                  'errors.update_required_title'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Text(
                  'errors.update_required_body'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, color: Colors.black54),
                ),
                const SizedBox(height: 32),
                if (PublicConfig.storeUrl != null)
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: _openStore,
                    child: Text('errors.update_now'.tr()),
                  ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: PublicConfig.callSupport,
                  icon: const Icon(Icons.phone),
                  label: Text('errors.call_support'.tr()),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
