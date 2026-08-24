import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_widget_from_html_core/flutter_widget_from_html_core.dart';

import '../../../../core/helper/content_models.dart';
import '../../../../core/helper/content_repository.dart';
import '../../../../core/theme/text_styles.dart';

class TermsAndConditionsScreen extends StatefulWidget {
  const TermsAndConditionsScreen({super.key});

  @override
  State<TermsAndConditionsScreen> createState() =>
      _TermsAndConditionsScreenState();
}

class _TermsAndConditionsScreenState extends State<TermsAndConditionsScreen> {
  final ContentRepository _repository = ContentRepository();
  TermsConditionsModel? _terms;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTerms();
  }

  Future<void> _loadTerms() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final response = await _repository.getTermsConditions();
      if (!mounted) return;
      setState(() {
        _terms = response.terms;
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
      backgroundColor: Colors.white,
      appBar: AppBar(
        shape: Border(bottom: BorderSide(color: Colors.grey, width: 1.0)),
        centerTitle: false,
        title: Text(
          'settings.terms_conditions'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
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
            Icon(Icons.error_outline, size: 48, color: Colors.red),
            SizedBox(height: 16),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Text(_error!, textAlign: TextAlign.center),
            ),
            SizedBox(height: 16),
            ElevatedButton(onPressed: _loadTerms, child: Text('common.retry'.tr())),
          ],
        ),
      );
    }

    if (_terms == null || _terms!.content.isEmpty) {
      return Center(child: Text('settings.no_content'.tr()));
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: HtmlWidget(
        _terms!.content,
        textStyle: TextStyle(
          fontSize: 14,
          color: Colors.black.withValues(alpha: 0.9),
          height: 1.5,
        ),
      ),
    );
  }
}
