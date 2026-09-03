import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_empty_state.dart';
import '../../core/components/admin_info_list.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/primary_button.dart';
import '../../core/components/status_pill.dart';
import '../../core/theme/app_spacing.dart';

class TechnicianDetailScreen extends StatefulWidget {
  const TechnicianDetailScreen({super.key, required this.technicianId});
  final String technicianId;

  @override
  State<TechnicianDetailScreen> createState() => _TechnicianDetailScreenState();
}

class _TechnicianDetailScreenState extends State<TechnicianDetailScreen> {
  Map<String, dynamic>? _tech;
  bool _loading = true;
  String? _error;

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
      final res = await DioHelper.getData(
        url: '${EndPoints.technicians}/${widget.technicianId}',
      );
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        setState(() {
          _tech = Map<String, dynamic>.from(
            (data['technician'] ?? data) as Map,
          );
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Technician not found';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load technician';
        _loading = false;
      });
    }
  }

  Future<void> _call() async {
    final phone = _tech?['phone']?.toString() ?? '';
    if (phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading technician…');
    if (_error != null) {
      return AdminEmptyState(
        message: _error!,
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }

    final t = _tech!;
    final name = '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim();
    final status = t['currentStatus']?.toString() ?? '';

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: name.isEmpty ? 'Technician' : name,
          subtitle: t['email']?.toString(),
          trailing: status.isNotEmpty
              ? StatusPill(label: status, status: status)
              : null,
        ),
        const SizedBox(height: AppSpacing.lg),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AdminInfoList(
                items: [
                  AdminInfoItem(
                    label: 'Phone',
                    value: t['phone']?.toString() ?? '—',
                    icon: Icons.phone_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Email',
                    value: t['email']?.toString() ?? '—',
                    icon: Icons.mail_outline,
                  ),
                  AdminInfoItem(
                    label: 'Status',
                    value: status.isEmpty ? '—' : status,
                    icon: Icons.circle_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Application',
                    value: t['applicationStatus']?.toString() ?? '—',
                    icon: Icons.assignment_outlined,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              PrimaryButton(
                label: 'Call technician',
                onPressed: _call,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
