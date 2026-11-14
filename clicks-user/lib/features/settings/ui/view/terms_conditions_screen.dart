import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../../../../core/components/clicks_app_header.dart';
import '../../../../core/helper/content_repository.dart';
import '../../../../core/theme/colors_manager.dart';

class TermsAndConditionsScreen extends StatefulWidget {
  const TermsAndConditionsScreen({super.key});

  @override
  State<TermsAndConditionsScreen> createState() =>
      _TermsAndConditionsScreenState();
}

class _TermsAndConditionsScreenState extends State<TermsAndConditionsScreen> {
  final ContentRepository _repository = ContentRepository();
  String _html = '';
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadTerms();
    });
  }

  bool _tooThin(String html) {
    final text = html
        .replaceAll(RegExp(r'<[^>]*>'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return text.length < 400;
  }

  Future<String> _bundledTerms() {
    final ar = context.locale.languageCode.toLowerCase().startsWith('ar');
    final path = ar
        ? 'assets/legal/terms-and-conditions.ar.html'
        : 'assets/legal/terms-and-conditions.en.html';
    return rootBundle.loadString(path);
  }

  Future<void> _loadTerms() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      String html = '';
      try {
        final response = await _repository.getTermsConditions();
        html = response.terms.content;
      } catch (_) {
        html = '';
      }
      if (_tooThin(html)) {
        html = await _bundledTerms();
      }
      if (!mounted) return;
      setState(() {
        _html = html;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        title: 'settings.terms_conditions'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_error!, textAlign: TextAlign.center),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadTerms,
              child: Text('common.retry'.tr()),
            ),
          ],
        ),
      );
    }

    if (_html.isEmpty) {
      return Center(child: Text('settings.no_content'.tr()));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: HtmlWidget(
        _html,
        textStyle: TextStyle(
          fontSize: 14,
          color: Colors.black.withValues(alpha: 0.9),
          height: 1.5,
        ),
      ),
    );
  }
}
