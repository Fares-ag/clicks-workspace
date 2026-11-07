import 'dart:async';

import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'skipcash_api.dart';

class SkipcashCheckoutArgs {
  final String jobId;
  final String payUrl;
  final String returnUrl;
  final Future<bool> Function()? checkPaid;
  final String? summaryTitle;
  final String? summaryAmount;
  final String? summarySubtitle;

  const SkipcashCheckoutArgs({
    required this.jobId,
    required this.payUrl,
    required this.returnUrl,
    this.checkPaid,
    this.summaryTitle,
    this.summaryAmount,
    this.summarySubtitle,
  });
}

class SkipcashCheckoutScreen extends StatefulWidget {
  final SkipcashCheckoutArgs args;

  const SkipcashCheckoutScreen({super.key, required this.args});

  @override
  State<SkipcashCheckoutScreen> createState() => _SkipcashCheckoutScreenState();
}

class _SkipcashCheckoutScreenState extends State<SkipcashCheckoutScreen> {
  WebViewController? _controller;
  Timer? _pollTimer;
  var _finishing = false;
  var _loading = true;

  @override
  void initState() {
    super.initState();
    if (kIsWeb) {
      _loading = false;
      unawaited(_openPaymentTab());
      _pollTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => _finish(silent: true),
      );
      return;
    }
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onNavigationRequest: (request) {
            if (_isReturnUrl(request.url)) {
              _finish();
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onUrlChange: (change) {
            final url = change.url;
            if (url != null && _isReturnUrl(url)) {
              _finish();
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.args.payUrl));
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  bool _isReturnUrl(String url) {
    final expected = widget.args.returnUrl.trim();
    if (expected.isEmpty) return false;
    return url.startsWith(expected);
  }

  Future<void> _openPaymentTab() async {
    final uri = Uri.parse(widget.args.payUrl);
    if (!await launchUrl(uri, webOnlyWindowName: '_blank')) {
      if (mounted) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }
  }

  Future<void> _finish({bool silent = false}) async {
    if (_finishing) return;
    _finishing = true;
    final paid = widget.args.checkPaid != null
        ? await widget.args.checkPaid!()
        : await SkipcashApi.isPaid(widget.args.jobId);
    if (!mounted) return;
    if (paid) {
      Navigator.of(context).pop(true);
      return;
    }
    _finishing = false;
    if (!silent && mounted) {
      Navigator.of(context).pop(false);
    }
  }

  Future<void> _confirmPayment() async {
    if (_finishing) return;
    _finishing = true;
    setState(() => _loading = true);
    final paid = widget.args.checkPaid != null
        ? await widget.args.checkPaid!()
        : await SkipcashApi.isPaid(widget.args.jobId);
    if (!mounted) return;
    setState(() => _loading = false);
    Navigator.of(context).pop(paid);
  }

  void _close() {
    if (kIsWeb) {
      Navigator.of(context).pop(null);
    } else {
      _finish();
    }
  }

  PreferredSizeWidget _header() {
    return ClicksAppHeader(
      title: 'home.checkout_title'.tr(),
      automaticallyImplyLeading: false,
      leading: IconButton(
        icon: const Icon(Icons.close),
        onPressed: _close,
      ),
    );
  }

  bool get _hasSummary =>
      (widget.args.summaryTitle?.trim().isNotEmpty ?? false) ||
      (widget.args.summaryAmount?.trim().isNotEmpty ?? false);

  Widget _summaryCard() {
    if (!_hasSummary) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 16.h),
      decoration: BoxDecoration(
        color: ColorsManager.card,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: ColorsManager.washBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.args.summaryTitle?.trim().isNotEmpty ?? false)
            Text(
              widget.args.summaryTitle!.trim(),
              style: TextStyles.font16RegularBlack.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          if (widget.args.summarySubtitle?.trim().isNotEmpty ?? false) ...[
            SizedBox(height: 4.h),
            Text(
              widget.args.summarySubtitle!.trim(),
              style: TextStyles.font14RegularGrey.copyWith(
                color: const Color(0xFF667085),
              ),
            ),
          ],
          if (widget.args.summaryAmount?.trim().isNotEmpty ?? false) ...[
            SizedBox(height: 12.h),
            Text(
              widget.args.summaryAmount!.trim(),
              style: TextStyles.font20Bold.copyWith(
                fontSize: 28.sp,
                height: 1.1,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _secureNote() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.lock_outline,
          size: 18.sp,
          color: ColorsManager.mainColor,
        ),
        SizedBox(width: 8.w),
        Expanded(
          child: Text(
            'home.checkout_powered_by'.tr(),
            style: TextStyles.font14RegularGrey.copyWith(
              color: const Color(0xFF667085),
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }

  Widget _primaryButton({
    required String label,
    required VoidCallback? onPressed,
    bool loading = false,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 52.h,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: ColorsManager.mainColor,
          foregroundColor: Colors.white,
          disabledBackgroundColor: ColorsManager.mainColor.withValues(alpha: 0.4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.r),
          ),
        ),
        child: loading
            ? SizedBox(
                height: 22.h,
                width: 22.h,
                child: const CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                label,
                style: TextStyles.font16RegularBlack.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }

  Widget _secondaryButton({
    required String label,
    required VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 52.h,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: ColorsManager.mainColor,
          side: const BorderSide(color: ColorsManager.washBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.r),
          ),
        ),
        child: Text(
          label,
          style: TextStyles.font16RegularBlack.copyWith(
            color: ColorsManager.mainColor,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }

  Widget _webBody() {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(20.w, 8.h, 20.w, 24.h),
            children: [
              _summaryCard(),
              if (_hasSummary) SizedBox(height: 20.h),
              _secureNote(),
              SizedBox(height: 16.h),
              Text(
                'home.checkout_web_hint'.tr(),
                style: TextStyles.font14RegularGrey.copyWith(
                  color: const Color(0xFF344054),
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 12.h),
            decoration: BoxDecoration(
              color: ColorsManager.card,
              border: Border(top: BorderSide(color: ColorsManager.washBorder)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _primaryButton(
                  label: 'home.checkout_open_skipcash'.tr(),
                  onPressed: _openPaymentTab,
                ),
                SizedBox(height: 10.h),
                _loading
                    ? _primaryButton(
                        label: 'home.checkout_confirm_payment'.tr(),
                        onPressed: null,
                        loading: true,
                      )
                    : _secondaryButton(
                        label: 'home.checkout_confirm_payment'.tr(),
                        onPressed: _confirmPayment,
                      ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _mobileBody() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_hasSummary)
          Padding(
            padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 0),
            child: _summaryCard(),
          ),
        if (_loading)
          LinearProgressIndicator(
            minHeight: 2,
            color: ColorsManager.mainColor,
            backgroundColor: ColorsManager.washBorder,
          ),
        Expanded(
          child: WebViewWidget(controller: _controller!),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 12.h),
            child: _secureNote(),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: _header(),
      body: kIsWeb ? _webBody() : _mobileBody(),
    );
  }
}
