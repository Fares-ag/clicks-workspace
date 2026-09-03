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
import '../../core/constants/job_status_labels.dart';
import '../../core/constants/job_types.dart';
import '../../core/helper/job_location_display.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});
  final String jobId;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Map<String, dynamic>? _job;
  bool _loading = true;
  bool _working = false;
  String? _error;
  List<Map<String, dynamic>> _technicians = [];
  String? _selectedTechnician;

  @override
  void initState() {
    super.initState();
    _load();
    _loadTechnicians();
  }

  Future<void> _loadTechnicians() async {
    try {
      final res = await DioHelper.getData(url: '${EndPoints.technicians}?limit=100');
      if (res.statusCode == 200 && res.data is Map) {
        final list = (res.data as Map)['technicians'];
        if (list is List) {
          setState(() {
            _technicians = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: '${EndPoints.jobs}/${widget.jobId}');
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        final job = Map<String, dynamic>.from((data['job'] ?? data) as Map);
        setState(() {
          _job = job;
          _selectedTechnician = job['assignedTechnician']?.toString() ??
              (job['technician'] is Map
                  ? (job['technician'] as Map)['_id']?.toString()
                  : null);
          _loading = false;
        });
      } else {
        setState(() {
          _error = DioHelper.errorMessage(res) ?? 'Job not found';
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Failed to load job';
        _loading = false;
      });
    }
  }

  Future<void> _assignTechnician() async {
    if (_selectedTechnician == null || _selectedTechnician!.isEmpty) return;
    setState(() => _working = true);
    try {
      final res = await DioHelper.patchData(
        url: '${EndPoints.jobs}/${widget.jobId}',
        data: {'assignedTechnician': _selectedTechnician},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Technician assigned')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Assign failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _cancelJob() async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Cancel job'),
          content: TextField(
            controller: ctrl,
            decoration: const InputDecoration(labelText: 'Reason'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Back')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('Cancel job'),
            ),
          ],
        );
      },
    );
    if (reason == null || reason.isEmpty) return;

    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: '${EndPoints.jobs}/${widget.jobId}/cancel',
        data: {'reason': reason},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Cancel failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _openMaps() async {
    final job = _job;
    if (job == null) return;
    final link = buildJobMapsLink(job);
    if (link == null) return;
    final uri = Uri.parse(link);
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _callClient() async {
    final phone = _job?['clientMobileNumber']?.toString() ?? '';
    if (phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  List<Map<String, dynamic>> get _availableTechnicians {
    final jobType = _job?['jobType']?.toString() ?? '';
    return _technicians.where((tech) {
      final approved = tech['applicationStatus'] == 'Approved';
      if (jobType.isEmpty) return approved;
      final expertise = (tech['expertise'] as List?) ?? [];
      return approved && matchesJobTypeExpertise(jobType, expertise);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const AdminLoadingState(message: 'Loading job…');
    if (_error != null) {
      return AdminEmptyState(
        message: _error!,
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(label: 'Retry', onPressed: _load),
      );
    }
    final job = _job!;
    final status = job['job_status']?.toString() ?? '';
    final location = formatJobLocationDisplay(job);
    final mapsLink = buildJobMapsLink(job);
    final jobId = job['jobId']?.toString() ?? widget.jobId;

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: job['clientName']?.toString() ?? 'Job',
          subtitle: 'Job #$jobId',
          trailing: StatusPill(label: JobStatusLabels.labelFor(status), status: status),
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
                    value: job['clientMobileNumber']?.toString() ?? '—',
                    icon: Icons.phone_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Email',
                    value: job['clientEmail']?.toString() ?? '—',
                    icon: Icons.mail_outline,
                  ),
                  AdminInfoItem(
                    label: 'Job type',
                    value: jobTypeLabel(job['jobType']?.toString()),
                    icon: Icons.build_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Issue',
                    value: job['issue']?.toString() ?? '—',
                    icon: Icons.report_problem_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Location',
                    value: location.isEmpty ? '—' : location,
                    icon: Icons.location_on_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Price',
                    value: job['price']?.toString() ?? '—',
                    icon: Icons.payments_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Vehicle',
                    value: '${job['vehicleMake'] ?? ''} ${job['vehicleModel'] ?? ''}'.trim().isEmpty
                        ? '—'
                        : '${job['vehicleMake'] ?? ''} ${job['vehicleModel'] ?? ''}'.trim(),
                    icon: Icons.directions_car_outlined,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: PrimaryButton(
                      label: 'Call client',
                      onPressed: _callClient,
                    ),
                  ),
                  if (mapsLink != null) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Open maps',
                        outlined: true,
                        onPressed: _openMaps,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Assign technician', style: AdminTypography.heading),
              const SizedBox(height: AppSpacing.sm),
              const Divider(height: 1, color: AppColors.border),
              const SizedBox(height: AppSpacing.md),
              DropdownButtonFormField<String>(
                value: _selectedTechnician,
                isExpanded: true,
                items: _availableTechnicians
                    .map((t) => DropdownMenuItem(
                          value: t['_id']?.toString(),
                          child: Text('${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim()),
                        ))
                    .toList(),
                onChanged: _working ? null : (v) => setState(() => _selectedTechnician = v),
                decoration: const InputDecoration(hintText: 'Select technician'),
              ),
              const SizedBox(height: AppSpacing.sm),
              PrimaryButton(
                label: 'Save assignment',
                loading: _working,
                onPressed: _assignTechnician,
              ),
            ],
          ),
        ),
        if (status != 'completed' && status != 'cancelled') ...[
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(
            label: 'Cancel job',
            outlined: true,
            loading: _working,
            onPressed: _cancelJob,
          ),
        ],
      ],
    );
  }
}
