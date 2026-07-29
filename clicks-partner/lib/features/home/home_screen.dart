import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/assets_manager.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/partner_notification_service.dart';
import '../../core/routing/routes.dart';
import '../../core/theme/app_colors.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _partner;
  Map<String, dynamic> _stats = {};
  Map<String, dynamic> _withdrawAmounts = {};
  Map<String, dynamic>? _openWithdrawal;
  bool _withdrawAvailable = false;
  String _withdrawType = 'earnings';
  bool _submittingWithdraw = false;
  List<dynamic> _recent = [];
  bool _loading = true;
  String? _error;

  NumberFormat get _money =>
      NumberFormat.currency(symbol: 'QAR ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    PartnerNotificationService.instance.registerTokenIfLoggedIn();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        DioHelper.getData(url: EndPoints.dashboard),
        DioHelper.getData(url: EndPoints.earnings),
      ]);
      final res = results[0];
      final earningsRes = results[1];
      if (res.statusCode == 200 && res.data is Map) {
        final open = res.data['openWithdrawal'];
        List<dynamic> recent =
            (res.data['recentEarnings'] as List?) ?? [];
        if (earningsRes.statusCode == 200 && earningsRes.data is Map) {
          final list = earningsRes.data['earnings'];
          if (list is List && list.isNotEmpty) {
            recent = list;
          }
        }
        setState(() {
          _partner = Map<String, dynamic>.from(res.data['partner'] as Map);
          _stats = res.data['stats'] is Map
              ? Map<String, dynamic>.from(res.data['stats'] as Map)
              : {};
          _withdrawAmounts = res.data['withdrawAmounts'] is Map
              ? Map<String, dynamic>.from(res.data['withdrawAmounts'] as Map)
              : {};
          _withdrawAvailable = res.data['withdrawAvailable'] == true;
          _openWithdrawal = open is Map
              ? Map<String, dynamic>.from(open)
              : null;
          _recent = recent;
          _loading = false;
        });
        return;
      }
      setState(() {
        _error = DioHelper.errorMessage(res) ?? 'failed_to_load'.tr();
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'failed_to_load'.tr();
        _loading = false;
      });
    }
  }

  double _amountForType(String type) {
    final key = type == 'both'
        ? 'both'
        : type == 'investment'
            ? 'investment'
            : 'earnings';
    return (_withdrawAmounts[key] as num?)?.toDouble() ?? 0;
  }

  Future<void> _submitWithdraw() async {
    final amount = _amountForType(_withdrawType);
    if (amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('withdraw_nothing'.tr())),
      );
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('withdraw_confirm_title'.tr()),
        content: Text(
          'withdraw_confirm_body'.tr(namedArgs: {
            'type': 'withdraw_type_$_withdrawType'.tr(),
            'amount': _money.format(amount),
          }),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('cancel'.tr()),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('withdraw_request'.tr()),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _submittingWithdraw = true);
    try {
      final res = await DioHelper.postData(
        url: EndPoints.withdrawals,
        data: {'type': _withdrawType},
      );
      if (!mounted) return;
      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('withdraw_submitted'.tr())),
        );
        await _load();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              DioHelper.errorMessage(res) ?? 'withdraw_failed'.tr(),
            ),
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('withdraw_failed'.tr())),
      );
    } finally {
      if (mounted) setState(() => _submittingWithdraw = false);
    }
  }

  String _statusTitle(String status) {
    switch (status) {
      case 'capped':
        return 'status_capped_title'.tr();
      case 'frozen':
        return 'status_frozen_title'.tr();
      case 'inactive':
        return 'status_inactive_title'.tr();
      default:
        return 'status_active_title'.tr();
    }
  }

  String _statusBody(String status) {
    switch (status) {
      case 'capped':
        return 'status_capped_body'.tr();
      case 'frozen':
        return 'status_frozen_body'.tr();
      case 'inactive':
        return 'status_inactive_body'.tr();
      default:
        return '';
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'capped':
        return AppColors.info;
      case 'frozen':
        return AppColors.warning;
      case 'inactive':
        return AppColors.muted;
      default:
        return AppColors.success;
    }
  }

  String _fmtDate(Object? value) {
    if (value == null) return '—';
    final d = DateTime.tryParse(value.toString());
    if (d == null) return '—';
    return DateFormat('d MMM yyyy').format(d.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final p = _partner;
    final name = p?['name']?.toString() ??
        CacheHelper.get('partner_name') ??
        'partner'.tr();
    final accrued = (p?['accruedTotal'] as num?)?.toDouble() ?? 0;
    final cap = (p?['periodCap'] as num?)?.toDouble() ?? 0;
    final remaining = (p?['remainingToCap'] as num?)?.toDouble() ?? 0;
    final investment = (p?['investmentAmount'] as num?)?.toDouble() ?? 0;
    final daysLeft = (p?['daysLeft'] as num?)?.toInt() ?? 0;
    final status = p?['status']?.toString() ?? 'active';
    final pct = cap > 0 ? (accrued / cap).clamp(0.0, 1.0) : 0.0;
    final week = (_stats['accruedThisWeek'] as num?)?.toDouble() ?? 0;
    final month = (_stats['accruedThisMonth'] as num?)?.toDouble() ?? 0;
    final jobsWeek = (_stats['jobsThisWeek'] as num?)?.toInt() ?? 0;
    final jobsMonth = (_stats['jobsThisMonth'] as num?)?.toInt() ?? 0;
    final statusColor = _statusColor(status);
    final statusNote = _statusBody(status);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        titleSpacing: 20,
        title: Row(
          children: [
            SvgPicture.asset(AssetsManager.clicksLogoSvg, height: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                name,
                style: GoogleFonts.dmSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.text,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'refresh'.tr(),
            onPressed: _load,
            icon: const Icon(Icons.refresh_rounded, size: 22),
            color: AppColors.muted,
          ),
          IconButton(
            tooltip: 'profile'.tr(),
            onPressed: () => Navigator.of(context).pushNamed(Routes.profile),
            icon: const Icon(Icons.person_outline_rounded, size: 22),
            color: AppColors.muted,
          ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!,
                          style: GoogleFonts.dmSans(color: AppColors.muted)),
                      TextButton(
                        onPressed: _load,
                        child: Text('try_again'.tr()),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: AppColors.primary,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                    children: [
                      _Card(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  'period_line'.tr(namedArgs: {
                                    'period': '${p?['currentPeriod'] ?? 1}',
                                  }),
                                  style: GoogleFonts.dmSans(
                                    fontSize: 13,
                                    color: AppColors.muted,
                                  ),
                                ),
                                const Spacer(),
                                _StatusChip(
                                  label: _statusTitle(status),
                                  color: statusColor,
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'accrued_from_jobs'.tr(),
                              style: GoogleFonts.dmSans(
                                fontSize: 13,
                                color: AppColors.muted,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _money.format(accrued),
                              style: GoogleFonts.dmSans(
                                fontSize: 32,
                                fontWeight: FontWeight.w700,
                                color: AppColors.text,
                                height: 1.1,
                              ),
                            ),
                            const SizedBox(height: 14),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                value: pct,
                                minHeight: 8,
                                backgroundColor: AppColors.field,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Text(
                                  '${'max_label'.tr()}: ${_money.format(cap)}',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 12,
                                    color: AppColors.muted,
                                  ),
                                ),
                                const Spacer(),
                                Text(
                                  '${'remaining_label'.tr()}: ${_money.format(remaining)}',
                                  style: GoogleFonts.dmSans(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.text,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'ceiling_note'.tr(),
                              style: GoogleFonts.dmSans(
                                fontSize: 11,
                                color: AppColors.muted.withValues(alpha: 0.85),
                              ),
                            ),
                            if (statusNote.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: statusColor.withValues(alpha: 0.08),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  statusNote,
                                  style: GoogleFonts.dmSans(
                                    fontSize: 12,
                                    color: statusColor,
                                    height: 1.35,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _Card(
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _LabeledValue(
                                    label: 'period_start'.tr(),
                                    value: _fmtDate(p?['periodStartedAt']),
                                  ),
                                ),
                                Expanded(
                                  child: _LabeledValue(
                                    label: 'period_end'.tr(),
                                    value: _fmtDate(p?['periodEndsAt']),
                                    alignEnd: true,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: Text(
                                daysLeft > 0
                                    ? 'days_left'
                                        .tr(namedArgs: {'days': '$daysLeft'})
                                    : 'days_left_zero'.tr(),
                                style: GoogleFonts.dmSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (_withdrawAvailable || _openWithdrawal != null) ...[
                        const SizedBox(height: 12),
                        _Card(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'withdraw_title'.tr(),
                                style: GoogleFonts.dmSans(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.text,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'withdraw_subtitle'.tr(),
                                style: GoogleFonts.dmSans(
                                  fontSize: 13,
                                  color: AppColors.muted,
                                  height: 1.35,
                                ),
                              ),
                              if (_openWithdrawal != null) ...[
                                const SizedBox(height: 14),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: AppColors.info.withValues(alpha: 0.08),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'withdraw_pending_note'.tr(namedArgs: {
                                      'type':
                                          'withdraw_type_${_openWithdrawal!['type']}'
                                              .tr(),
                                      'amount': _money.format(
                                        (_openWithdrawal!['totalAmount']
                                                    as num?)
                                                ?.toDouble() ??
                                            0,
                                      ),
                                    }),
                                    style: GoogleFonts.dmSans(
                                      fontSize: 13,
                                      color: AppColors.info,
                                      height: 1.35,
                                    ),
                                  ),
                                ),
                              ] else ...[
                                const SizedBox(height: 14),
                                ...[
                                  ('earnings', 'withdraw_type_earnings'),
                                  ('investment', 'withdraw_type_investment'),
                                  ('both', 'withdraw_type_both'),
                                ].map((opt) {
                                  final type = opt.$1;
                                  final labelKey = opt.$2;
                                  final amt = _amountForType(type);
                                  final selected = _withdrawType == type;
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: InkWell(
                                      onTap: _submittingWithdraw
                                          ? null
                                          : () => setState(
                                                () => _withdrawType = type,
                                              ),
                                      borderRadius: BorderRadius.circular(10),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 12,
                                          vertical: 12,
                                        ),
                                        decoration: BoxDecoration(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          border: Border.all(
                                            color: selected
                                                ? AppColors.primary
                                                : AppColors.field,
                                            width: selected ? 1.5 : 1,
                                          ),
                                          color: selected
                                              ? AppColors.primary
                                                  .withValues(alpha: 0.06)
                                              : AppColors.field,
                                        ),
                                        child: Row(
                                          children: [
                                            Icon(
                                              selected
                                                  ? Icons.radio_button_checked
                                                  : Icons.radio_button_off,
                                              size: 20,
                                              color: selected
                                                  ? AppColors.primary
                                                  : AppColors.muted,
                                            ),
                                            const SizedBox(width: 10),
                                            Expanded(
                                              child: Text(
                                                labelKey.tr(),
                                                style: GoogleFonts.dmSans(
                                                  fontSize: 14,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ),
                                            Text(
                                              _money.format(amt),
                                              style: GoogleFonts.dmSans(
                                                fontSize: 14,
                                                fontWeight: FontWeight.w700,
                                                color: AppColors.text,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ),
                                  );
                                }),
                                const SizedBox(height: 8),
                                SizedBox(
                                  width: double.infinity,
                                  child: FilledButton(
                                    onPressed: _submittingWithdraw
                                        ? null
                                        : _submitWithdraw,
                                    child: _submittingWithdraw
                                        ? const SizedBox(
                                            height: 20,
                                            width: 20,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : Text('withdraw_request'.tr()),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _MiniStat(
                              label: 'this_week'.tr(),
                              value: _money.format(week),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _MiniStat(
                              label: 'this_month'.tr(),
                              value: _money.format(month),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _MiniStat(
                              label: 'jobs_this_week'.tr(),
                              value: '$jobsWeek',
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _MiniStat(
                              label: 'jobs_this_month'.tr(),
                              value: '$jobsMonth',
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _MiniStat(
                              label: 'investment'.tr(),
                              value: _money.format(investment),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _MiniStat(
                              label: 'remaining_label'.tr(),
                              value: _money.format(remaining),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'attributed_jobs'.tr(),
                        style: GoogleFonts.dmSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppColors.text,
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (_recent.isEmpty)
                        _Card(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              'no_jobs_yet'.tr(),
                              style: GoogleFonts.dmSans(
                                color: AppColors.muted,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        )
                      else
                        ..._recent.map((e) {
                          final m = e is Map
                              ? Map<String, dynamic>.from(e)
                              : <String, dynamic>{};
                          final job = m['job'] is Map
                              ? Map<String, dynamic>.from(m['job'] as Map)
                              : <String, dynamic>{};
                          final amount =
                              (m['amount'] as num?)?.toDouble() ?? 0;
                          final created = m['createdAt'] != null
                              ? DateTime.tryParse(m['createdAt'].toString())
                              : null;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _Card(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 12,
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 36,
                                    height: 36,
                                    decoration: BoxDecoration(
                                      color: AppColors.primary
                                          .withValues(alpha: 0.08),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.directions_car_outlined,
                                      size: 18,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          job['clientName']?.toString() ??
                                              'Job',
                                          style: GoogleFonts.dmSans(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 14,
                                          ),
                                        ),
                                        Text(
                                          [
                                            if (job['jobType'] != null)
                                              job['jobType']
                                                  .toString()
                                                  .replaceAll('_', ' '),
                                            if (created != null)
                                              DateFormat('d MMM')
                                                  .format(created),
                                          ]
                                              .where((s) => s.isNotEmpty)
                                              .join(' · '),
                                          style: GoogleFonts.dmSans(
                                            fontSize: 12,
                                            color: AppColors.muted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    _money.format(amount),
                                    style: GoogleFonts.dmSans(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                    ],
                  ),
                ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        label,
        style: GoogleFonts.dmSans(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class _LabeledValue extends StatelessWidget {
  const _LabeledValue({
    required this.label,
    required this.value,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment:
          alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: GoogleFonts.dmSans(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.text,
          ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.dmSans(fontSize: 12, color: AppColors.muted),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: GoogleFonts.dmSans(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.text,
            ),
          ),
        ],
      ),
    );
  }
}
