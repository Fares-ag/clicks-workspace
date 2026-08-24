import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/helper/content_models.dart';
import '../../../../core/helper/content_repository.dart';
import '../../../../core/theme/text_styles.dart';

class FaqScreen extends StatefulWidget {
  const FaqScreen({super.key});

  @override
  State<FaqScreen> createState() => _FaqScreenState();
}

class _FaqScreenState extends State<FaqScreen> {
  final ContentRepository _repository = ContentRepository();
  List<FaqModel> _faqs = [];
  bool _isLoading = true;
  String? _error;
  final Set<String> _expandedIds = {};

  @override
  void initState() {
    super.initState();
    _loadFaqs();
  }

  Future<void> _loadFaqs() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final response = await _repository.getFaqs();
      if (!mounted) return;
      setState(() {
        _faqs = response.faqs;
        _isLoading = false;
        // Expand first item by default
        if (_faqs.isNotEmpty) {
          _expandedIds.add(_faqs.first.id);
        }
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
          'settings.faqs'.tr(),
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
            Text(_error!, textAlign: TextAlign.center),
            SizedBox(height: 16),
            ElevatedButton(onPressed: _loadFaqs, child: Text('common.retry'.tr())),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      children: [
        // Need Assistance card
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF9D2626),
            borderRadius: BorderRadius.circular(8),
          ),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'settings.need_assistance'.tr(),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'settings.faq_email'.tr(),
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
              const SizedBox(height: 4),
              Text(
                'settings.faq_phone'.tr(),
                style: const TextStyle(color: Colors.white, fontSize: 14),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // FAQ list from API
        ..._faqs.map((faq) {
          final isExpanded = _expandedIds.contains(faq.id);
          return _FaqTile(
            key: ValueKey(faq.id),
            title: faq.question,
            content: faq.answer,
            initiallyExpanded: isExpanded,
            onChanged: (expanded) {
              setState(() {
                if (expanded) {
                  _expandedIds.add(faq.id);
                } else {
                  _expandedIds.remove(faq.id);
                }
              });
            },
          );
        }),
      ],
    );
  }
}

class _FaqTile extends StatefulWidget {
  const _FaqTile({
    super.key,
    required this.title,
    required this.content,
    this.initiallyExpanded = false,
    this.onChanged,
  });

  final String title;
  final String content;
  final bool initiallyExpanded;
  final ValueChanged<bool>? onChanged;

  @override
  State<_FaqTile> createState() => _FaqTileState();
}

class _FaqTileState extends State<_FaqTile> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final border = Border.all(color: const Color(0xFFE9E9E9));
    final radius = BorderRadius.circular(12);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: border,
        borderRadius: radius,
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: _expanded,
          shape: const RoundedRectangleBorder(
            side: BorderSide(color: Colors.transparent),
          ),
          collapsedShape: const RoundedRectangleBorder(
            side: BorderSide(color: Colors.transparent),
          ),
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          title: Text(
            widget.title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          trailing: AnimatedRotation(
            turns: _expanded ? 0.5 : 0.0,
            duration: const Duration(milliseconds: 200),
            child: const Icon(Icons.expand_more_rounded),
          ),
          onExpansionChanged: (v) {
            setState(() => _expanded = v);
            widget.onChanged?.call(v);
          },
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                widget.content,
                style: TextStyle(color: Colors.black.withValues(alpha: 0.7)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
