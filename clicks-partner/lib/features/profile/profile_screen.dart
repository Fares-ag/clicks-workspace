import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/partner_notification_service.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/partner_card.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _currentPassCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();

  Map<String, dynamic>? _partner;
  bool _loading = true;
  bool _saving = false;
  bool _changingPass = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _currentPassCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: EndPoints.me);
      if (res.statusCode == 200 && res.data is Map) {
        final partner = Map<String, dynamic>.from(res.data['partner'] as Map);
        _phoneCtrl.text = partner['phone']?.toString() ?? '';
        _emailCtrl.text = partner['email']?.toString() ?? '';
        setState(() {
          _partner = partner;
          _loading = false;
        });
        return;
      }
      setState(() {
        _error = DioHelper.errorMessage(res) ?? 'failed_to_load'.tr();
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'failed_to_load'.tr();
        _loading = false;
      });
    }
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      final res = await DioHelper.patchData(
        url: EndPoints.me,
        data: {
          'phone': _phoneCtrl.text.trim(),
          'email': _emailCtrl.text.trim(),
        },
      );
      if (res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('profile_saved'.tr())),
        );
        await _load();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'failed_to_load'.tr()),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changePassword() async {
    final next = _newPassCtrl.text;
    if (next.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('password_too_short'.tr())),
      );
      return;
    }
    if (next != _confirmPassCtrl.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('password_mismatch'.tr())),
      );
      return;
    }
    setState(() => _changingPass = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.changePassword,
        data: {
          'currentPassword': _currentPassCtrl.text,
          'newPassword': next,
        },
      );
      if (res.statusCode == 200) {
        _currentPassCtrl.clear();
        _newPassCtrl.clear();
        _confirmPassCtrl.clear();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('password_updated'.tr())),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'failed_to_load'.tr()),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _changingPass = false);
    }
  }

  Future<void> _logout() async {
    await PartnerNotificationService.instance.clearToken();
    await CacheHelper.clear();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil(Routes.login, (_) => false);
  }

  Future<void> _setLocale(Locale locale) async {
    await context.setLocale(locale);
    await CacheHelper.set('app_language', locale.languageCode);
  }

  Widget _body() {
    final name = _partner?['name']?.toString() ?? '—';
    final lang = context.locale.languageCode;

    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: GoogleFonts.dmSans(color: AppColors.muted)),
            TextButton(onPressed: _load, child: Text('try_again'.tr())),
          ],
        ),
      );
    }

    return ListView(
      padding: EdgeInsets.fromLTRB(16, widget.embedded ? 8 : 16, 16, 32),
      children: [
        if (widget.embedded) ...[
          Text(
            'profile'.tr(),
            style: GoogleFonts.dmSans(
              fontSize: 22,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'profile_subtitle'.tr(),
            style: GoogleFonts.dmSans(fontSize: 14, color: AppColors.muted),
          ),
          const SizedBox(height: 16),
        ],
        PartnerCard(
          title: 'profile'.tr(),
          child: Column(
            children: [
              TextField(
                readOnly: true,
                controller: TextEditingController(text: name),
                decoration: InputDecoration(labelText: 'name'.tr()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(labelText: 'email'.tr()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: 'phone'.tr()),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : _saveProfile,
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text('save_profile'.tr()),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        PartnerCard(
          title: 'language'.tr(),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _LangButton(
                label: 'english'.tr(),
                selected: lang == 'en',
                onTap: () => _setLocale(const Locale('en')),
              ),
              _LangButton(
                label: 'arabic'.tr(),
                selected: lang == 'ar',
                onTap: () => _setLocale(const Locale('ar')),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        PartnerCard(
          title: 'change_password'.tr(),
          child: Column(
            children: [
              TextField(
                controller: _currentPassCtrl,
                obscureText: true,
                decoration: InputDecoration(labelText: 'current_password'.tr()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _newPassCtrl,
                obscureText: true,
                decoration: InputDecoration(labelText: 'new_password'.tr()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirmPassCtrl,
                obscureText: true,
                decoration: InputDecoration(labelText: 'confirm_password'.tr()),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _changingPass ? null : _changePassword,
                  child: _changingPass
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text('change_password'.tr()),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Center(
          child: TextButton(
            onPressed: _logout,
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: Text('sign_out'.tr()),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.embedded) {
      return _body();
    }

    return Scaffold(
      backgroundColor: AppColors.pageBackground,
      appBar: AppBar(title: Text('profile'.tr())),
      body: _body(),
    );
  }
}

class _LangButton extends StatelessWidget {
  const _LangButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: selected ? AppColors.primary : AppColors.muted,
        backgroundColor:
            selected ? AppColors.primary.withValues(alpha: 0.08) : null,
        side: BorderSide(
          color: selected ? AppColors.primary : AppColors.inputBorder,
        ),
        minimumSize: const Size(0, 40),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      ),
      child: Text(
        label,
        style: GoogleFonts.dmSans(fontWeight: FontWeight.w600),
      ),
    );
  }
}
