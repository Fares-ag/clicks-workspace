import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/assets_manager.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/partner_notification_service.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';

/// Brand login — same pattern as clicks-business / clicks-technician:
/// full-bleed roadside photo, white Clicks mark, white copy, red CTA.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.postData(
        url: EndPoints.login,
        auth: false,
        data: {
          'email': _emailCtrl.text.trim(),
          'password': _passwordCtrl.text,
        },
      );
      if (res.statusCode == 200 && res.data is Map) {
        final token = res.data['token']?.toString();
        final partner = res.data['partner'];
        if (token != null && token.isNotEmpty) {
          await CacheHelper.set('token', token);
          if (partner is Map) {
            await CacheHelper.set(
              'partner_name',
              partner['name']?.toString() ?? '',
            );
          }
          await PartnerNotificationService.instance.registerTokenIfLoggedIn();
          if (!mounted) return;
          Navigator.of(context).pushReplacementNamed(Routes.home);
          return;
        }
      }
      setState(() {
        _error = DioHelper.errorMessage(res) ?? 'login_failed'.tr();
      });
    } catch (_) {
      setState(() => _error = 'login_failed'.tr());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  InputDecoration _decoration(String hint, {Widget? prefix}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.dmSans(color: Colors.black26, fontSize: 14),
      filled: true,
      fillColor: Colors.white,
      prefixIcon: prefix,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      body: Container(
        width: size.width,
        height: size.height,
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage(AssetsManager.loginBgImage),
            fit: BoxFit.cover,
          ),
        ),
        child: Container(
          // Soft brand wash so white type stays readable on any crop.
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.15),
                Colors.black.withValues(alpha: 0.45),
                AppColors.primary.withValues(alpha: 0.55),
              ],
              stops: const [0.0, 0.55, 1.0],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(height: size.height * 0.22),
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: SvgPicture.asset(
                            AssetsManager.loginIconSvg,
                            height: 56,
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          'partner_portal'.tr(),
                          style: GoogleFonts.dmSans(
                            fontSize: 28,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'login_subtitle_short'.tr(),
                          style: GoogleFonts.dmSans(
                            fontSize: 14,
                            color: Colors.white70,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _emailCtrl,
                          style: GoogleFonts.dmSans(color: AppColors.text),
                          keyboardType: TextInputType.emailAddress,
                          decoration: _decoration(
                            'email'.tr(),
                            prefix: Padding(
                              padding: const EdgeInsets.all(12),
                              child: SvgPicture.asset(
                                AssetsManager.userSvg,
                                width: 20,
                                height: 20,
                              ),
                            ),
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty)
                              ? 'required'.tr()
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _passwordCtrl,
                          obscureText: _obscure,
                          style: GoogleFonts.dmSans(color: AppColors.text),
                          decoration: _decoration('password'.tr()).copyWith(
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                                color: AppColors.muted,
                              ),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? 'required'.tr() : null,
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(
                            _error!,
                            style: GoogleFonts.dmSans(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                        const SizedBox(height: 28),
                        FilledButton(
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor:
                                AppColors.primary.withValues(alpha: 0.7),
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          onPressed: _loading ? null : _submit,
                          child: _loading
                              ? const SizedBox(
                                  height: 22,
                                  width: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  'sign_in'.tr(),
                                  style: GoogleFonts.dmSans(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
