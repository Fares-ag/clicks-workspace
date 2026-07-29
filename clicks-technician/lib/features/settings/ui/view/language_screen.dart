import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/cache_helper.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Soft-launch language preference (local only).
class LanguageScreen extends StatefulWidget {
  const LanguageScreen({super.key});

  static const _prefKey = 'app_language';

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> {
  static const _options = [
    ('en', 'English'),
    ('ar', 'Arabic'),
    ('hi', 'Hindi'),
  ];

  String _selected = 'en';

  @override
  void initState() {
    super.initState();
    _selected = CacheHelper.get(LanguageScreen._prefKey)?.toString() ?? 'en';
  }

  Future<void> _select(String code, String label) async {
    if (_selected == code) return;
    await CacheHelper.save(LanguageScreen._prefKey, code);
    setState(() => _selected = code);
    AppSnackBars.successSnackBar('Language set to $label');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Language',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: ListView.separated(
        padding: EdgeInsets.symmetric(vertical: 8.h),
        itemCount: _options.length,
        separatorBuilder: (_, __) =>
            Divider(height: 1.h, indent: 16.w, endIndent: 16.w),
        itemBuilder: (context, i) {
          final (code, label) = _options[i];
          final selected = _selected == code;
          return ListTile(
            title: Text(
              label,
              style: TextStyles.font14RegularGrey.copyWith(
                color: Colors.black87,
                fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
            trailing: selected
                ? Icon(Icons.check_circle, color: ColorsManager.mainColor)
                : Icon(Icons.circle_outlined, color: ColorsManager.hintColor),
            onTap: () => _select(code, label),
          );
        },
      ),
    );
  }
}
