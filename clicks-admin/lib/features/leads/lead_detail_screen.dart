import 'package:flutter/material.dart';

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
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class LeadDetailScreen extends StatefulWidget {
  const LeadDetailScreen({super.key, required this.leadId});

  final String leadId;

  @override
  State<LeadDetailScreen> createState() => _LeadDetailScreenState();
}

class _LeadDetailScreenState extends State<LeadDetailScreen> {
  Map<String, dynamic>? _lead;
  bool _loading = true;
  bool _working = false;
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
        url: '${EndPoints.leads}/${widget.leadId}',
      );
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        setState(() {
          _lead = Map<String, dynamic>.from(
            (data['lead'] ?? data) as Map,
          );
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Lead not found';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load lead';
        _loading = false;
      });
    }
  }

  Future<void> _updateStatus(String status) async {
    setState(() => _working = true);
    try {
      final res = await DioHelper.patchData(
        url: '${EndPoints.leads}/${widget.leadId}',
        data: {'status': status},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Update failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _markLost() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Mark lead lost'),
          content: TextField(
            controller: ctrl,
            decoration: const InputDecoration(labelText: 'Reason'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('Mark lost'),
            ),
          ],
        );
      },
    );
    if (reason == null) return;
    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: '${EndPoints.leads}/${widget.leadId}/lost',
        data: {'reason': reason},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading lead…');
    if (_error != null) {
      return AdminEmptyState(
        message: _error!,
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }

    final lead = _lead!;
    final status = lead['status']?.toString() ?? '';
    // Mirrors CONVERTIBLE_LEAD_STATUSES on the API: lost leads may be
    // converted (customer came back); converted leads never convert twice.
    final canConvert =
        ['new', 'contacted', 'qualified', 'lost'].contains(status);
    final lostReason = lead['lost_reason']?.toString() ?? '';

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: lead['clientName']?.toString() ?? 'Lead',
          subtitle: lead['clientMobileNumber']?.toString(),
          trailing: StatusPill(label: status, status: status),
        ),
        const SizedBox(height: AppSpacing.lg),
        AdminCard(
          child: AdminInfoList(
            items: [
              AdminInfoItem(
                label: 'Phone',
                value: lead['clientMobileNumber']?.toString() ?? '—',
                icon: Icons.phone_outlined,
              ),
              AdminInfoItem(
                label: 'Email',
                value: lead['clientEmail']?.toString() ?? '—',
                icon: Icons.mail_outline,
              ),
              AdminInfoItem(
                label: 'Inquiry',
                value: lead['inquiry']?.toString() ?? '—',
                icon: Icons.help_outline,
              ),
              AdminInfoItem(
                label: 'Location',
                value: lead['location']?.toString() ?? '—',
                icon: Icons.location_on_outlined,
              ),
              AdminInfoItem(
                label: 'Source',
                value: lead['sourceName']?.toString() ?? lead['source']?.toString() ?? '—',
                icon: Icons.source_outlined,
              ),
              AdminInfoItem(
                label: 'Notes',
                value: lead['internalNotes']?.toString() ?? '—',
                icon: Icons.notes_outlined,
              ),
              if (status == 'lost' && lostReason.isNotEmpty)
                AdminInfoItem(
                  label: 'Lost reason',
                  value: lostReason,
                  icon: Icons.block_outlined,
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (canConvert)
          PrimaryButton(
            label: status == 'lost' ? 'Convert to job (reopen)' : 'Convert to job',
            loading: _working,
            onPressed: () => Navigator.of(context).pushNamed(
              Routes.leadConvertPath(widget.leadId),
            ),
          ),
        if (status == 'new') ...[
          const SizedBox(height: AppSpacing.sm),
          PrimaryButton(
            label: 'Mark contacted',
            outlined: true,
            loading: _working,
            onPressed: () => _updateStatus('contacted'),
          ),
        ],
        if (status == 'contacted') ...[
          const SizedBox(height: AppSpacing.sm),
          PrimaryButton(
            label: 'Mark qualified',
            outlined: true,
            loading: _working,
            onPressed: () => _updateStatus('qualified'),
          ),
        ],
        if (!['lost', 'converted'].contains(status)) ...[
          const SizedBox(height: AppSpacing.sm),
          PrimaryButton(
            label: 'Mark lost',
            outlined: true,
            loading: _working,
            onPressed: _markLost,
          ),
        ],
      ],
    );
  }
}
