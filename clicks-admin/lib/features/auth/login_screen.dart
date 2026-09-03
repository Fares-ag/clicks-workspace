import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'login_cubit.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;

    return BlocProvider(
      create: (_) => LoginCubit(),
      child: BlocConsumer<LoginCubit, LoginState>(
        listener: (context, state) {
          if (state is LoginSuccess) {
            Navigator.of(context).pushNamedAndRemoveUntil(
              Routes.dashboard,
              (_) => false,
            );
          }
        },
        builder: (context, state) {
          final loading = state is LoginLoading;
          final form = _LoginForm(
            email: _email,
            password: _password,
            loading: loading,
            error: state is LoginError ? state.message : null,
            onSubmit: () => context.read<LoginCubit>().login(
                  email: _email.text,
                  password: _password.text,
                ),
          );

          if (!wide) {
            return Scaffold(
              backgroundColor: AppColors.surface,
              body: SafeArea(child: SingleChildScrollView(child: form)),
            );
          }

          return Scaffold(
            body: Row(
              children: [
                Expanded(flex: 5, child: SingleChildScrollView(child: form)),
                Expanded(
                  flex: 4,
                  child: Container(
                    decoration: const BoxDecoration(
                      image: DecorationImage(
                        image: AssetImage('assets/logo/auth.png'),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _LoginForm extends StatelessWidget {
  const _LoginForm({
    required this.email,
    required this.password,
    required this.loading,
    required this.onSubmit,
    this.error,
  });

  final TextEditingController email;
  final TextEditingController password;
  final bool loading;
  final VoidCallback onSubmit;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final maxW = MediaQuery.sizeOf(context).width >= 900 ? 440.0 : double.infinity;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.xl,
        vertical: AppSpacing.xxl,
      ),
      child: Align(
        alignment: Alignment.topLeft,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxW),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SvgPicture.asset(
                'assets/logo/Logo.svg',
                height: 32,
                alignment: Alignment.centerLeft,
              ),
              const SizedBox(height: 52),
              Text('Log In', style: AdminTypography.pageTitle.copyWith(fontSize: 36)),
              const SizedBox(height: 12),
              Text(
                'Enter your email and password to sign in!',
                style: AdminTypography.body.copyWith(color: AppColors.muted),
              ),
              const SizedBox(height: 32),
              Text('Email*', style: AdminTypography.label),
              const SizedBox(height: 6),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  hintText: 'admin@example.com',
                  errorText: error != null ? ' ' : null,
                ),
              ),
              const SizedBox(height: 20),
              Text('Password*', style: AdminTypography.label),
              const SizedBox(height: 6),
              TextField(
                controller: password,
                obscureText: true,
                decoration: InputDecoration(
                  errorText: error,
                ),
                onSubmitted: (_) => onSubmit(),
              ),
              const SizedBox(height: 24),
              PrimaryButton(
                label: 'Sign in',
                loading: loading,
                onPressed: loading ? null : onSubmit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
