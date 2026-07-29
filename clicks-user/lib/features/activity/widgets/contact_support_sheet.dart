import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../core/helper/content_repository.dart';
/// Bottom‑sheet with "Select Issue" dropdown + description field.
/// Calls [ContentRepository.submitContactUs] on submit.
/// Returns `true` on successful submission so the caller can show the
/// confirmation overlay.
class ContactSupportSheet extends StatefulWidget {
  const ContactSupportSheet({super.key});

  @override
  State<ContactSupportSheet> createState() => _ContactSupportSheetState();
}

class _ContactSupportSheetState extends State<ContactSupportSheet> {
  final _descCtrl = TextEditingController();
  final ContentRepository _repository = ContentRepository();

  String? _issue;
  bool _submitting = false;
  bool _dropdownOpen = false;

  List<String> get _issues => [
    'settings.technical_issue'.tr(),
    'settings.emergency_requests'.tr(),
    'settings.technician_dispute'.tr(),
    'settings.general_inquiry'.tr(),
  ];

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _issue != null &&
      _issue!.isNotEmpty &&
      _descCtrl.text.trim().isNotEmpty &&
      !_submitting;

  Future<void> _submit() async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    try {
      await _repository.submitContactUs(
        issue: _issue!,
        description: _descCtrl.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context, true); // signal success
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  InputBorder _border([Color? c]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: c ?? const Color(0xFFD0D5DD)),
      );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        padding: EdgeInsets.fromLTRB(16.w, 10.h, 16.w, 30.h),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Close button row
            Align(
              alignment: Alignment.topRight,
              child: GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF2F4F7),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, size: 20, color: Color(0xFF667085)),
                ),
              ),
            ),
            SizedBox(height: 4.h),

            // Title
            Text(
              'activity_details.contact_support'.tr(),
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 24.sp,
                fontWeight: FontWeight.w500,
                color: const Color(0xFF252525),
              ),
            ),
            SizedBox(height: 24.h),

            // Select Issue label
            Text(
              'activity_details.select_issue'.tr(),
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 14.sp,
                fontWeight: FontWeight.w500,
                color: const Color(0xFF494949),
                letterSpacing: -0.14,
              ),
            ),
            SizedBox(height: 6.h),

            // Dropdown
            GestureDetector(
              onTap: () => setState(() => _dropdownOpen = !_dropdownOpen),
              child: Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFD0D5DD)),
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0D101828),
                      offset: Offset(0, 1),
                      blurRadius: 2,
                    ),
                  ],
                  color: Colors.white,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _issue ?? 'activity_details.select_option'.tr(),
                        style: TextStyle(
                          fontFamily: 'HelveticaNeue',
                          fontSize: 14.sp,
                          color: _issue == null
                              ? const Color(0xFF98A2B3)
                              : const Color(0xFF252525),
                        ),
                      ),
                    ),
                    Icon(
                      _dropdownOpen
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      color: const Color(0xFF667085),
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),
            if (_dropdownOpen)
              Container(
                margin: EdgeInsets.only(top: 4.h),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFD0D5DD)),
                  borderRadius: BorderRadius.circular(8),
                  color: Colors.white,
                ),
                child: Column(
                  children: _issues.map((issue) {
                    return InkWell(
                      onTap: () {
                        setState(() {
                          _issue = issue;
                          _dropdownOpen = false;
                        });
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        child: Text(
                          issue,
                          style: TextStyle(
                            fontFamily: 'HelveticaNeue',
                            fontSize: 14.sp,
                            color: const Color(0xFF252525),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),

            SizedBox(height: 24.h),

            // Description label
            Text(
              'activity_details.description'.tr(),
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 14.sp,
                fontWeight: FontWeight.w500,
                color: const Color(0xFF494949),
                letterSpacing: -0.14,
              ),
            ),
            SizedBox(height: 6.h),

            // Description text field
            SizedBox(
              height: 120,
              child: TextFormField(
                controller: _descCtrl,
                maxLines: 5,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'activity_details.enter_description'.tr(),
                  hintStyle: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 14.sp,
                    color: const Color(0xFF98A2B3),
                  ),
                  border: _border(),
                  enabledBorder: _border(),
                  focusedBorder: _border(Colors.black87),
                  contentPadding: const EdgeInsets.all(16),
                ),
              ),
            ),

            SizedBox(height: 24.h),

            // Submit button
            SizedBox(
              width: double.infinity,
              height: 44,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                    color: _canSubmit
                        ? const Color(0xFFD0D5DD)
                        : const Color(0xFFE4E7EC),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  backgroundColor: Colors.white,
                ),
                onPressed: _canSubmit ? _submit : null,
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Color(0xFF494949)),
                      )
                    : Text(
                        'common.submit'.tr(),
                        style: TextStyle(
                          fontFamily: 'HelveticaNeue',
                          fontSize: 14.sp,
                          fontWeight: FontWeight.w500,
                          color: _canSubmit
                              ? const Color(0xFF494949)
                              : const Color(0xFFD0D5DD),
                          letterSpacing: -0.14,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
