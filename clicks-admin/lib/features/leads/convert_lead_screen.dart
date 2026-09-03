import 'package:flutter/material.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/admin_card.dart';
import '../../core/components/admin_detail_header.dart';
import '../../core/components/admin_empty_state.dart';
import '../../core/components/admin_loading_state.dart';
import '../../core/components/admin_page_content.dart';
import '../../core/components/admin_page_scaffold.dart';
import '../../core/components/primary_button.dart';
import '../../core/constants/job_types.dart';
import '../../core/forms/form_fields.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/admin_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

class ConvertLeadScreen extends StatefulWidget {
  const ConvertLeadScreen({super.key, required this.leadId});
  final String leadId;

  @override
  State<ConvertLeadScreen> createState() => _ConvertLeadScreenState();
}

class _ConvertLeadScreenState extends State<ConvertLeadScreen> {
  Map<String, dynamic>? _lead;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  final _location = TextEditingController();
  final _price = TextEditingController();
  final _issue = TextEditingController();
  String? _jobType;
  String? _technicianId;
  DateTime? _dateTime;

  List<Map<String, dynamic>> _technicians = [];

  @override
  void initState() {
    super.initState();
    _load();
    _loadTechnicians();
  }

  Future<void> _loadTechnicians() async {
    final res = await DioHelper.getData(url: '${EndPoints.technicians}?limit=100');
    if (res.statusCode == 200 && res.data is Map) {
      final list = (res.data as Map)['technicians'];
      if (list is List) {
        setState(() {
          _technicians = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        });
      }
    }
  }

  Future<void> _load() async {
    try {
      final res = await DioHelper.getData(url: '${EndPoints.leads}/${widget.leadId}');
      if (res.statusCode == 200 && res.data is Map) {
        final lead = Map<String, dynamic>.from(
          ((res.data as Map)['lead'] ?? res.data) as Map,
        );
        setState(() {
          _lead = lead;
          _location.text = lead['location']?.toString() ?? '';
          _issue.text = lead['inquiry']?.toString() ?? '';
          _jobType = lead['serviceType']?.toString();
          if (lead['proposedPrice'] != null) {
            _price.text = lead['proposedPrice'].toString();
          }
          if (lead['preferredDateTime'] != null) {
            _dateTime = DateTime.tryParse(lead['preferredDateTime'].toString());
          }
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

  List<Map<String, dynamic>> get _availableTechnicians {
    return _technicians.where((tech) {
      final approved = tech['applicationStatus'] == 'Approved';
      final status = tech['currentStatus']?.toString() ?? '';
      final available = status == 'Online' || status == 'On Job';
      if (_jobType == null || _jobType!.isEmpty) return approved && available;
      return approved &&
          available &&
          matchesJobTypeExpertise(_jobType!, (tech['expertise'] as List?) ?? []);
    }).toList();
  }

  Future<void> _convert() async {
    if (_location.text.trim().isEmpty ||
        _dateTime == null ||
        _jobType == null ||
        _price.text.trim().isEmpty ||
        _issue.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete all required job fields')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final body = {
        'location': _location.text.trim(),
        'dateTime': _dateTime!.toUtc().toIso8601String(),
        'jobType': _jobType,
        'price': num.tryParse(_price.text.trim()) ?? _price.text.trim(),
        'issue': _issue.text.trim(),
        if (_technicianId != null && _technicianId!.isNotEmpty)
          'assignedTechnician': _technicianId,
      };
      final res = await DioHelper.postData(
        url: '${EndPoints.leads}/${widget.leadId}/convert',
        data: body,
      );
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        final data = res.data;
        String? jobId;
        if (data is Map) {
          jobId = data['job']?['_id']?.toString() ?? data['job_id']?.toString();
        }
        if (jobId != null && jobId.isNotEmpty) {
          Navigator.of(context).pushNamedAndRemoveUntil(
            Routes.jobDetailPath(jobId),
            (route) => route.settings.name == Routes.leads,
          );
        } else {
          Navigator.of(context).pushNamedAndRemoveUntil(Routes.jobs, (_) => false);
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Convert failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _location.dispose();
    _price.dispose();
    _issue.dispose();
    super.dispose();
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
    if (!['new', 'contacted', 'qualified'].contains(status)) {
      return AdminEmptyState(
        message: 'This lead cannot be converted (status: $status)',
        iconAsset: 'assets/icons/warning.svg',
        action: PrimaryButton(
          label: 'Back to lead',
          onPressed: () => Navigator.pop(context),
        ),
      );
    }

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: 'Convert Lead to Job',
          subtitle: lead['clientName']?.toString(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AdminCard(
          margin: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                lead['clientName']?.toString() ?? 'Lead',
                style: AdminTypography.heading,
              ),
              const SizedBox(height: 4),
              Text(
                lead['clientMobileNumber']?.toString() ?? '',
                style: AdminTypography.body.copyWith(color: AppColors.muted),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(lead['inquiry']?.toString() ?? ''),
            ],
          ),
        ),
        AdminCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            children: [
              AdminLabeledField(
                label: 'Location',
                required: true,
                child: TextField(controller: _location),
              ),
              AdminLabeledField(
                label: 'Date & Time',
                required: true,
                child: DateTimePickerField(
                  value: _dateTime,
                  onChanged: (dt) => setState(() => _dateTime = dt),
                ),
              ),
              AdminDropdown<String>(
                label: 'Job Type',
                required: true,
                value: _jobType,
                items: kJobTypes.map((j) => j.value).toList(),
                itemLabel: jobTypeLabel,
                onChanged: (v) => setState(() {
                  _jobType = v;
                  _technicianId = null;
                }),
              ),
              AdminLabeledField(
                label: 'Price',
                required: true,
                child: TextField(controller: _price, keyboardType: TextInputType.number),
              ),
              AdminLabeledField(
                label: 'Issue',
                required: true,
                child: TextField(controller: _issue, maxLines: 3),
              ),
              AdminDropdown<String>(
                label: 'Assigned Technician',
                value: _technicianId,
                items: _availableTechnicians.map((t) => t['_id']?.toString() ?? '').where((s) => s.isNotEmpty).toList(),
                itemLabel: (id) {
                  final t = _availableTechnicians.firstWhere(
                    (x) => x['_id']?.toString() == id,
                    orElse: () => {},
                  );
                  return '${t['firstName'] ?? ''} ${t['lastName'] ?? ''}'.trim();
                },
                onChanged: (v) => setState(() => _technicianId = v),
              ),
              const SizedBox(height: 16),
              AdminFormActions(
                onCancel: () => Navigator.pop(context),
                onSave: _convert,
                saveLabel: 'Convert to job',
                loading: _saving,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
