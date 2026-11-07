import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../core/api/auth_session.dart';
import '../../core/config/public_config.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/routing/routes.dart';
import '../../core/services/fcm_notification_service.dart';
import '../../core/theme/colors_manager.dart';

/// "Your account is not active — contact support" (scenario 14). Shown for
/// 403 ACCOUNT_INACTIVE from REST, a rejected socket handshake, or a live
/// admin block. The socket is already disconnected by then.
class AccountInactiveScreen extends StatelessWidget {
  const AccountInactiveScreen({super.key});

  Future<void> _signOut(BuildContext context) async {
    await CacheHelper.clear();
    try {
      await FCMNotificationService.instance.deleteToken().timeout(const Duration(seconds: 5));
    } catch (_) {}
    AuthSession.resetGuards();
    if (context.mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil(Routes.login, (_) => false);
    }
  }

  void _retry(BuildContext context) {
    AuthSession.resetGuards();
    Navigator.of(context).pushNamedAndRemoveUntil(Routes.splash, (_) => false);
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
                Icon(Icons.block, size: 72, color: ColorsManager.mainColor),
                const SizedBox(height: 24),
                Text(
                  'errors.account_inactive_title'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                Text(
                  'errors.ACCOUNT_INACTIVE'.tr(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 15, color: Colors.black54),
                ),
                const SizedBox(height: 32),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: ColorsManager.mainColor,
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: PublicConfig.callSupport,
                  icon: const Icon(Icons.phone),
                  label: Text('errors.call_support'.tr()),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _retry(context),
                  child: Text('common.retry'.tr()),
                ),
                TextButton(
                  onPressed: () => _signOut(context),
                  child: Text('settings.logout'.tr()),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
