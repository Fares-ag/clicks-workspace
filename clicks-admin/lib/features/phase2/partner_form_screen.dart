import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/primary_button.dart';
import '../../core/theme/app_spacing.dart';

class PartnerFormScreen extends StatefulWidget {
  const PartnerFormScreen({super.key, this.partnerId});
  final String? partnerId;

  @override
  State<PartnerFormScreen> createState() => _PartnerFormScreenState();
}

class _PartnerFormScreenState extends State<PartnerFormScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  bool _saving = false;
  bool get _isEdit => widget.partnerId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) _load();
  }

  Future<void> _load() async {
    final res = await DioHelper.getData(url: '${EndPoints.partners}/${widget.partnerId}');
    if (res.statusCode == 200 && res.data is Map && mounted) {
      final data = res.data as Map;
      final p = Map<String, dynamic>.from((data['partner'] ?? data) as Map);
      _name.text = p['name']?.toString() ?? '';
      _email.text = p['email']?.toString() ?? '';
      _phone.text = p['phone']?.toString() ?? '';
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final body = {
      'name': _name.text.trim(),
      'email': _email.text.trim(),
      'phone': _phone.text.trim(),
    };
    final res = _isEdit
        ? await DioHelper.patchData(url: '${EndPoints.partners}/${widget.partnerId}', data: body)
        : await DioHelper.postData(url: EndPoints.partners, data: body);
    if (!mounted) return;
    setState(() => _saving = false);
    if (res.statusCode == 200 || res.statusCode == 201) {
      Navigator.pop(context, true);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(DioHelper.errorMessage(res) ?? 'Save failed')),
      );
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AdminPageContent(
      children: [
        Text(_isEdit ? 'Edit partner' : 'Add partner'),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
        TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
        TextField(controller: _phone, decoration: const InputDecoration(labelText: 'Phone')),
        const SizedBox(height: AppSpacing.lg),
        PrimaryButton(label: 'Save', loading: _saving, onPressed: _save),
      ],
    );
  }
}
