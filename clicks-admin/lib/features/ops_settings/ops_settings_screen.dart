import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// Ops settings (full admin): who is paged when an SOS escalates, and the
/// support number customers are shown. Admin values override the server's
/// ONCALL_PHONE / SUPPORT_PHONE env defaults; clearing a field falls back.
class OpsSettingsScreen extends StatefulWidget {
  const OpsSettingsScreen({super.key});

  @override
  State<OpsSettingsScreen> createState() => _OpsSettingsScreenState();
}

class _OpsSettingsScreenState extends State<OpsSettingsScreen> {
  final _oncallCtrl = TextEditingController();
  final _supportCtrl = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  Map<String, dynamic> _settings = const {};
  Map<String, dynamic> _envDefaults = const {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _oncallCtrl.dispose();
    _supportCtrl.dispose();
    super.dispose();
  }

  void _apply(dynamic data) {
    if (data is! Map) return;
    final settings = data['settings'] is Map
        ? Map<String, dynamic>.from(data['settings'] as Map)
        : <String, dynamic>{};
    final env = data['env_defaults'] is Map
        ? Map<String, dynamic>.from(data['env_defaults'] as Map)
        : <String, dynamic>{};
    final oncall = settings['oncall_phones'];
    final support = settings['support_phone'];
    _settings = settings;
    _envDefaults = env;
    if (oncall is Map && oncall['source'] == 'admin' && oncall['value'] is List) {
      _oncallCtrl.text = (oncall['value'] as List).join(', ');
    } else {
      _oncallCtrl.text = '';
    }
    if (support is Map && support['source'] == 'admin') {
      _supportCtrl.text = support['value']?.toString() ?? '';
    } else {
      _supportCtrl.text = '';
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final res = await DioHelper.getData(url: EndPoints.opsSettings);
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.statusCode == 200) {
        _apply(res.data);
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load ops settings';
      }
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final res = await DioHelper.putData(
      url: EndPoints.opsSettings,
      data: {
        'oncall_phones': _oncallCtrl.text.trim(),
        'support_phone': _supportCtrl.text.trim(),
      },
    );
    if (!mounted) return;
    setState(() {
      _saving = false;
      if (res.statusCode == 200) _apply(res.data);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          res.statusCode == 200
              ? 'Ops settings saved'
              : (DioHelper.errorMessage(res) ?? 'Save failed'),
        ),
        backgroundColor: res.statusCode == 200 ? null : AppColors.danger,
      ),
    );
  }

  String _effectiveLine(String key) {
    final entry = _settings[key];
    if (entry is! Map) return '—';
    final value = entry['value'];
    final source = entry['source']?.toString() ?? 'none';
    final shown = value is List
        ? (value.isEmpty ? 'none' : value.join(', '))
        : (value?.toString().isNotEmpty == true ? value.toString() : 'none');
    final from = switch (source) {
      'admin' => 'set here',
      'env' => 'server default',
      _ => 'not configured',
    };
    return '$shown ($from)';
  }

  String _envLine(String key) {
    final value = _envDefaults[key];
    if (value is List) return value.isEmpty ? 'none' : value.join(', ');
    return value?.toString().isNotEmpty == true ? value.toString() : 'none';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: AdminTypography.body),
            const SizedBox(height: AppSpacing.md),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ops settings', style: AdminTypography.pageTitle),
            const SizedBox(height: AppSpacing.sm),
            Text(
              'Who is paged when an SOS waits 5 minutes with no dispatcher, and '
              'the number customers are told to call. Leave a field empty to use '
              'the server default.',
              style: AdminTypography.body,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text('On-call phones (SMS)', style: AdminTypography.heading),
            const SizedBox(height: AppSpacing.xs),
            TextField(
              controller: _oncallCtrl,
              decoration: const InputDecoration(
                hintText: '+97455500001, +97455500002',
                helperText: 'Comma-separated, international format (E.164)',
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text('In effect: ${_effectiveLine('oncall_phones')}',
                style: AdminTypography.caption),
            Text('Server default: ${_envLine('oncall_phones')}',
                style: AdminTypography.caption),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'With no on-call number at all, escalations alert every admin by '
              'push and in the app instead.',
              style: AdminTypography.caption,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text('Customer support number', style: AdminTypography.heading),
            const SizedBox(height: AppSpacing.xs),
            TextField(
              controller: _supportCtrl,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(hintText: '+97444000000'),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text('In effect: ${_effectiveLine('support_phone')}',
                style: AdminTypography.caption),
            Text('Server default: ${_envLine('support_phone')}',
                style: AdminTypography.caption),
            const SizedBox(height: AppSpacing.lg),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving...' : 'Save'),
            ),
          ],
        ),
      ),
    );
  }
}
