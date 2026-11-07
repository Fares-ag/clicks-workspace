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

class PartnerDetailScreen extends StatefulWidget {
  const PartnerDetailScreen({super.key, required this.partnerId});
  final String partnerId;

  @override
  State<PartnerDetailScreen> createState() => _PartnerDetailScreenState();
}

class _PartnerDetailScreenState extends State<PartnerDetailScreen> {
  Map<String, dynamic>? _partner;
  Map<String, dynamic>? _earnings;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([
      DioHelper.getData(url: '${EndPoints.partners}/${widget.partnerId}'),
      DioHelper.getData(url: '${EndPoints.partners}/${widget.partnerId}/earnings'),
    ]);
    if (!mounted) return;
    Map<String, dynamic>? partner;
    if (results[0].statusCode == 200 && results[0].data is Map) {
      final data = results[0].data as Map;
      partner = Map<String, dynamic>.from((data['partner'] ?? data) as Map);
    }
    Map<String, dynamic>? earnings;
    if (results[1].statusCode == 200 && results[1].data is Map) {
      earnings = Map<String, dynamic>.from(results[1].data as Map);
    }
    setState(() {
      _partner = partner;
      _earnings = earnings;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading partner…');
    final p = _partner;
    if (p == null) return const Center(child: Text('Partner not found'));
    return AdminPageContent(
      children: [
        AdminDetailHeader(title: p['name']?.toString() ?? 'Partner', subtitle: p['email']?.toString()),
        AdminCard(
          child: AdminInfoList(
            items: [
              AdminInfoItem(label: 'Phone', value: p['phone']?.toString() ?? '—', icon: Icons.phone_outlined),
              AdminInfoItem(label: 'Status', value: p['status']?.toString() ?? '—', icon: Icons.flag_outlined),
              AdminInfoItem(
                label: 'Earnings',
                value: '${_earnings?['total'] ?? _earnings?['earnings'] ?? '—'}',
                icon: Icons.payments_outlined,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Edit',
          onPressed: () async {
            await Navigator.of(context).pushNamed(Routes.partnerEditPath(widget.partnerId));
            _load();
          },
        ),
      ],
    );
  }
}
