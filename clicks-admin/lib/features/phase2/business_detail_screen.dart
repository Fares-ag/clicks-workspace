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

class BusinessDetailScreen extends StatefulWidget {
  const BusinessDetailScreen({super.key, required this.businessId});
  final String businessId;

  @override
  State<BusinessDetailScreen> createState() => _BusinessDetailScreenState();
}

class _BusinessDetailScreenState extends State<BusinessDetailScreen> {
  Map<String, dynamic>? _biz;
  Map<String, dynamic>? _stats;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final results = await Future.wait([
      DioHelper.getData(url: '${EndPoints.businesses}/${widget.businessId}'),
      DioHelper.getData(url: '${EndPoints.businesses}/${widget.businessId}/stats'),
    ]);
    if (!mounted) return;
    Map<String, dynamic>? biz;
    if (results[0].statusCode == 200 && results[0].data is Map) {
      final data = results[0].data as Map;
      biz = Map<String, dynamic>.from((data['business'] ?? data) as Map);
    }
    Map<String, dynamic>? stats;
    if (results[1].statusCode == 200 && results[1].data is Map) {
      stats = Map<String, dynamic>.from(results[1].data as Map);
    }
    setState(() {
      _biz = biz;
      _stats = stats;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading business…');
    final b = _biz;
    if (b == null) return const Center(child: Text('Business not found'));
    return AdminPageContent(
      children: [
        AdminDetailHeader(title: b['name']?.toString() ?? 'Business', subtitle: b['email']?.toString()),
        AdminCard(
          child: AdminInfoList(
            items: [
              AdminInfoItem(label: 'Phone', value: b['phone']?.toString() ?? '—', icon: Icons.phone_outlined),
              AdminInfoItem(label: 'Active', value: b['isActive'] == false ? 'No' : 'Yes', icon: Icons.toggle_on),
              if (_stats != null)
                AdminInfoItem(label: 'Jobs', value: '${_stats!['jobs'] ?? _stats!['totalJobs'] ?? '—'}', icon: Icons.work_outline),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Edit',
          onPressed: () async {
            await Navigator.of(context).pushNamed(Routes.businessEditPath(widget.businessId));
            _load();
          },
        ),
      ],
    );
  }
}
