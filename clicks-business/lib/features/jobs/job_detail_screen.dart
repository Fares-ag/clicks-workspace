import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/app_colors.dart';
import 'jobs_cubit.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Map<String, dynamic>? _job;
  bool _loading = true;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 20), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final cubit = JobsCubit();
    final job = await cubit.fetchJob(widget.jobId);
    await cubit.close();
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (job == null) {
        if (!silent || _job == null) _error = 'Job not found';
      } else {
        _job = job;
        _error = null;
      }
    });
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        title: Text(
          'Job details',
          style: GoogleFonts.dmSans(
            fontWeight: FontWeight.w700,
            color: AppColors.text,
          ),
        ),
        iconTheme: const IconThemeData(color: AppColors.text),
        actions: [
          IconButton(onPressed: () => _load(), icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading && _job == null
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _job == null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      TextButton(
                        onPressed: () => _load(),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _buildBody(_job!),
    );
  }

  Widget _buildBody(Map<String, dynamic> job) {
    final status = job['job_status']?.toString() ?? '';
    final payment = job['payment_status']?.toString() ?? '';
    final tech = job['assignedTechnician'];
    String techName = 'Not assigned yet';
    String? techPhone;
    if (tech is Map) {
      techName =
          '${tech['firstName'] ?? ''} ${tech['lastName'] ?? ''}'.trim();
      if (techName.isEmpty) techName = 'Assigned';
      techPhone = tech['phone']?.toString();
    }

    DateTime? dt;
    final raw = job['dateTime'];
    if (raw != null) dt = DateTime.tryParse(raw.toString());

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                job['clientName']?.toString() ?? '',
                style: GoogleFonts.dmSans(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                job['clientMobileNumber']?.toString() ?? '',
                style: GoogleFonts.dmSans(color: AppColors.muted),
              ),
              if ((job['clientEmail']?.toString() ?? '').isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  job['clientEmail'].toString(),
                  style: GoogleFonts.dmSans(color: AppColors.muted),
                ),
              ],
              const SizedBox(height: 12),
              _row('Status', status.replaceAll('_', ' ')),
              if (payment.isNotEmpty)
                _row('Payment', payment.replaceAll('_', ' ')),
              _row('Issue', job['issue']?.toString() ?? ''),
              _row('Type', job['jobType']?.toString() ?? ''),
              if ((job['vehicleMake']?.toString() ?? '').isNotEmpty)
                _row(
                  'Vehicle',
                  [
                    job['vehicleMake'],
                    job['vehicleModel'],
                    if (job['vehicleYear'] != null) job['vehicleYear'],
                  ].where((e) => e != null && e.toString().isNotEmpty).join(' '),
                ),
              if ((job['licensePlate']?.toString() ?? '').isNotEmpty)
                _row('Plate', job['licensePlate'].toString()),
              if ((job['vinNumber']?.toString() ?? '').isNotEmpty)
                _row('VIN', job['vinNumber'].toString()),
              _row('Location', job['location']?.toString() ?? ''),
              _row('Price', '${job['price'] ?? ''} QAR'),
              if (job['businessCutPercent'] != null)
                _row(
                  'Your cut',
                  '${job['businessCutPercent']}% (${job['businessCutType'] ?? 'revenue'})',
                ),
              if (dt != null)
                _row(
                  'When',
                  DateFormat('dd MMM yyyy, HH:mm').format(dt.toLocal()),
                ),
              _row('Technician', techName),
              if (techPhone != null && techPhone.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 100,
                        child: Text(
                          'Tech phone',
                          style: GoogleFonts.dmSans(
                            color: AppColors.muted,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      Expanded(
                        child: TextButton.icon(
                          onPressed: () => _call(techPhone!),
                          icon: const Icon(Icons.phone, size: 18),
                          label: Text(techPhone),
                          style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            alignment: Alignment.centerLeft,
                            foregroundColor: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              if (job['businessName'] != null)
                _row('Partner', job['businessName'].toString()),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Status timeline',
          style: GoogleFonts.dmSans(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        const SizedBox(height: 12),
        ..._timeline(job),
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: GoogleFonts.dmSans(color: AppColors.muted, fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.dmSans(fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  String? _ts(Map<String, dynamic> job, String key) {
    final raw = job[key];
    if (raw == null) return null;
    final dt = DateTime.tryParse(raw.toString());
    if (dt == null) return null;
    return DateFormat('dd MMM HH:mm').format(dt.toLocal());
  }

  List<Widget> _timeline(Map<String, dynamic> job) {
    final steps = [
      ('pending', 'Created', 'createdAt'),
      ('assigned', 'Assigned', 'assigned_at'),
      ('accepted', 'Accepted', 'accepted_at'),
      ('en_route', 'En route', 'en_route_at'),
      ('arrived', 'Arrived', 'arrived_at'),
      ('in_progress', 'In progress', 'started_at'),
      ('completed', 'Completed', 'completed_at'),
    ];
    final current = job['job_status']?.toString() ?? 'pending';
    final currentIdx = steps.indexWhere((s) => s.$1 == current);
    final cancelled = current == 'cancelled';

    if (cancelled) {
      return [
        ListTile(
          leading: const Icon(Icons.cancel, color: AppColors.primary),
          title: Text('Cancelled', style: GoogleFonts.dmSans()),
        ),
      ];
    }

    return steps.asMap().entries.map((e) {
      final done = currentIdx >= e.key;
      final currentStep = currentIdx == e.key;
      final ts = _ts(job, e.value.$3);
      return ListTile(
        leading: Icon(
          done ? Icons.check_circle : Icons.radio_button_unchecked,
          color: currentStep
              ? AppColors.primary
              : (done ? AppColors.accent : AppColors.muted),
        ),
        title: Text(
          e.value.$2,
          style: GoogleFonts.dmSans(
            fontWeight: currentStep || done ? FontWeight.w600 : FontWeight.w400,
            color: done || currentStep ? AppColors.text : AppColors.muted,
          ),
        ),
        subtitle: ts != null
            ? Text(
                ts,
                style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
              )
            : null,
      );
    }).toList();
  }
}
