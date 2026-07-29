import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../../../core/helper/content_repository.dart';
import '../../../../core/theme/text_styles.dart';

class ContactUsScreen extends StatefulWidget {
  const ContactUsScreen({super.key});

  @override
  State<ContactUsScreen> createState() => _ContactUsScreenState();
}

class _ContactUsScreenState extends State<ContactUsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descCtrl = TextEditingController();
  final ContentRepository _repository = ContentRepository();

  String? _issue;
  bool _submitting = false;

  List<String> get _issues => [
    'settings.technical_issue'.tr(),
    'settings.emergency_requests'.tr(),
    'settings.technician_dispute'.tr(),
    'settings.general_inquiry'.tr(),
  ];
  @override
  void initState() {
    super.initState();
    _issueController = ExpansibleController();
  }

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final valid = _formKey.currentState!.validate();
    if (!valid) return;
    setState(() => _submitting = true);
    try {
      await _repository.submitContactUs(
        issue: _issue!,
        description: _descCtrl.text.trim(),
      );
      if (!mounted) return;
      // Navigate to contact us success screen and remove contact us screen
      Navigator.pushReplacementNamed(context, '/contactUsSuccess');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  late final ExpansibleController _issueController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    InputBorder outline([Color? c]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: c ?? const Color(0xFFE5E5E5)),
    );

    final canSubmit =
        (_issue != null && _issue!.isNotEmpty) &&
        _descCtrl.text.trim().isNotEmpty &&
        !_submitting;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        shape: Border(bottom: BorderSide(color: Colors.grey, width: 1.0)),
        centerTitle: false,
        title: Text(
          'settings.contact_us'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            fontSize: 20.sp,
          ),
        ),
      ),

      body: SafeArea(
        child: Form(
          key: _formKey, // enables validate() across fields[10]
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              // Select Issue
              // Text('Select Issue', style: theme.textTheme.labelLarge),
              // const SizedBox(height: 8),

              // DropdownButtonFormField<String>(
              //   value: _issue,
              //   isExpanded: true,
              //   dropdownColor: Colors.white,
              //   icon: const Icon(Icons.keyboard_arrow_down_rounded),
              //   decoration: InputDecoration(
              //     contentPadding: const EdgeInsets.symmetric(
              //       horizontal: 12,
              //       vertical: 14,
              //     ),
              //     border: outline(),
              //     enabledBorder: outline(),
              //     focusedBorder: outline(Colors.black87),
              //     errorBorder: outline(Colors.red),
              //   ),
              //   hint: const Text('Select Option'),
              //   items:
              //       _issues
              //           .map(
              //             (e) => DropdownMenuItem<String>(
              //               value: e,
              //               child: Text(e),
              //             ),
              //           )
              //           .toList(),
              //   onChanged: (v) => setState(() => _issue = v),
              //   validator:
              //       (v) =>
              //           v == null || v.isEmpty
              //               ? 'Please select an issue'
              //               : null, // built-in validation path for dropdowns[5][3][7]
              // ),
              Text('settings.select_issue'.tr(), style: theme.textTheme.labelLarge),
              const SizedBox(height: 8),

              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFE5E5E5)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: ExpansionTile(
                  controller: _issueController,

                  title: Text(
                    _issue ?? 'settings.select_option'.tr(),
                    style: TextStyle(
                      color: _issue == null ? Colors.grey : Colors.black,
                    ),
                  ),
                  children:
                      _issues.map((issue) {
                        return ListTile(
                          title: Text(issue),
                          onTap: () {
                            setState(() => _issue = issue);
                            _issueController.collapse();
                          },
                        );
                      }).toList(),
                ),
              ),

              const SizedBox(height: 20),

              // Description
              Text('settings.description'.tr(), style: theme.textTheme.labelLarge),
              const SizedBox(height: 8),
              TextFormField(
                controller: _descCtrl,
                maxLines: 5,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'activity_details.enter_description'.tr(),
                  border: outline(),
                  enabledBorder: outline(),
                  focusedBorder: outline(Colors.black87),
                  errorBorder: outline(Colors.red),
                  contentPadding: const EdgeInsets.all(12),
                ),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'settings.description_required'.tr();
                  if (t.length < 10) return 'settings.description_min_chars'.tr();
                  return null;
                },
              ),

              const SizedBox(height: 20),

              // Submit
              SizedBox(
                height: 48,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF982B2B),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: canSubmit ? _submit : null,
                  child:
                      _submitting
                          ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                          : Text('common.submit'.tr()),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
