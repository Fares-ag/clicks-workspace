import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/helper/html_plain.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

enum ContentPageType { faqs, privacy, terms }

/// Read-only content from GET /api/content/* (public).
class ContentPageScreen extends StatefulWidget {
  const ContentPageScreen({super.key, required this.type});

  final ContentPageType type;

  @override
  State<ContentPageScreen> createState() => _ContentPageScreenState();
}

class _ContentPageScreenState extends State<ContentPageScreen> {
  bool _loading = true;
  String? _error;
  String _body = '';
  List<Map<String, String>> _faqs = [];

  String get _title {
    switch (widget.type) {
      case ContentPageType.faqs:
        return "FAQ's";
      case ContentPageType.privacy:
        return 'Privacy Policy';
      case ContentPageType.terms:
        return 'Terms & Conditions';
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      switch (widget.type) {
        case ContentPageType.faqs:
          final res = await DioHelper.getData(
            url: EndPoints.faqs,
            auth: false,
          );
          if (res.statusCode == 200) {
            final list = res.data['faqs'];
            _faqs = [];
            if (list is List) {
              for (final e in list) {
                if (e is! Map) continue;
                _faqs.add({
                  'q': (e['question'] ?? '').toString(),
                  'a': htmlToPlainText((e['answer'] ?? '').toString()),
                });
              }
            }
            if (_faqs.isEmpty) {
              _error = 'No FAQs available yet';
            }
          } else {
            _error = DioHelper.errorMessage(res) ?? 'Failed to load FAQs';
          }
          break;
        case ContentPageType.privacy:
          final res = await DioHelper.getData(
            url: EndPoints.privacyPolicy,
            auth: false,
          );
          if (res.statusCode == 200) {
            final policy = res.data['policy'];
            final content =
                policy is Map ? (policy['content'] ?? '').toString() : '';
            _body = htmlToPlainText(content);
            if (_body.isEmpty) _error = 'No privacy policy found';
          } else {
            _error =
                DioHelper.errorMessage(res) ?? 'Failed to load privacy policy';
          }
          break;
        case ContentPageType.terms:
          final res = await DioHelper.getData(
            url: EndPoints.termsConditions,
            auth: false,
          );
          if (res.statusCode == 200) {
            final terms = res.data['terms'];
            final content =
                terms is Map ? (terms['content'] ?? '').toString() : '';
            _body = htmlToPlainText(content);
            if (_body.isEmpty) _error = 'No terms found';
          } else {
            _error = DioHelper.errorMessage(res) ?? 'Failed to load terms';
          }
          break;
      }
    } catch (_) {
      _error = 'Failed to load content';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          _title,
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(
              child:
                  CircularProgressIndicator(color: ColorsManager.mainColor),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: EdgeInsets.all(24.w),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!,
                            textAlign: TextAlign.center,
                            style: TextStyles.font14RegularGrey),
                        SizedBox(height: 12.h),
                        TextButton(
                          onPressed: _load,
                          child: Text('Retry',
                              style:
                                  TextStyle(color: ColorsManager.mainColor)),
                        ),
                      ],
                    ),
                  ),
                )
              : widget.type == ContentPageType.faqs
                  ? ListView.separated(
                      padding: EdgeInsets.all(16.w),
                      itemCount: _faqs.length,
                      separatorBuilder: (_, __) => Divider(height: 24.h),
                      itemBuilder: (context, i) {
                        final f = _faqs[i];
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              f['q'] ?? '',
                              style: TextStyles.font14RegularGrey.copyWith(
                                fontWeight: FontWeight.w600,
                                color: Colors.black87,
                              ),
                            ),
                            SizedBox(height: 6.h),
                            Text(
                              f['a'] ?? '',
                              style: TextStyles.font14RegularGrey,
                            ),
                          ],
                        );
                      },
                    )
                  : SingleChildScrollView(
                      padding: EdgeInsets.all(16.w),
                      child: SelectableText(
                        _body,
                        style: TextStyles.font14RegularGrey
                            .copyWith(color: Colors.black87, height: 1.45),
                      ),
                    ),
    );
  }
}
