import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/maps_launcher.dart';
import 'package:clicks_technician/core/helper/phone_launcher.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/open_active_job_screen.dart';
import 'package:clicks_technician/features/home/ui/view/invoice_screen.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

/// Read-only Activity Details — Figma-style sections + Continue / View Receipt.
class ActivityDetailsScreen extends StatefulWidget {
  const ActivityDetailsScreen({
    super.key,
    required this.job,
    this.cubit,
  });

  final Map<String, dynamic> job;
  final HomeCubit? cubit;

  @override
  State<ActivityDetailsScreen> createState() => _ActivityDetailsScreenState();
}

class _ActivityDetailsScreenState extends State<ActivityDetailsScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _job;
  List<Map<String, dynamic>> _repairs = [];
  Map<String, dynamic>? _pricing;
  Map<String, dynamic>? _receipt;

  String get _jobId =>
      (_job?['_id'] ?? widget.job['_id'] ?? widget.job['job_id'] ?? '')
          .toString();

  String get _status =>
      (_job?['job_status'] ??
              _job?['status'] ??
              widget.job['job_status'] ??
              widget.job['status'] ??
              '')
          .toString();

  String get _paymentStatus =>
      (_job?['payment_status'] ?? widget.job['payment_status'] ?? '').toString();

  bool get _canContinue =>
      ['accepted', 'en_route', 'arrived', 'in_progress'].contains(_status) ||
      (_status == 'completed' && _paymentStatus != 'paid');

  /// Assigned jobs need Accept first (multi-job: dispatch may assign a second
  /// job while the technician is busy on another).
  bool get _canAccept => _status == 'assigned' && widget.cubit != null;

  bool get _showReceipt =>
      _status == 'completed' || _paymentStatus == 'paid' || _receipt != null;

  @override
  void initState() {
    super.initState();
    _job = Map<String, dynamic>.from(widget.job);
    _load();
  }

  Future<void> _load() async {
    final id = (widget.job['_id'] ?? widget.job['job_id'] ?? '').toString();
    if (id.isEmpty) {
      setState(() {
        _loading = false;
        _error = 'Missing job id';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await DioHelper.getData(
        url: EndPoints.jobActivityDetail(id),
      );
      if (res.statusCode == 200) {
        final data = res.data;
        if (data is Map) {
          final job = data['job'];
          if (job is Map) {
            _job = Map<String, dynamic>.from(job);
          }
          final repairs = data['repairs'];
          if (repairs is List) {
            _repairs = repairs
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .toList();
          }
          final pricing = data['pricing'];
          if (pricing is Map) {
            _pricing = Map<String, dynamic>.from(pricing);
          }
          final receipt = data['receipt'];
          if (receipt is Map) {
            _receipt = Map<String, dynamic>.from(receipt);
          }
        }
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load details';
      }
    } catch (_) {
      _error = 'Failed to load details';
    }
    if (mounted) setState(() => _loading = false);
  }

  String _fmtDate(dynamic raw) {
    final dt = raw is DateTime
        ? raw
        : DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '—';
    return DateFormat('MMM d, yyyy - h:mm a').format(dt.toLocal());
  }

  String _fmtMoney(dynamic raw) {
    if (raw is num) return 'QR ${raw.toStringAsFixed(0)}';
    final n = double.tryParse(raw?.toString() ?? '');
    if (n != null) return 'QR ${n.toStringAsFixed(0)}';
    return 'QR —';
  }

  String _repairName(Map<String, dynamic> r) {
    final name = (r['name'] ?? '').toString().trim();
    if (name.isNotEmpty) return name;
    final desc = (r['description'] ?? '').toString().trim();
    if (desc.isEmpty) return 'Repair';
    final first = desc.split('\n').first.trim();
    return first.length > 40 ? '${first.substring(0, 40)}…' : first;
  }

  Future<void> _onContinue() async {
    final cubit = widget.cubit;
    if (cubit == null) {
      AppSnackBars.errorSnackBar('Cannot open job right now');
      return;
    }
    final ok = await cubit.continueJob(_jobId);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
      await openActiveJobScreen(context, cubit);
    } else {
      AppSnackBars.errorSnackBar('Could not open this job');
    }
  }

  Future<void> _onAccept() async {
    final cubit = widget.cubit;
    if (cubit == null) {
      AppSnackBars.errorSnackBar('Cannot accept job right now');
      return;
    }
    final ok = await cubit.acceptJobById(_jobId);
    if (!mounted) return;
    if (!ok) {
      AppSnackBars.errorSnackBar(
        cubit.lastActionError ?? 'Could not accept this job',
      );
      return;
    }
    await cubit.focusJob(_jobId);
    if (!mounted) return;
    Navigator.of(context).pop();
    await openActiveJobScreen(context, cubit);
  }

  Future<void> _openReceiptImage(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final job = _job ?? widget.job;

    return Scaffold(
      backgroundColor: ColorsManager.scaffoldColor,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Activity Details',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            )
          : _error != null && _job == null
              ? Center(
                  child: Padding(
                    padding: EdgeInsets.all(24.w),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, style: TextStyles.font14RegularGrey),
                        SizedBox(height: 12.h),
                        TextButton(onPressed: _load, child: const Text('Retry')),
                      ],
                    ),
                  ),
                )
              : Column(
                  children: [
                    Expanded(
                      child: RefreshIndicator(
                        color: ColorsManager.mainColor,
                        onRefresh: _load,
                        child: ListView(
                          padding:
                              EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 16.h),
                          children: [
                            if (_error != null)
                              Padding(
                                padding: EdgeInsets.only(bottom: 8.h),
                                child: Text(
                                  _error!,
                                  style: TextStyles.font12RegularGrey
                                      .copyWith(color: ColorsManager.mainColor),
                                ),
                              ),
                            _JobStatusCard(
                              job: job,
                              status: _status,
                              scheduledLabel: _fmtDate(
                                job['dateTime'] ?? job['createdAt'],
                              ),
                              completedLabel: job['completed_at'] != null
                                  ? _fmtDate(job['completed_at'])
                                  : null,
                            ),
                            SizedBox(height: 12.h),
                            _ClientCard(job: job),
                            SizedBox(height: 12.h),
                            _SectionCard(
                              icon: Icons.directions_car_outlined,
                              title: 'Vehicle Details:',
                              child: Text(
                                JobDisplay.vehicleLine(job),
                                style: TextStyles.font14RegularGrey
                                    .copyWith(color: Colors.black87),
                              ),
                            ),
                            SizedBox(height: 12.h),
                            _SectionCard(
                              icon: Icons.build_outlined,
                              title: 'Job Description:',
                              child: Text(
                                (job['task_description'] ??
                                        job['issue'] ??
                                        '—')
                                    .toString(),
                                style: TextStyles.font14RegularGrey
                                    .copyWith(color: Colors.black87, height: 1.4),
                              ),
                            ),
                            SizedBox(height: 12.h),
                            _RepairsCard(
                              repairs: _repairs,
                              repairName: _repairName,
                              formatMoney: _fmtMoney,
                              onViewReceipt: _openReceiptImage,
                            ),
                            SizedBox(height: 12.h),
                            _SummaryCard(
                              pricing: _pricing,
                              jobPrice: job['price'],
                              formatMoney: _fmtMoney,
                            ),
                          ],
                        ),
                      ),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 12.h),
                        child: _canAccept
                            ? AppButton(
                                onPressed: _onAccept,
                                label: 'Accept job',
                                margin: 0,
                                width: double.infinity,
                                bgColor: ColorsManager.mainColor,
                                textColor: Colors.white,
                                height: 48.h,
                                radius: 10.r,
                              )
                            : _canContinue && widget.cubit != null
                            ? AppButton(
                                onPressed: _onContinue,
                                label: _status == 'completed'
                                    ? 'Continue to payment'
                                    : 'Continue job',
                                margin: 0,
                                width: double.infinity,
                                bgColor: ColorsManager.mainColor,
                                textColor: Colors.white,
                                height: 48.h,
                                radius: 10.r,
                              )
                            : _showReceipt
                                ? AppButton(
                                    onPressed: _jobId.isEmpty
                                        ? null
                                        : () {
                                            Navigator.of(context).push(
                                              MaterialPageRoute<void>(
                                                builder: (_) =>
                                                    InvoiceScreen(
                                                      jobId: _jobId,
                                                      jobReference: job[
                                                                  'job_reference']
                                                              ?.toString() ??
                                                          '',
                                                    ),
                                              ),
                                            );
                                          },
                                    label: 'View Receipt',
                                    margin: 0,
                                    width: double.infinity,
                                    bgColor: ColorsManager.mainColor,
                                    textColor: Colors.white,
                                    height: 48.h,
                                    radius: 10.r,
                                  )
                                : const SizedBox.shrink(),
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _JobStatusCard extends StatelessWidget {
  const _JobStatusCard({
    required this.job,
    required this.status,
    required this.scheduledLabel,
    this.completedLabel,
  });

  final Map<String, dynamic> job;
  final String status;
  final String scheduledLabel;
  final String? completedLabel;

  @override
  Widget build(BuildContext context) {
    final badgeColor = JobDisplay.statusColor(status);
    return _CardShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Job Id: ${JobDisplay.ocId(job)}',
            style: TextStyles.font16RegularBlack.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 17.sp,
            ),
          ),
          SizedBox(height: 6.h),
          Text(
            (job['issue'] ?? job['jobType'] ?? 'Service').toString(),
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              fontWeight: FontWeight.w500,
            ),
          ),
          SizedBox(height: 12.h),
          Text(scheduledLabel, style: TextStyles.font12RegularGrey),
          if (completedLabel != null) ...[
            SizedBox(height: 6.h),
            Container(
              padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
              decoration: BoxDecoration(
                color: const Color(0xFFD1FADF),
                borderRadius: BorderRadius.circular(20.r),
              ),
              child: Text(
                completedLabel!,
                style: TextStyles.font12RegularGrey.copyWith(
                  color: const Color(0xFF027A48),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
          SizedBox(height: 12.h),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              JobDisplay.statusLabel(status),
              style: TextStyles.font14RegularGrey.copyWith(
                color: badgeColor,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientCard extends StatelessWidget {
  const _ClientCard({required this.job});

  final Map<String, dynamic> job;

  @override
  Widget build(BuildContext context) {
    final customer = job['customer_id'] ?? job['customer'];
    final phoneFromCustomer = customer is Map
        ? (customer['phone'] ?? customer['phone_number'] ?? '').toString()
        : '';
    final phone = (job['clientMobileNumber'] ?? phoneFromCustomer).toString();
    final name = (job['clientName'] ?? '—').toString();
    final location = formatJobLocationDisplayFromMap(job);
    final coords = jobLatLngFromMap(job);

    return _SectionCard(
      icon: Icons.person_outline,
      title: 'Client Details:',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            name,
            style: TextStyles.font14RegularGrey
                .copyWith(color: Colors.black87, fontWeight: FontWeight.w600),
          ),
          if (phone.isNotEmpty) ...[
            SizedBox(height: 8.h),
            InkWell(
              onTap: () => launchTel(phone),
              child: Row(
                children: [
                  Icon(Icons.phone_outlined,
                      size: 16.sp, color: ColorsManager.mainColor),
                  SizedBox(width: 6.w),
                  Text(
                    phone,
                    style: TextStyles.font14RegularGrey.copyWith(
                      color: ColorsManager.mainColor,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ],
              ),
            ),
          ],
          SizedBox(height: 8.h),
          InkWell(
            onTap: location == '—'
                ? null
                : () => openJobLocationInMaps(
                      location,
                      lat: coords?.lat,
                      lng: coords?.lng,
                    ),
            child: Text(
              location,
              style: TextStyles.font14RegularGrey.copyWith(
                color: ColorsManager.mainColor,
                decoration: TextDecoration.underline,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RepairsCard extends StatelessWidget {
  const _RepairsCard({
    required this.repairs,
    required this.repairName,
    required this.formatMoney,
    required this.onViewReceipt,
  });

  final List<Map<String, dynamic>> repairs;
  final String Function(Map<String, dynamic>) repairName;
  final String Function(dynamic) formatMoney;
  final Future<void> Function(String url) onViewReceipt;

  @override
  Widget build(BuildContext context) {
    return _SectionCard(
      icon: Icons.settings_outlined,
      title: 'Repaired Procedure:',
      child: repairs.isEmpty
          ? Text('No repair procedures added',
              style: TextStyles.font12RegularGrey)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Name',
                        style: TextStyles.font12RegularGrey
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      'Price',
                      style: TextStyles.font12RegularGrey
                          .copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                SizedBox(height: 6.h),
                ...repairs.map((r) {
                  final price = r['price'];
                  final qty = r['quantity'] is num ? r['quantity'] as num : 1;
                  final line = price is num ? price * qty : price;
                  return Padding(
                    padding: EdgeInsets.only(bottom: 4.h),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            repairName(r),
                            style: TextStyles.font14RegularGrey
                                .copyWith(color: Colors.black87),
                          ),
                        ),
                        Text(
                          formatMoney(line),
                          style: TextStyles.font14RegularGrey.copyWith(
                            color: const Color(0xFF12B76A),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  );
                }),
                SizedBox(height: 12.h),
                ...repairs.map((r) {
                  final desc = (r['description'] ?? '').toString();
                  final notes = (r['notes'] ?? '').toString();
                  final receiptUrl = (r['receipt_image_url'] ?? '').toString();
                  final price = r['price'];
                  final qty = r['quantity'] is num ? r['quantity'] as num : 1;
                  final line = price is num ? price * qty : price;
                  return Container(
                    margin: EdgeInsets.only(bottom: 10.h),
                    padding: EdgeInsets.all(12.w),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF9FAFB),
                      borderRadius: BorderRadius.circular(10.r),
                      border: Border.all(color: ColorsManager.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                repairName(r),
                                style: TextStyles.font14RegularGrey.copyWith(
                                  color: Colors.black87,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            Text(
                              formatMoney(line),
                              style: TextStyles.font14RegularGrey
                                  .copyWith(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                        if (desc.isNotEmpty) ...[
                          SizedBox(height: 8.h),
                          Text(
                            desc,
                            style: TextStyles.font12RegularGrey
                                .copyWith(color: Colors.black87, height: 1.35),
                          ),
                        ],
                        if (receiptUrl.isNotEmpty) ...[
                          SizedBox(height: 8.h),
                          InkWell(
                            onTap: () => onViewReceipt(receiptUrl),
                            child: Row(
                              children: [
                                Icon(Icons.attach_file,
                                    size: 16.sp,
                                    color: ColorsManager.mainColor),
                                SizedBox(width: 4.w),
                                Expanded(
                                  child: Text(
                                    'View attachment',
                                    style: TextStyles.font12RegularGrey.copyWith(
                                      color: ColorsManager.mainColor,
                                      decoration: TextDecoration.underline,
                                    ),
                                  ),
                                ),
                                Icon(Icons.visibility_outlined,
                                    size: 18.sp,
                                    color: ColorsManager.greyColor),
                              ],
                            ),
                          ),
                        ],
                        if (notes.isNotEmpty) ...[
                          SizedBox(height: 8.h),
                          Text(
                            notes,
                            style: TextStyles.font12RegularGrey,
                          ),
                        ],
                      ],
                    ),
                  );
                }),
              ],
            ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.pricing,
    required this.jobPrice,
    required this.formatMoney,
  });

  final Map<String, dynamic>? pricing;
  final dynamic jobPrice;
  final String Function(dynamic) formatMoney;

  @override
  Widget build(BuildContext context) {
    final total = pricing?['total'] ?? jobPrice;
    final cost = pricing?['costTotal'] ?? 0;
    final profit = pricing?['profit'];
    final profitVal = profit is num
        ? profit
        : (total is num && cost is num ? total - cost : null);

    return _SectionCard(
      icon: Icons.attach_money,
      title: 'Summary:',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sumRow('Price', formatMoney(total)),
          SizedBox(height: 6.h),
          _sumRow('Cost', formatMoney(cost)),
          SizedBox(height: 8.h),
          Text(
            'Profit : ${formatMoney(profitVal)}',
            style: TextStyles.font14RegularGrey.copyWith(
              color: Colors.black87,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _sumRow(String label, String value) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: TextStyles.font14RegularGrey),
        ),
        Text(
          value,
          style: TextStyles.font14RegularGrey
              .copyWith(color: Colors.black87, fontWeight: FontWeight.w500),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.icon,
    required this.title,
    required this.child,
  });

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return _CardShell(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18.sp, color: ColorsManager.mainColor),
              SizedBox(width: 8.w),
              Text(
                title,
                style: TextStyles.font14RegularGrey.copyWith(
                  color: Colors.black87,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          SizedBox(height: 12.h),
          child,
        ],
      ),
    );
  }
}

class _CardShell extends StatelessWidget {
  const _CardShell({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12.r),
        border: Border.all(color: ColorsManager.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}
