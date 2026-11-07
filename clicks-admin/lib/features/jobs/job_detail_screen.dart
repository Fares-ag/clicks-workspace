import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
import '../../core/constants/job_reassign_reasons.dart';
import '../../core/constants/job_status_labels.dart';
import '../../core/constants/job_types.dart';
import '../../core/auth/admin_roles.dart';
import '../../core/helper/admin_time_picker.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/helper/download_helper.dart';
import '../../core/helper/dropdown_value.dart';
import '../../core/helper/job_location_display.dart';
import '../../core/helper/job_origin.dart';
import '../../core/helper/list_row_helpers.dart';
import '../../core/routing/routes.dart';
import '../../core/socket/admin_socket_service.dart';
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
  List<Map<String, dynamic>> _repairs = [];
  Map<String, dynamic>? _receipt;
  bool _downloadingReceipt = false;

  @override
  void initState() {
    super.initState();
    _load();
    _loadTechnicians();
    _loadRepairs();
    _loadReceipt();
    AdminSocketService.instance.onJobInvalidated = _onJobInvalidated;
  }

  @override
  void dispose() {
    if (AdminSocketService.instance.onJobInvalidated == _onJobInvalidated) {
      AdminSocketService.instance.onJobInvalidated = null;
    }
    super.dispose();
  }

  void _onJobInvalidated() {
    if (mounted) {
      _load();
      _loadRepairs();
    }
  }

  String _formatAt(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '';
    return DateFormat('dd MMM yyyy, h:mm a').format(dt.toLocal());
  }

  List<AdminInfoItem> _lifecycleItems(Map<String, dynamic> job) {
    const steps = [
      ('Assigned', 'assigned_at'),
      ('Accepted', 'accepted_at'),
      ('En route', 'en_route_at'),
      ('Arrived', 'arrived_at'),
      ('Started', 'started_at'),
      ('Completed', 'completed_at'),
    ];
    return [
      for (final step in steps)
        if (_formatAt(job[step.$2]).isNotEmpty)
          AdminInfoItem(
            label: step.$1,
            value: _formatAt(job[step.$2]),
            icon: Icons.schedule,
          ),
    ];
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
          _selectedTechnician = assignedTechnicianId(job['assignedTechnician']) ??
              assignedTechnicianId(job['technician']);
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

  Future<void> _loadRepairs() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.jobRepairs(widget.jobId));
      if (res.statusCode == 200 && res.data is Map) {
        final list = (res.data as Map)['repairs'];
        if (list is List && mounted) {
          setState(() {
            _repairs = list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
          });
        }
      }
    } catch (_) {}
  }

  Future<void> _loadReceipt() async {
    try {
      final res = await DioHelper.getData(url: EndPoints.jobReceipt(widget.jobId));
      if (res.statusCode == 200 && res.data is Map && mounted) {
        final data = Map<String, dynamic>.from(res.data as Map);
        final inner = data['receipt'];
        setState(() {
          _receipt = inner is Map
              ? Map<String, dynamic>.from(inner)
              : data;
        });
      }
    } catch (_) {}
  }

  Future<void> _assignTechnician() async {
    if (_selectedTechnician == null || _selectedTechnician!.isEmpty) return;
    if (canReassignJob(_job)) {
      await _reassignTechnician();
      return;
    }
    setState(() => _working = true);
    try {
      final res = await DioHelper.putData(
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

  Future<void> _reassignTechnician() async {
    String? reason = kJobReassignReasons.first.value;
    final noteCtrl = TextEditingController();
    try {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => StatefulBuilder(
          builder: (ctx, setLocal) => AlertDialog(
            title: const Text('Reassign technician'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  value: reason,
                  items: kJobReassignReasons
                      .map((r) => DropdownMenuItem(value: r.value, child: Text(r.label)))
                      .toList(),
                  onChanged: (v) => setLocal(() => reason = v),
                ),
                TextField(
                  controller: noteCtrl,
                  decoration: const InputDecoration(labelText: 'Note (optional)'),
                  maxLines: 2,
                ),
              ],
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reassign')),
            ],
          ),
        ),
      );
      if (ok != true || reason == null) return;

      setState(() => _working = true);
      final res = await DioHelper.postData(
        url: EndPoints.jobReassign(widget.jobId),
        data: {
          'technician_id': _selectedTechnician,
          'reason': reason,
          if (noteCtrl.text.trim().isNotEmpty) 'reason_note': noteCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Technician reassigned')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Reassign failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
      noteCtrl.dispose();
    }
  }

  Future<void> _approveHoldRequest() async {
    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.jobHoldRequestApprove(widget.jobId),
        data: {},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Hold request approved')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Approve failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _rejectHoldRequest() async {
    final note = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final ctrl = TextEditingController();
        return AlertDialog(
          title: const Text('Reject hold request'),
          content: TextField(
            controller: ctrl,
            decoration: const InputDecoration(
              labelText: 'Note for technician (optional)',
            ),
            maxLines: 3,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
              child: const Text('Reject'),
            ),
          ],
        );
      },
    );
    if (note == null) return;

    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.jobHoldRequestReject(widget.jobId),
        data: {'note': note},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Reject failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _putOnHold() async {
    final ctrl = TextEditingController();
    DateTime? returnAt;
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Put job on hold'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: ctrl,
                decoration: const InputDecoration(labelText: 'Reason'),
                maxLines: 3,
              ),
              TextButton(
                onPressed: () async {
                  final date = await showDatePicker(
                    context: ctx,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                    initialDate: returnAt ?? DateTime.now(),
                  );
                  if (date == null) return;
                  final time = await showAdminTimePicker(
                    ctx,
                    initialTime: TimeOfDay.fromDateTime(returnAt ?? DateTime.now()),
                    title: 'Return time',
                  );
                  if (time == null) return;
                  setLocal(() {
                    returnAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
                  });
                },
                child: Text(
                  returnAt == null
                      ? 'Optional return date'
                      : 'Return: ${returnAt!.toLocal()}'.substring(0, 16),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                final text = ctrl.text.trim();
                if (text.isEmpty) return;
                Navigator.pop(ctx, text);
              },
              child: const Text('Confirm'),
            ),
          ],
        ),
      ),
    );
    ctrl.dispose();
    if (reason == null || reason.isEmpty) return;

    setState(() => _working = true);
    try {
      final body = <String, dynamic>{'reason': reason};
      if (returnAt != null) {
        body['scheduled_return_at'] = returnAt!.toUtc().toIso8601String();
      }
      final res = await DioHelper.postData(
        url: EndPoints.jobHold(widget.jobId),
        data: body,
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Hold failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _sendToGarage() async {
    final reasonCtrl = TextEditingController();
    final nameCtrl = TextEditingController();
    DateTime? readyAt;
    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Send to garage'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: reasonCtrl,
                decoration: const InputDecoration(labelText: 'Reason'),
                maxLines: 3,
              ),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Garage name (optional)'),
              ),
              TextButton(
                onPressed: () async {
                  final date = await showDatePicker(
                    context: ctx,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)),
                    initialDate: readyAt ?? DateTime.now(),
                  );
                  if (date == null) return;
                  final time = await showAdminTimePicker(
                    ctx,
                    initialTime: TimeOfDay.fromDateTime(readyAt ?? DateTime.now()),
                    title: 'Ready time',
                  );
                  if (time == null) return;
                  setLocal(() {
                    readyAt = DateTime(date.year, date.month, date.day, time.hour, time.minute);
                  });
                },
                child: Text(
                  readyAt == null
                      ? 'Expected ready date (optional)'
                      : 'Ready: ${readyAt!.toLocal()}'.substring(0, 16),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (reasonCtrl.text.trim().isEmpty) return;
                Navigator.pop(ctx, true);
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
    final reason = reasonCtrl.text.trim();
    final name = nameCtrl.text.trim();
    reasonCtrl.dispose();
    nameCtrl.dispose();
    if (submitted != true || reason.isEmpty) return;

    setState(() => _working = true);
    try {
      final body = <String, dynamic>{'reason': reason};
      if (name.isNotEmpty) body['garage_name'] = name;
      if (readyAt != null) {
        body['expected_ready_at'] = readyAt!.toUtc().toIso8601String();
      }
      final res = await DioHelper.postData(
        url: EndPoints.jobGarage(widget.jobId),
        data: body,
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Garage failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _markGarageReady() async {
    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.jobGarageReady(widget.jobId),
        data: {},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Ready failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _resumeJob() async {
    setState(() => _working = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.jobResume(widget.jobId),
        data: {},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Resume failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _completeJob() async {
    final notesCtrl = TextEditingController();
    final refCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mark job as completed'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'This closes the job in dispatch. Payment and signature are not required.',
              ),
              const SizedBox(height: AppSpacing.md),
              TextField(
                controller: refCtrl,
                decoration: const InputDecoration(
                  labelText: 'Job ID / reference (optional)',
                ),
                maxLength: 64,
              ),
              TextField(
                controller: notesCtrl,
                decoration: const InputDecoration(
                  labelText: 'Completion notes (optional)',
                ),
                maxLines: 3,
                maxLength: 2000,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Back')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Mark completed'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _working = true);
    try {
      final body = <String, String>{};
      final notes = notesCtrl.text.trim();
      final ref = refCtrl.text.trim();
      if (notes.isNotEmpty) body['completion_notes'] = notes;
      if (ref.isNotEmpty) body['job_reference'] = ref;

      final res = await DioHelper.postData(
        url: EndPoints.jobComplete(widget.jobId),
        data: body,
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Job marked as completed')),
        );
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Complete failed'),
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

  Future<void> _editEstimate() async {
    final job = _job;
    if (job == null) return;
    final ctrl = TextEditingController(text: job['price']?.toString() ?? job['estimate']?.toString() ?? '');
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit estimate'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Price / estimate (QAR)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Save')),
        ],
      ),
    );
    if (next == null || next.isEmpty) return;
    setState(() => _working = true);
    try {
      final res = await DioHelper.putData(
        url: '${EndPoints.jobs}/${widget.jobId}',
        data: {'price': next},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(DioHelper.errorMessage(res) ?? 'Estimate update failed'), backgroundColor: AppColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _downloadReceipt() async {
    final job = _job;
    if (job == null) return;
    if (job['job_status']?.toString() != 'completed') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Receipt can only be downloaded for completed jobs')),
      );
      return;
    }
    setState(() => _downloadingReceipt = true);
    try {
      final rawRef = job['job_reference']?.toString().trim();
      final ref = (rawRef != null && rawRef.isNotEmpty) ? rawRef : widget.jobId;
      final filename =
          'sanadcom-receipt-${ref.replaceAll(RegExp(r'[^\w.-]+'), '-')}.pdf';
      final path = await DownloadHelper.saveAuthenticatedBytes(
        url: EndPoints.jobReceiptDownload(widget.jobId),
        filename: filename,
      );
      if (!mounted) return;
      if (path == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to download receipt'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to download receipt'),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _downloadingReceipt = false);
    }
  }

  Future<void> _deleteJob() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete job'),
        content: const Text('This permanently deletes the job. Continue?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _working = true);
    try {
      final res = await DioHelper.deleteData(url: '${EndPoints.jobs}/${widget.jobId}');
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 204) {
        Navigator.of(context).pushNamedAndRemoveUntil(Routes.jobs, (_) => false);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(DioHelper.errorMessage(res) ?? 'Delete failed'), backgroundColor: AppColors.danger),
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

  /// Edit the job location (any status except completed — the API rejects
  /// completed jobs with 400). PUT /jobs/:id with { location } only; the API
  /// re-geocodes, updates locationCoordinates and clears a customer signature.
  Future<void> _editLocation() async {
    final job = _job;
    if (job == null) return;
    final ctrl = TextEditingController(text: job['location']?.toString() ?? '');
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit location'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Location',
            hintText: 'Address, lat/lng, or Google Maps / Waze link',
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (next == null || next.isEmpty) return;
    setState(() => _working = true);
    try {
      final res = await DioHelper.putData(
        url: '${EndPoints.jobs}/${widget.jobId}',
        data: {'location': next},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        await _load();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Location updated')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(DioHelper.errorMessage(res) ?? 'Location update failed'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
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
    final holdRequest = job['hold_request'];
    final holdRequestStatus =
        holdRequest is Map ? holdRequest['status']?.toString() : null;
    final holdRequestReason =
        holdRequest is Map ? holdRequest['reason']?.toString() ?? '' : '';
    final location = formatJobLocationDisplay(job);
    final mapsLink = buildJobMapsLink(job);
    final jobId = displayRef(job);
    final clientId = entityId(job['customer_id']) ?? entityId(job['customer']);
    final tech = job['assignedTechnician'] ?? job['technician'];
    final techId = entityId(tech);
    final techName = personName(tech, fallback: job['legacyTechnicianName']?.toString() ?? '—');
    final businessId = entityId(job['business_id']) ?? entityId(job['business']);
    final payment = paymentStatusOf(job);

    return AdminPageContent(
      children: [
        AdminDetailHeader(
          title: job['clientName']?.toString() ?? 'Job',
          subtitle: 'Job #$jobId · ${jobTypeLabel(job['jobType']?.toString())}',
          trailing: StatusPill(label: JobStatusLabels.labelFor(status), status: status),
        ),
        const SizedBox(height: AppSpacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () async {
              final updated = await Navigator.of(context).pushNamed(
                Routes.jobEditPath(widget.jobId),
              );
              if (updated == true) _load();
            },
            icon: const Icon(Icons.edit_outlined, size: 18),
            label: const Text('Edit job'),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AdminCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AdminInfoList(
                items: [
                  AdminInfoItem(
                    label: 'Client',
                    value: job['clientName']?.toString() ?? '—',
                    icon: Icons.person_outline,
                    onTap: clientId == null
                        ? null
                        : () => Navigator.of(context).pushNamed(Routes.clientDetailPath(clientId)),
                  ),
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
                    label: 'Technician',
                    value: techName,
                    icon: Icons.engineering_outlined,
                    onTap: techId == null
                        ? null
                        : () => Navigator.of(context).pushNamed(Routes.technicianDetailPath(techId)),
                  ),
                  if (businessId != null || (job['businessName']?.toString().isNotEmpty ?? false))
                    AdminInfoItem(
                      label: 'Business',
                      value: job['businessName']?.toString() ?? 'Business',
                      icon: Icons.business_outlined,
                      onTap: businessId == null
                          ? null
                          : () => Navigator.of(context).pushNamed(Routes.businessDetailPath(businessId)),
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
                    onTap: mapsLink == null ? null : _openMaps,
                  ),
                  AdminInfoItem(
                    label: 'Price',
                    value: formatPrice(job['price']),
                    icon: Icons.payments_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Payment',
                    icon: Icons.credit_card_outlined,
                    valueWidget: PaymentStatusPill(status: payment.isEmpty ? 'unpaid' : payment),
                  ),
                  AdminInfoItem(
                    label: 'Vehicle',
                    value: '${job['vehicleMake'] ?? ''} ${job['vehicleModel'] ?? ''} ${job['vehicleYear'] ?? ''}'.trim().isEmpty
                        ? '—'
                        : '${job['vehicleMake'] ?? ''} ${job['vehicleModel'] ?? ''} ${job['vehicleYear'] ?? ''}'.trim(),
                    icon: Icons.directions_car_outlined,
                  ),
                  AdminInfoItem(
                    label: 'Source',
                    value: formatJobSourceLabel(job),
                    icon: Icons.source_outlined,
                  ),
                  ..._lifecycleItems(job),
                ],
              ),
              if (status == 'en_route')
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => Navigator.of(context).pushNamed(Routes.liveMap),
                    icon: const Icon(Icons.map_outlined, size: 18),
                    label: const Text('View on live map'),
                  ),
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _working ? null : _editEstimate,
                  icon: const Icon(Icons.payments_outlined, size: 18),
                  label: const Text('Edit estimate'),
                ),
              ),
              if (job['hold_reason'] != null || job['job_status']?.toString() == 'on_hold')
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: AdminInfoList(
                    items: [
                      AdminInfoItem(
                        label: 'Hold reason',
                        value: job['hold_reason']?.toString() ?? '—',
                        icon: Icons.pause_circle_outline,
                      ),
                      AdminInfoItem(
                        label: 'On hold at',
                        value: job['on_hold_at']?.toString() ?? '—',
                        icon: Icons.schedule,
                      ),
                      AdminInfoItem(
                        label: 'Status before hold',
                        value: job['status_before_hold']?.toString() ?? '—',
                        icon: Icons.history,
                      ),
                      AdminInfoItem(
                        label: 'Scheduled return',
                        value: job['scheduled_return_at']?.toString() ?? '—',
                        icon: Icons.event,
                      ),
                    ],
                  ),
                ),
              if (job['garage'] is Map && (job['garage'] as Map)['phase'] != null)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: AdminInfoList(
                    items: [
                      AdminInfoItem(
                        label: 'Garage phase',
                        value: (job['garage'] as Map)['phase']?.toString() ?? '—',
                        icon: Icons.garage_outlined,
                      ),
                      AdminInfoItem(
                        label: 'Garage name',
                        value: (job['garage'] as Map)['name']?.toString().isNotEmpty == true
                            ? (job['garage'] as Map)['name'].toString()
                            : '—',
                        icon: Icons.store_mall_directory_outlined,
                      ),
                      AdminInfoItem(
                        label: 'Expected ready',
                        value: (job['garage'] as Map)['expected_ready_at']?.toString() ?? '—',
                        icon: Icons.event_available_outlined,
                      ),
                    ],
                  ),
                ),
              if (isSourceLockedJob(job))
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    'Source is locked for technician / business portal jobs',
                    style: AdminTypography.body.copyWith(color: AppColors.muted),
                  ),
                ),
              if (status == 'completed')
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    'Location cannot be changed after completion',
                    style: AdminTypography.body.copyWith(color: AppColors.muted),
                  ),
                )
              else
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _working ? null : _editLocation,
                    icon: const Icon(Icons.edit_location_alt_outlined, size: 18),
                    label: const Text('Edit location'),
                  ),
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
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: PrimaryButton(
                      label: 'WhatsApp',
                      outlined: true,
                      onPressed: () => shareJobOnWhatsApp(job),
                    ),
                  ),
                ],
              ),
              if (mapsLink != null) ...[
                const SizedBox(height: AppSpacing.sm),
                PrimaryButton(
                  label: 'Open maps',
                  outlined: true,
                  onPressed: _openMaps,
                ),
              ],
            ],
          ),
        ),
        if (canPickInitialTechnician(job) || canReassignJob(job)) ...[
          const SizedBox(height: AppSpacing.md),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  canReassignJob(job) ? 'Reassign technician' : 'Assign technician',
                  style: AdminTypography.heading,
                ),
                const SizedBox(height: AppSpacing.sm),
                const Divider(height: 1, color: AppColors.border),
                const SizedBox(height: AppSpacing.md),
                DropdownButtonFormField<String>(
                  value: safeDropdownValue(
                    _selectedTechnician,
                    _availableTechnicians.map((t) => t['_id']?.toString()),
                  ),
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
                  label: canReassignJob(job) ? 'Reassign' : 'Save assignment',
                  loading: _working,
                  onPressed: _assignTechnician,
                ),
              ],
            ),
          ),
        ],
        if (_repairs.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Repairs', style: AdminTypography.heading),
                const SizedBox(height: AppSpacing.sm),
                for (final r in _repairs)
                  ListTile(
                    dense: true,
                    title: Text(r['description']?.toString() ?? r['name']?.toString() ?? 'Repair'),
                    subtitle: Text(r['status']?.toString() ?? ''),
                  ),
              ],
            ),
          ),
        ],
        if (status == 'completed') ...[
          const SizedBox(height: AppSpacing.md),
          AdminCard(
            child: ListTile(
              leading: const Icon(Icons.receipt_long_outlined),
              title: const Text('Download Receipt'),
              subtitle: Text(
                _downloadingReceipt
                    ? 'Downloading PDF…'
                    : (_receipt != null
                        ? 'Tap to save the service receipt PDF'
                        : 'Generate and save a service receipt PDF'),
              ),
              onTap: _downloadingReceipt ? null : _downloadReceipt,
              trailing: _downloadingReceipt
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.download_outlined),
            ),
          ),
        ],
        if (job['reassignment_history'] is List &&
            (job['reassignment_history'] as List).isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Reassignment history', style: AdminTypography.heading),
                const SizedBox(height: AppSpacing.sm),
                for (final raw in job['reassignment_history'] as List)
                  if (raw is Map)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        jobReassignReasonLabel(raw['reason']?.toString()),
                        style: AdminTypography.body,
                      ),
                    ),
              ],
            ),
          ),
        ],
        if (holdRequestStatus == 'pending') ...[
          const SizedBox(height: AppSpacing.md),
          AdminCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Hold request pending', style: AdminTypography.heading),
                const SizedBox(height: AppSpacing.sm),
                Text(holdRequestReason.isEmpty ? 'No reason provided' : holdRequestReason),
                const SizedBox(height: AppSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: PrimaryButton(
                        label: 'Approve hold',
                        loading: _working,
                        onPressed: _approveHoldRequest,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Reject',
                        outlined: true,
                        loading: _working,
                        onPressed: _rejectHoldRequest,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
        if (status != 'completed' && status != 'cancelled') ...[
          const SizedBox(height: AppSpacing.md),
          if (const {'accepted', 'en_route', 'arrived', 'in_progress'}.contains(status) &&
              holdRequestStatus != 'pending') ...[
            PrimaryButton(
              label: 'Send to garage',
              outlined: true,
              loading: _working,
              onPressed: _sendToGarage,
            ),
            PrimaryButton(
              label: 'Put on hold',
              outlined: true,
              loading: _working,
              onPressed: _putOnHold,
            ),
          ],
          if (status == 'on_hold' &&
              job['garage'] is Map &&
              (job['garage'] as Map)['phase']?.toString() == 'at_garage')
            PrimaryButton(
              label: 'Mark ready — return car',
              loading: _working,
              onPressed: _markGarageReady,
            )
          else if (status == 'on_hold')
            PrimaryButton(
              label: 'Resume job',
              loading: _working,
              onPressed: _resumeJob,
            ),
          if (const {
            'pending',
            'assigned',
            'accepted',
            'en_route',
            'arrived',
            'in_progress',
            'on_hold',
          }.contains(status))
            PrimaryButton(
              label: 'Mark as completed',
              loading: _working,
              onPressed: _completeJob,
            ),
        ],
        if (status != 'completed' && status != 'cancelled') ...[
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(
            label: 'Cancel job',
            outlined: true,
            loading: _working,
            onPressed: _cancelJob,
          ),
        ],
        if (AdminRoles.isFullAdmin(CacheHelper.getUserProfileSync()?['role']?.toString())) ...[
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(
            label: 'Delete job',
            outlined: true,
            loading: _working,
            onPressed: _deleteJob,
          ),
        ],
      ],
    );
  }
}
