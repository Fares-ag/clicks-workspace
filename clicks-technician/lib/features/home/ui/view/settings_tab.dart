import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/extensions.dart';
import 'package:clicks_technician/core/routing/routes.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/settings/ui/view/contact_us_screen.dart';
import 'package:clicks_technician/features/settings/ui/view/language_screen.dart';
import 'package:clicks_technician/features/settings/ui/view/profile_edit_screen.dart';
import 'package:clicks_technician/features/settings/ui/view/vehicle_details_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Figma Settings: avatar, profile edit, vehicle, language, contact, delete.
class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});

  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _profile;
  Map<String, dynamic>? _vehicle;
  String? _vehicleError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _vehicleError = null;
    });

    try {
      final profileRes = await DioHelper.getData(url: EndPoints.profile);
      if (profileRes.statusCode == 200 && profileRes.data is Map) {
        _profile = Map<String, dynamic>.from(profileRes.data as Map);
      } else {
        _error = DioHelper.errorMessage(profileRes) ?? 'Failed to load profile';
      }
    } catch (_) {
      _error = 'Failed to load profile';
    }

    try {
      final vehicleRes = await DioHelper.getData(url: EndPoints.vehicle);
      if (vehicleRes.statusCode == 200) {
        final v = vehicleRes.data['vehicle'];
        _vehicle = v is Map ? Map<String, dynamic>.from(v) : null;
      } else if (vehicleRes.statusCode == 404) {
        _vehicle = null;
        _vehicleError = 'No vehicle assigned';
      } else {
        _vehicleError =
            DioHelper.errorMessage(vehicleRes) ?? 'Failed to load vehicle';
      }
    } catch (_) {
      _vehicleError = 'Failed to load vehicle';
    }

    if (mounted) setState(() => _loading = false);
  }

  Future<void> _openProfileEdit() async {
    if (_profile == null) return;
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => ProfileEditScreen(profile: _profile!),
      ),
    );
    if (updated == true && mounted) await _load();
  }

  void _openVehicleDetails() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => VehicleDetailsScreen(
          vehicle: _vehicle,
          error: _vehicleError,
        ),
      ),
    );
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('Cancel',
                style: TextStyle(color: ColorsManager.greyColor)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Logout',
                style: TextStyle(color: ColorsManager.mainColor)),
          ),
        ],
      ),
    );
    if (ok == true && mounted) await _logout();
  }

  Future<void> _logout() async {
    await context.read<HomeCubit>().logout();
    if (mounted) context.offAllNamed(Routes.login);
  }

  Future<void> _confirmDeleteAccount() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Account'),
        content: const Text(
          'This will deactivate your account. This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text('Cancel',
                style: TextStyle(color: ColorsManager.greyColor)),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete',
                style: TextStyle(color: Color(0xFFD92D20))),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      final res = await DioHelper.postData(
        url: EndPoints.deleteAccount,
        data: {},
      );
      if (res.statusCode == 200) {
        AppSnackBars.successSnackBar('Account deactivated');
        if (mounted) await _logout();
      } else {
        AppSnackBars.errorSnackBar(
          DioHelper.errorMessage(res) ?? 'Failed to delete account',
        );
      }
    } catch (_) {
      AppSnackBars.errorSnackBar('Failed to delete account');
    }
  }

  @override
  Widget build(BuildContext context) {
    final name = _profile == null
        ? ''
        : '${_profile!['firstName'] ?? ''} ${_profile!['lastName'] ?? ''}'
            .trim();
    final phone = _profile?['phone']?.toString() ?? '';
    final email = _profile?['email']?.toString() ?? '';
    final photo = _profile?['profilePicture']?.toString();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          'Settings',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
        automaticallyImplyLeading: false,
        backgroundColor: Colors.white,
      ),
      body: _loading
          ? Center(
              child:
                  CircularProgressIndicator(color: ColorsManager.mainColor),
            )
          : RefreshIndicator(
              color: ColorsManager.mainColor,
              onRefresh: _load,
              child: ListView(
                padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 24.h),
                children: [
                  if (_error != null) ...[
                    Text(_error!, style: TextStyles.font14RegularGrey),
                    TextButton(
                      onPressed: _load,
                      child: Text('Retry',
                          style: TextStyle(color: ColorsManager.mainColor)),
                    ),
                    SizedBox(height: 12.h),
                  ],
                  InkWell(
                    onTap: _profile == null ? null : _openProfileEdit,
                    borderRadius: BorderRadius.circular(16.r),
                    child: Container(
                      padding: EdgeInsets.all(14.w),
                      decoration: BoxDecoration(
                        color: ColorsManager.scaffoldColor,
                        borderRadius: BorderRadius.circular(16.r),
                        border: Border.all(color: ColorsManager.border),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: EdgeInsets.all(3.w),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: ColorsManager.mainColor
                                    .withValues(alpha: 0.35),
                                width: 2,
                              ),
                            ),
                            child: CircleAvatar(
                              radius: 36.r,
                              backgroundColor: ColorsManager.fieldColor,
                              backgroundImage: photo != null && photo.isNotEmpty
                                  ? NetworkImage(photo)
                                  : null,
                              child: photo == null || photo.isEmpty
                                  ? Icon(Icons.person,
                                      color: ColorsManager.greyColor,
                                      size: 36.sp)
                                  : null,
                            ),
                          ),
                          SizedBox(width: 14.w),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name.isEmpty ? 'Technician' : name,
                                  style: TextStyles.font16RegularBlack.copyWith(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 18.sp,
                                  ),
                                ),
                                if (phone.isNotEmpty) ...[
                                  SizedBox(height: 4.h),
                                  Text(phone,
                                      style: TextStyles.font12RegularGrey),
                                ],
                                if (email.isNotEmpty) ...[
                                  SizedBox(height: 2.h),
                                  Text(
                                    email,
                                    style: TextStyles.font12RegularGrey
                                        .copyWith(fontSize: 11.sp),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                                SizedBox(height: 6.h),
                                Text(
                                  'Edit profile',
                                  style: TextStyles.font12RegularGrey.copyWith(
                                    color: ColorsManager.mainColor,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Icon(Icons.chevron_right,
                              color: ColorsManager.listTileArrowForward),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(height: 28.h),
                  Text(
                    'Vehicle Information',
                    style: TextStyles.font16RegularBlack
                        .copyWith(fontWeight: FontWeight.bold),
                  ),
                  _tile(
                    icon: Icons.directions_car_outlined,
                    label: 'Viewing Vehicle Details',
                    onTap: _openVehicleDetails,
                  ),
                  SizedBox(height: 20.h),
                  Text(
                    'General',
                    style: TextStyles.font16RegularBlack
                        .copyWith(fontWeight: FontWeight.bold),
                  ),
                  _tile(
                    icon: Icons.language,
                    label: 'Language',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                          builder: (_) => const LanguageScreen()),
                    ),
                  ),
                  SizedBox(height: 20.h),
                  Text(
                    'Help & Support',
                    style: TextStyles.font16RegularBlack
                        .copyWith(fontWeight: FontWeight.bold),
                  ),
                  _tile(
                    icon: Icons.support_agent_outlined,
                    label: 'Contact Us',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                          builder: (_) => const ContactUsScreen()),
                    ),
                  ),
                  _tile(
                    icon: Icons.help_outline,
                    label: "FAQ's",
                    onTap: () => context.toNamed(Routes.faqs),
                  ),
                  SizedBox(height: 20.h),
                  Text(
                    'Legal',
                    style: TextStyles.font16RegularBlack
                        .copyWith(fontWeight: FontWeight.bold),
                  ),
                  _tile(
                    icon: Icons.privacy_tip_outlined,
                    label: 'Privacy Policy',
                    onTap: () => context.toNamed(Routes.privacyPolicy),
                  ),
                  _tile(
                    icon: Icons.article_outlined,
                    label: 'Terms & Conditions',
                    onTap: () => context.toNamed(Routes.termsConditions),
                  ),
                  SizedBox(height: 24.h),
                  _tile(
                    icon: Icons.delete_outline,
                    label: 'Delete Account',
                    onTap: _confirmDeleteAccount,
                    destructive: true,
                  ),
                  SizedBox(height: 24.h),
                  AppButton(
                    onPressed: _confirmLogout,
                    label: 'Logout',
                    margin: 0,
                    width: double.infinity,
                    bgColor: ColorsManager.mainColor,
                    textColor: Colors.white,
                    height: 48.h,
                    radius: 10.r,
                  ),
                ],
              ),
            ),
    );
  }

  Widget _tile({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool destructive = false,
  }) {
    final color =
        destructive ? const Color(0xFFD92D20) : ColorsManager.greyColor;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: color),
      title: Text(
        label,
        style: TextStyles.font14RegularGrey.copyWith(
          color: destructive ? const Color(0xFFD92D20) : Colors.black87,
        ),
      ),
      trailing: Icon(Icons.chevron_right,
          color: ColorsManager.listTileArrowForward),
      onTap: onTap,
    );
  }
}
