import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/cache_helper.dart';
import 'package:clicks_user/core/services/fcm_notification_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/features/my_cars/my_cars_screen.dart';
import 'package:clicks_user/features/settings/ui/cubit/settings_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/components/app_button.dart';
import '../../../../core/helper/assets_manager.dart';
import '../../../../core/helper/extensions.dart';
import '../../../../core/routing/routes.dart';
import '../../../../core/theme/colors_manager.dart';
import '../../../../features/settings/ui/view/contact_us_screen.dart';
import '../../../../features/settings/ui/view/privacy_policy_screen.dart';
import '../../../../features/settings/ui/view/terms_conditions_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../../core/theme/text_styles.dart';
import 'change_password_screen.dart';
import 'edit_profile_screen.dart';
import 'faqs_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shape: const Border(
          bottom: BorderSide(color: Color(0xFFD0D5DD), width: 1.0),
        ),
        centerTitle: false,
        title: Text(
          'settings.settings'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),
      body: BlocConsumer<SettingsCubit, SettingsState>(
        listener: (context, state) {
          if (state is SuccessDeleteAccountSettingsState) {
            AppSnackBars.successSnackBar('settings.account_deleted'.tr());
            context.offAllNamed(Routes.splash);
          }
        },
        builder: (context, state) {
          if (state is LoadingSettingsState) {
            return Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            );
          }
          return SafeArea(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  SizedBox(height: 20.h),

                  /// Profile Section
                  ProfileCard(
                    name:
                        "${context.read<SettingsCubit>().profile?.firstName} ${context.read<SettingsCubit>().profile?.lastName}",
                    phone:
                        "${context.read<SettingsCubit>().profile?.phoneNumber}",
                    avatarUrl: AssetsManager.profileSettingsSvg,
                  ),

                  SizedBox(height: 12.h),

                  /// Vehicle Information
                  SectionTitle(title: 'settings.vehicle_information'.tr()),
                  SettingsTile(
                    icon: AssetsManager.vehicleInfoSvg,
                    title: 'settings.my_cars'.tr(),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => MyCarsScreen()),
                      );
                    },
                  ),
                  const SizedBox(height: 16),

                  /// General
                  SectionTitle(title: 'settings.general'.tr()),
                  SettingsTile(
                    onTap: () {
                      context.toNamed(Routes.changeLanguage);
                    },
                    icon: AssetsManager.languageSvg,
                    title: 'settings.language'.tr(),
                  ),
                  const SizedBox(height: 16),

                  /// Help & Support
                  SectionTitle(title: 'settings.help_support'.tr()),
                  SettingsTile(
                    icon: AssetsManager.contactUsSvg,
                    title: 'settings.contact_us'.tr(),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => ContactUsScreen()),
                      );
                    },
                  ),
                  SettingsTile(
                    icon: AssetsManager.faqsSvg,
                    title: 'settings.faqs'.tr(),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => FaqScreen()),
                      );
                    },
                  ),
                  const SizedBox(height: 16),

                  /// Legal
                  SectionTitle(title: 'settings.legal'.tr()),
                  SettingsTile(
                    icon: AssetsManager.privacyPolicySvg,
                    title: 'settings.privacy_policy'.tr(),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => PrivacyPolicyScreen(),
                        ),
                      );
                    },
                  ),
                  SettingsTile(
                    icon: AssetsManager.termsConditionsSvg,
                    title: 'settings.terms_conditions'.tr(),
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => TermsAndConditionsScreen(),
                        ),
                      );
                    },
                  ),

                  SizedBox(height: 24.h),

                  /// Logout Button
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.w),
                    child: AppButton(
                      onPressed: () {
                        showLogoutBottomSheet(
                          context,
                          onConfirm: () async {
                            try {
                              await DioHelper.postData(
                                url: EndPoints.logout,
                                data: {},
                                auth: true,
                              );
                            } catch (_) {}
                            if (context.mounted) {
                              try {
                                context
                                    .read<SosCubit>()
                                    .socketService
                                    .disconnect();
                                context.read<SosCubit>().reset();
                                context.read<SettingsCubit>().clearProfile();
                              } catch (_) {}
                            }
                            await CacheHelper.clear();
                            // Invalidate this device's FCM token AFTER the
                            // session is gone, so the refreshed token can no
                            // longer be posted back onto the account we are
                            // leaving. Without this the next account signing
                            // in here inherits this account's pushes.
                            await FCMNotificationService.instance
                                .deleteToken();

                            if (context.mounted) {
                              AppSnackBars.successSnackBar(
                                  'settings.signed_out'.tr());
                              context.offAllNamed(Routes.login);
                            }
                          },
                        );
                      },
                      label: 'settings.logout'.tr(),
                      bgColor: ColorsManager.mainColor,
                      textColor: Colors.white,
                      margin: 0,
                      width: double.infinity,
                      height: 48.h,
                      radius: 10.r,
                    ),
                  ),

                  SizedBox(height: 24.h),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class ProfileCard extends StatelessWidget {
  final String name;
  final String phone;
  final String avatarUrl;

  const ProfileCard({
    super.key,
    required this.name,
    required this.phone,
    required this.avatarUrl,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.symmetric(horizontal: 16.w),
      padding: EdgeInsets.all(12.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: ColorsManager.border),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28.r,
            backgroundImage: AssetImage(AssetsManager.homeProfileImage),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.trim().isEmpty ? '—' : name.trim(),
                  style: TextStyles.font16RegularBlack
                      .copyWith(fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 4.h),
                Text(phone, style: TextStyles.font12RegularGrey),
              ],
            ),
          ),
          InkWell(
            onTap: () => showProfileDialog(context),
            borderRadius: BorderRadius.circular(8.r),
            child: Padding(
              padding: EdgeInsets.all(4.w),
              child: SvgPicture.asset(avatarUrl),
            ),
          ),
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  final String title;
  const SectionTitle({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.centerLeft,
      padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 6.h),
      child: Text(
        title,
        style: TextStyles.font16RegularBlack.copyWith(
          fontWeight: FontWeight.w700,
          fontSize: 15.sp,
        ),
      ),
    );
  }
}

class SettingsTile extends StatelessWidget {
  final String icon;
  final String title;

  final void Function()? onTap;
  const SettingsTile({
    super.key,
    required this.icon,
    required this.title,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: SvgPicture.asset(icon),
        title: Text(
          title,
          style: TextStyles.font14RegularGrey.copyWith(color: Colors.black87),
        ),
        trailing: Icon(
          Icons.chevron_right,
          size: 22.sp,
          color: ColorsManager.listTileArrowForward,
        ),
        tileColor: Colors.white,
        shape: Border(
          bottom: BorderSide(color: ColorsManager.border),
        ),
        onTap: onTap,
      ),
    );
  }
}

void showProfileDialog(BuildContext context) {
  // Capture profile data from the outer context before entering the dialog
  final cubit = context.read<SettingsCubit>();
  final fullName = '${cubit.profile?.firstName ?? ''} ${cubit.profile?.lastName ?? ''}'.trim();
  final email = cubit.profile?.email ?? '';

  showDialog(
    context: context,
    builder: (BuildContext ctx) {
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              /// Name & Email
              Text(
                fullName.isNotEmpty ? fullName : 'N/A',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                email.isNotEmpty ? email : 'N/A',
                style: TextStyle(color: Colors.grey[600]),
              ),

              const SizedBox(height: 16),

              /// Edit Profile
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline),
                title: Text('settings.edit_profile'.tr()),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => EditProfileScreen()),
                  );
                },
              ),

              /// Change Password
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.lock_outline),
                title: Text('settings.change_password'.tr()),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ChangePasswordScreen()),
                  );
                },
              ),

              const Divider(),

              /// Delete Account
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: Text(
                  'settings.delete_account'.tr(),
                  style: const TextStyle(color: Colors.red),
                ),
                onTap: () {
                  Navigator.pop(ctx);
                  showDeleteAccountSheet(
                    context,
                    onConfirm: () {
                      context.read<SettingsCubit>().deleteAccount();
                    },
                  );
                },
              ),
            ],
          ),
        ),
      );
    },
  );
}

Future<bool?> showLogoutBottomSheet(
  BuildContext context, {
  VoidCallback? onConfirm,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    useSafeArea: true,
    isScrollControlled: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      final theme = Theme.of(ctx);
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'settings.logout'.tr(),
                style: theme.textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('settings.logout_confirm'.tr()),
            ),
            const SizedBox(height: 50),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF982B2B), // deep red
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () {
                  Navigator.of(ctx).pop(true);
                  onConfirm?.call();
                },
                child: Text('settings.confirm_logout'.tr()),
              ),
            ),
            const SizedBox(height: 50),
          ],
        ),
      );
    },
  );
}

class DeleteAccountResult {
  final String?
  reason; // 'no_longer_needed' | 'switching' | 'privacy' | 'other'
  final String? note; // text area content when 'other' or any extra notes
  DeleteAccountResult({this.reason, this.note});
}

Future<DeleteAccountResult?> showDeleteAccountSheet(
  BuildContext context, {
  VoidCallback? onConfirm,
}) {
  return showModalBottomSheet<DeleteAccountResult>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      String? selected; // one of keys below
      final noteCtrl = TextEditingController();

      Widget reasonTile(String key, String label) {
        final checked = selected == key;
        return InkWell(
          onTap: () {
            selected = checked ? null : key;
            (ctx as Element).markNeedsBuild();
          },
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Checkbox(
                  value: checked,
                  onChanged: (_) {
                    selected = checked ? null : key;
                    (ctx as Element).markNeedsBuild();
                  },
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(child: Text(label)),
              ],
            ),
          ),
        );
      }

      final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;

      return Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 16 + bottomInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // dragHandle(),
            // const SizedBox(height: 12),
            InkWell(
              onTap: () {
                Navigator.pop(ctx);
              },
              child: Align(
                alignment: AlignmentDirectional.centerEnd,
                child: CircleAvatar(
                  backgroundColor: Colors.grey.shade100,
                  child: Icon(Icons.close, color: Colors.grey),
                ),
              ),
            ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                'settings.delete_my_account'.tr(),
                style: Theme.of(
                  ctx,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 8),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: Text('settings.provide_reason'.tr()),
            ),
            const SizedBox(height: 4),

            // Reasons (single-select checkboxes to match screenshot)
            reasonTile('no_longer_needed', 'settings.no_longer_needed'.tr()),
            reasonTile('switching', 'settings.switching_service'.tr()),
            reasonTile('privacy', 'settings.privacy_concerns'.tr()),
            reasonTile('other', 'settings.other'.tr()),

            const SizedBox(height: 8),

            // Text area (enabled always; you can gate by selected == 'other')
            TextField(
              controller: noteCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'settings.enter_reason'.tr(),
                filled: true,
                fillColor: Colors.grey.shade50,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                enabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),

            const SizedBox(height: 16),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: Colors.grey.shade300),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () => Navigator.of(ctx).pop(null),
                    child: Text('common.cancel'.tr()),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () {
                      // Optionally validate selection
                      Navigator.of(ctx).pop();
                      onConfirm?.call();
                    },
                    child: Text('common.submit'.tr()),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}
