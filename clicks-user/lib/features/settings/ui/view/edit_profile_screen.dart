import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/features/settings/ui/cubit/settings_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/helper/assets_manager.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/theme/text_styles.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameCtrl = TextEditingController();
  final _lastNameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  // final _phoneCtrl = TextEditingController();

  // ignore: prefer_final_fields — mutated in setState
  bool _saving = false;
  bool _emailValid = false;

  // Simple SDK-only email check
  bool _isValidEmail(String v) {
    final re = RegExp(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');
    return re.hasMatch(v.trim());
  }

  @override
  void initState() {
    super.initState();
    _emailCtrl.text = context.read<SettingsCubit>().profile?.email ?? "";
    _firstNameCtrl.text =
        context.read<SettingsCubit>().profile?.firstName ?? "";
    _lastNameCtrl.text = context.read<SettingsCubit>().profile?.lastName ?? "";
    _emailValid = _isValidEmail(_emailCtrl.text);
  }

  @override
  void dispose() {
    _firstNameCtrl.dispose();
    _lastNameCtrl.dispose();
    _emailCtrl.dispose();
    // _phoneCtrl.dispose();
    super.dispose();
  }

  bool get _changed {
    final profile = context.read<SettingsCubit>().profile;
    return _firstNameCtrl.text.trim() != (profile?.firstName ?? '') ||
        _lastNameCtrl.text.trim() != (profile?.lastName ?? '') ||
        _emailCtrl.text.trim() != (profile?.email ?? '');
  }
  // ||
  // _phoneCtrl.text.trim() != '+974 3367 7310';

  bool get _canSave {
    final firstNameOk = _firstNameCtrl.text.trim().length >= 3;
    final lastNameOk = _lastNameCtrl.text.trim().length >= 3;
    final emailOk = _isValidEmail(_emailCtrl.text);
    // final phoneOk = RegExp(
    //   r'^\+974(\s?\d){8,}$',
    // ).hasMatch(_phoneCtrl.text.replaceAll(' ', ''));
    return firstNameOk && lastNameOk && emailOk && _changed && !_saving;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    context.read<SettingsCubit>().updateProfile(
      _firstNameCtrl.text,
      _lastNameCtrl.text,
      _emailCtrl.text,
    );
  }

  InputBorder _border([Color? c]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: c ?? const Color(0xFFE7E7E7), width: 1),
  );

  InputDecoration _fieldDec({
    required String hint,
    Widget? prefix,
    Widget? suffix,
    bool enabled = true,
  }) {
    return InputDecoration(
      hintText: hint, // placeholders like the images
      prefixIcon: prefix,
      suffixIcon: suffix,
      filled: true,
      fillColor: Colors.white,
      enabled: enabled,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      border: _border(),
      enabledBorder: _border(),
      focusedBorder: _border(Colors.black87),
      errorBorder: _border(Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    final red = const Color(0xFF9A2A2A);

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        shape: Border(bottom: BorderSide(color: Colors.grey, width: 1.0)),
        centerTitle: false,
        title: Text(
          'settings.my_profile'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              // Avatar + name header (like your image)
              Row(
                children: [
                  Stack(
                    children: [
                      const CircleAvatar(
                        radius: 26,
                        backgroundImage: AssetImage(
                          AssetsManager.homeProfileImage,
                        ),
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          height: 18,
                          width: 18,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFFE7E7E7)),
                          ),
                          child: const Icon(Icons.edit, size: 12),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim().isNotEmpty
                        ? '${_firstNameCtrl.text.trim()} ${_lastNameCtrl.text.trim()}'.trim()
                        : context.read<SettingsCubit>().profile?.firstName ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Full Name (no top labels; just section labels like image)
              Text('auth.first_name'.tr(), style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _firstNameCtrl,
                decoration: _fieldDec(
                  hint: 'auth.first_name'.tr(),
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'settings.please_enter_name'.tr();
                  if (t.length < 3) return 'settings.name_too_short'.tr();
                  return null;
                },
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),

              // Full Name (no top labels; just section labels like image)
              Text('auth.last_name'.tr(), style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _lastNameCtrl,
                decoration: _fieldDec(
                  hint: 'auth.last_name'.tr(),
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'settings.please_enter_name'.tr();
                  if (t.length < 3) return 'settings.name_too_short'.tr();
                  return null;
                },
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 16),

              Text('auth.email'.tr(), style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 6),
              TextFormField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: _fieldDec(
                  hint: 'auth.email_hint'.tr(),
                  suffix:
                      _emailValid
                          ? const Icon(Icons.check_circle, color: Colors.green)
                          : null,
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'settings.please_enter_email'.tr();
                  if (!_isValidEmail(t)) return 'settings.enter_valid_email'.tr();
                  return null;
                },
                onChanged:
                    (v) => setState(() => _emailValid = _isValidEmail(v)),
              ),
              const SizedBox(height: 16),

              // const Text('Phone Number', style: TextStyle(fontSize: 13)),
              // const SizedBox(height: 6),
              // TextFormField(
              //   controller: _phoneCtrl,
              //   keyboardType: TextInputType.phone,
              //   decoration: _fieldDec(
              //     hint: '+ 974 3367 7310',
              //     // prefix: const Icon(Icons.phone_outlined),
              //   ),
              //   validator: (v) {
              //     final raw = (v ?? '').replaceAll(' ', '');
              //     if (raw.isEmpty) return 'Please enter your phone number';
              //     final ok = RegExp(r'^\+974\d{8,}$').hasMatch(raw);
              //     if (!ok)
              //       return 'Must start with +974 and include at least 8 digits';
              //     return null;
              //   },
              //   onChanged: (_) => setState(() {}),
              // ),
              const SizedBox(height: 20),

              // Save button (matches wide red style)
              BlocConsumer<SettingsCubit, SettingsState>(
                listener: (context, state) {
                  if (state is ErrorUpdateProfileState) {
                    AppSnackBars.errorSnackBar(state.message);
                  } else if (state is SuccessUpdateProfileState) {
                    AppSnackBars.successSnackBar('settings.profile_updated_success'.tr());
                    context.read<SettingsCubit>().getProfile(context);
                    context.pop();
                  }
                },
                builder: (context, state) {
                  return SizedBox(
                    height: 48,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor:
                            _canSave ? red : const Color(0xFFECECEC),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      onPressed:
                          state is LoadingUpdateProfileState
                              ? null
                              : _canSave
                              ? _save
                              : null,
                      child:
                          state is LoadingUpdateProfileState
                              ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                              : Text('common.save'.tr()),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
