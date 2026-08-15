import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/helper/assets_manager.dart';
import '../../core/helper/cache_helper.dart';
import '../../core/notifications/partner_notification_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/partner_card.dart';
import '../profile/profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _PartnerShellState();
}

class _PartnerShellState extends State<HomeScreen> {
  int _tab = 0;
  final _dashboardKey = GlobalKey<_PartnerDashboardTabState>();

  @override
  void initState() {
    super.initState();
    PartnerNotificationService.instance.registerTokenIfLoggedIn();
  }

  @override
  Widget build(BuildContext context) {
    final name =
        CacheHelper.get('partner_name') ?? 'partner'.tr();

    return Scaffold(
      backgroundColor: AppColors.pageBackground,
      appBar: AppBar(
        title: Row(
          children: [
            SvgPicture.asset(AssetsManager.clicksLogoSvg, height: 24),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                name,
                style: GoogleFonts.dmSans(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          if (_tab == 0)
            IconButton(
              tooltip: 'refresh'.tr(),
              onPressed: () => _dashboardKey.currentState?.reload(),
              icon: const Icon(Icons.refresh_rounded, size: 22),
              color: AppColors.muted,
            ),
        ],
      ),
      body: IndexedStack(
        index: _tab,
        children: [
          PartnerDashboardTab(key: _dashboardKey),
          const ProfileScreen(embedded: true),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.dashboard_outlined),
            selectedIcon: const Icon(Icons.dashboard),
            label: 'dashboard'.tr(),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: 'profile'.tr(),
          ),
        ],
      ),
    );
  }
}

class PartnerDashboardTab extends StatefulWidget {
  const PartnerDashboardTab({super.key});

  @override
  State<PartnerDashboardTab> createState() => _PartnerDashboardTabState();
}

class _PartnerDashboardTabState extends State<PartnerDashboardTab> {
  Map<String, dynamic>? _partner;
  Map<String, dynamic> _stats = {};
  Map<String, dynamic> _withdrawAmounts = {};
  Map<String, dynamic>? _openWithdrawal;
  bool _withdrawAvailable = false;
  String _withdrawType = 'earnings';
  bool _submittingWithdraw = false;
  bool _loading = true;
  String? _error;

  NumberFormat get _money =>
      NumberFormat.currency(symbol: 'QAR ', decimalDigits: 0);

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() => _load();

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(url: EndPoints.dashboard);
      if (res.statusCode == 200 && res.data is Map) {
        final open = res.data['openWithdrawal'];
        setState(() {
          _partner = Map<String, dynamic>.from(res.data['partner'] as Map);
          _stats = res.data['stats'] is Map
              ? Map<String, dynamic>.from(res.data['stats'] as Map)
              : {};
          _withdrawAmounts = res.data['withdrawAmounts'] is Map
              ? Map<String, dynamic>.from(res.data['withdrawAmounts'] as Map)
              : {};
          _withdrawAvailable = res.data['withdrawAvailable'] == true;
          _openWithdrawal =
              open is Map ? Map<String, dynamic>.from(open) : null;
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
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: GoogleFonts.dmSans(color: AppColors.muted)),
            TextButton(onPressed: _load, child: Text('try_again'.tr())),
          ],
        ),
      );
    }

    final p = _partner;
    final accrued = (p?['accruedTotal'] as num?)?.toDouble() ?? 0;
    final cap = (p?['periodCap'] as num?)?.toDouble() ?? 0;
    final remaining = (p?['remainingToCap'] as num?)?.toDouble() ?? 0;
    final investment = (p?['investmentAmount'] as num?)?.toDouble() ?? 0;
    final daysLeft = (p?['daysLeft'] as num?)?.toInt() ?? 0;
    final status = p?['status']?.toString() ?? 'active';
    final pct = cap > 0 ? (accrued / cap).clamp(0.0, 1.0) : 0.0;
    final week = (_stats['accruedThisWeek'] as num?)?.toDouble() ?? 0;
    final month = (_stats['accruedThisMonth'] as num?)?.toDouble() ?? 0;
    final statusColor = _statusColor(status);
    final statusNote = _statusBody(status);

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            'dashboard'.tr(),
            style: GoogleFonts.dmSans(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'dashboard_subtitle'.tr(),
            style: GoogleFonts.dmSans(fontSize: 14, color: AppColors.muted),
          ),
          const SizedBox(height: 16),
          _AccruedHeroCard(
            accrued: accrued,
            cap: cap,
            remaining: remaining,
            pct: pct,
            period: '${p?['currentPeriod'] ?? 1}',
            statusLabel: _statusTitle(status),
            statusColor: statusColor,
            statusNote: statusNote,
            money: _money,
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.35,
            children: [
              PartnerMetricCard(
                label: 'this_week'.tr(),
                value: _money.format(week),
                icon: Icons.calendar_today_outlined,
              ),
              PartnerMetricCard(
                label: 'this_month'.tr(),
                value: _money.format(month),
                icon: Icons.date_range_outlined,
              ),
              PartnerMetricCard(
                label: 'investment'.tr(),
                value: _money.format(investment),
                icon: Icons.savings_outlined,
              ),
              PartnerMetricCard(
                label: 'remaining_label'.tr(),
                value: _money.format(remaining),
                icon: Icons.trending_up_outlined,
              ),
            ],
          ),
          const SizedBox(height: 16),
          PartnerCard(
            title: 'period_line'.tr(namedArgs: {'period': '${p?['currentPeriod'] ?? 1}'}),
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
                        ? 'days_left'.tr(namedArgs: {'days': '$daysLeft'})
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
            PartnerCard(
              title: 'withdraw_title'.tr(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
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
                        border: Border.all(
                          color: AppColors.info.withValues(alpha: 0.2),
                        ),
                      ),
                      child: Text(
                        'withdraw_pending_note'.tr(namedArgs: {
                          'type':
                              'withdraw_type_${_openWithdrawal!['type']}'.tr(),
                          'amount': _money.format(
                            (_openWithdrawal!['totalAmount'] as num?)
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
                              : () => setState(() => _withdrawType = type),
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: selected
                                    ? AppColors.primary
                                    : AppColors.inputBorder,
                                width: selected ? 1.5 : 1,
                              ),
                              color: selected
                                  ? AppColors.primary.withValues(alpha: 0.06)
                                  : AppColors.surface,
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
                        onPressed:
                            _submittingWithdraw ? null : _submitWithdraw,
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
        ],
      ),
    );
  }
}

class _AccruedHeroCard extends StatelessWidget {
  const _AccruedHeroCard({
    required this.accrued,
    required this.cap,
    required this.remaining,
    required this.pct,
    required this.period,
    required this.statusLabel,
    required this.statusColor,
    required this.statusNote,
    required this.money,
  });

  final double accrued;
  final double cap;
  final double remaining;
  final double pct;
  final String period;
  final String statusLabel;
  final Color statusColor;
  final String statusNote;
  final NumberFormat money;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppColors.earningsGradient,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A101828),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'period_line'.tr(namedArgs: {'period': period}),
                style: GoogleFonts.dmSans(
                  fontSize: 13,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),
              const Spacer(),
              _StatusChip(label: statusLabel, color: statusColor),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'accrued_from_jobs'.tr(),
            style: GoogleFonts.dmSans(
              fontSize: 14,
              color: Colors.white.withValues(alpha: 0.9),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            money.format(accrued),
            style: GoogleFonts.dmSans(
              fontSize: 32,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: Colors.white.withValues(alpha: 0.25),
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                '${'max_label'.tr()}: ${money.format(cap)}',
                style: GoogleFonts.dmSans(
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: 0.8),
                ),
              ),
              const Spacer(),
              Text(
                '${'remaining_label'.tr()}: ${money.format(remaining)}',
                style: GoogleFonts.dmSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          if (statusNote.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                statusNote,
                style: GoogleFonts.dmSans(
                  fontSize: 12,
                  color: Colors.white,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ],
      ),
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
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: GoogleFonts.dmSans(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
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
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }
}
