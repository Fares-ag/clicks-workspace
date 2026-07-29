import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/theme/text_styles.dart';

class LanguageSelectionScreen extends StatefulWidget {
  const LanguageSelectionScreen({super.key});

  @override
  State<LanguageSelectionScreen> createState() =>
      _LanguageSelectionScreenState();
}

class _LanguageSelectionScreenState extends State<LanguageSelectionScreen> {
  late String _selected;

  final _langs = const <String, String>{
    'en': 'English',
    'ar': 'العربية',
  };

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _selected = context.locale.languageCode;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'language_screen.select_language'.tr(),
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'language_screen.select_subtitle'.tr(),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.black.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 24),
            InkWell(
              onTap: () async {
                final result = await showLanguageBottomSheet(context, selected: _selected);
                if (result != null && result != _selected) {
                  setState(() => _selected = result);
                }
              },
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 14,
                ),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFE5E5E5)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(_langs[_selected] ?? '')),
                    const Icon(Icons.keyboard_arrow_down_rounded),
                  ],
                ),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF982B2B),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                onPressed: () {
                  context.setLocale(Locale(_selected));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('language_screen.language_changed'.tr(namedArgs: {'lang': _langs[_selected] ?? _selected})),
                    ),
                  );
                },
                child: Text('language_screen.change_language'.tr()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ChangeLanguageScreen extends StatelessWidget {
  const ChangeLanguageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        shape: Border(bottom: BorderSide(color: Colors.grey, width: 1.0)),
        centerTitle: true,
        title: Text(
          'settings.language'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),
      body: LanguageSelectionScreen(),
    );
  }
}

Future<String?> showLanguageBottomSheet(
  BuildContext context, {
  String selected = 'en',
}) {
  return showModalBottomSheet<String>(
    context: context,
    useSafeArea: true,
    isScrollControlled: false,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) {
      String current = selected;

      Widget dragHandle() => Container(
        width: 44,
        height: 5,
        margin: const EdgeInsets.only(top: 8),
        decoration: BoxDecoration(
          color: Colors.grey.shade300,
          borderRadius: BorderRadius.circular(3),
        ),
      );

      return StatefulBuilder(
        builder: (context, setState) {
          Widget langTile({
            required String code,
            required String label,
            bool enabled = true,
          }) {
            final isSelected = current == code;
            return InkWell(
              onTap:
                  enabled
                      ? () {
                          setState(() {
                            current = code;
                          });
                        }
                      : null,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.grey.shade100 : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                  border:
                      isSelected ? Border.all(color: Colors.grey.shade300) : null,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          color:
                              enabled
                                  ? Colors.black
                                  : Colors.black.withValues(alpha: 0.35),
                          fontWeight:
                              isSelected ? FontWeight.w600 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                dragHandle(),
                const SizedBox(height: 18),
                langTile(code: 'en', label: 'English', enabled: true),
                const SizedBox(height: 8),
                langTile(code: 'ar', label: 'العربية', enabled: true),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF982B2B),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () {
                      Navigator.of(context).pop(current);
                    },
                    child: Text('common.select'.tr()),
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          );
        },
      );
    },
  );
}
