import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_info_list.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/primary_button.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_spacing.dart';

class AdminDetailScreen extends StatefulWidget {
  const AdminDetailScreen({super.key, required this.adminId});
  final String adminId;

  @override
  State<AdminDetailScreen> createState() => _AdminDetailScreenState();
}

class _AdminDetailScreenState extends State<AdminDetailScreen> {
  Map<String, dynamic>? _admin;
  bool _loading = true;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await DioHelper.getData(url: '${EndPoints.admins}/${widget.adminId}');
    if (!mounted) return;
    if (res.statusCode == 200 && res.data is Map) {
      final data = res.data as Map;
      setState(() {
        _admin = Map<String, dynamic>.from((data['admin'] ?? data) as Map);
        _loading = false;
      });
    } else {
      setState(() => _loading = false);
    }
  }

  Future<void> _toggle() async {
    final active = _admin?['isActive'] != false;
    setState(() => _working = true);
    await DioHelper.putData(
      url: '${EndPoints.admins}/${widget.adminId}/status',
      data: {'isActive': !active},
    );
    await _load();
    if (mounted) setState(() => _working = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading admin…');
    final a = _admin;
    if (a == null) return const Center(child: Text('Admin not found'));
    final name = '${a['firstName'] ?? ''} ${a['lastName'] ?? ''}'.trim();
    return AdminPageContent(
      children: [
        AdminDetailHeader(title: name.isEmpty ? 'Admin' : name, subtitle: a['email']?.toString()),
        AdminCard(
          child: AdminInfoList(
            items: [
              AdminInfoItem(label: 'Role', value: a['role']?.toString() ?? '—', icon: Icons.badge_outlined),
              AdminInfoItem(label: 'Phone', value: a['phone']?.toString() ?? '—', icon: Icons.phone_outlined),
              AdminInfoItem(label: 'Status', value: a['isActive'] == false ? 'Inactive' : 'Active', icon: Icons.toggle_on),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(label: 'Edit', onPressed: () async {
          await Navigator.of(context).pushNamed(Routes.adminEditPath(widget.adminId));
          _load();
        }),
        const SizedBox(height: AppSpacing.sm),
        PrimaryButton(
          label: a['isActive'] == false ? 'Activate' : 'Deactivate',
          outlined: true,
          loading: _working,
          onPressed: _toggle,
        ),
      ],
    );
  }
}
