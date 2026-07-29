import 'package:clicks_technician/core/api/dio_helper.dart';
import 'package:clicks_technician/core/api/end_points/end_points.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:intl/intl.dart';

/// Read-only invoice for a completed / paid job.
class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _receipt;

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
        url: EndPoints.receiptByJob(widget.jobId),
      );
      if (res.statusCode == 200) {
        final receipt = res.data['receipt'];
        if (receipt is Map) {
          _receipt = Map<String, dynamic>.from(receipt);
        } else {
          _error = 'No invoice found for this job';
        }
      } else if (res.statusCode == 404) {
        _error = 'No invoice found for this job';
      } else {
        _error = DioHelper.errorMessage(res) ?? 'Failed to load invoice';
      }
    } catch (_) {
      _error = 'Failed to load invoice';
    }
    if (mounted) setState(() => _loading = false);
  }

  String _formatDate(dynamic raw) {
    final dt = raw is DateTime
        ? raw
        : DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '—';
    return DateFormat('MMM d, yyyy - h:mm a').format(dt.toLocal());
  }

  String _formatAmount(dynamic raw) {
    if (raw is num) return '${raw.toStringAsFixed(2)} QAR';
    final parsed = double.tryParse(raw?.toString() ?? '');
    if (parsed != null) return '${parsed.toStringAsFixed(2)} QAR';
    return '—';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.scaffoldColor,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: Text(
          'Invoice',
          style: TextStyles.font16RegularBlack
              .copyWith(fontWeight: FontWeight.bold),
        ),
      ),
      body: _loading
          ? Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: EdgeInsets.all(24.w),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.receipt_long_outlined,
                            size: 48.sp, color: ColorsManager.greyColor),
                        SizedBox(height: 12.h),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: TextStyles.font14RegularGrey,
                        ),
                        SizedBox(height: 12.h),
                        TextButton(
                          onPressed: _load,
                          child: Text(
                            'Retry',
                            style: TextStyle(color: ColorsManager.mainColor),
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              : SingleChildScrollView(
                  padding: EdgeInsets.all(16.w),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: 420.w),
                      child: Container(
                        width: double.infinity,
                        padding: EdgeInsets.all(20.w),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8.r),
                          border: Border.all(color: ColorsManager.border),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: _buildInvoiceBody(),
                      ),
                    ),
                  ),
                ),
    );
  }

  Widget _buildInvoiceBody() {
    final receipt = _receipt!;
    final items = receipt['items'];
    final jobRef = receipt['job_id']?.toString() ?? widget.jobId;
    final fakeJob = {'_id': jobRef};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'INVOICE',
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.bold,
            letterSpacing: 1.2,
          ),
        ),
        SizedBox(height: 4.h),
        Text('Clicks Technician', style: TextStyles.font12RegularGrey),
        Divider(height: 24.h, color: ColorsManager.border),
        _InvoiceRow(
          label: 'Job Id',
          value: JobDisplay.ocId(fakeJob),
        ),
        _InvoiceRow(
          label: 'Amount',
          value: _formatAmount(receipt['total_amount']),
          emphasize: true,
        ),
        _InvoiceRow(
          label: 'Payment',
          value: (receipt['payment_method'] ??
                  receipt['payment_status'] ??
                  '—')
              .toString(),
        ),
        _InvoiceRow(
          label: 'Date',
          value: _formatDate(receipt['issued_at'] ?? receipt['createdAt']),
        ),
        if (items is List && items.isNotEmpty) ...[
          SizedBox(height: 16.h),
          Text(
            'Line items',
            style: TextStyles.font14RegularGrey.copyWith(
              fontWeight: FontWeight.w600,
              color: Colors.black87,
            ),
          ),
          SizedBox(height: 8.h),
          ...items.whereType<Map>().map((item) {
            final desc = (item['description'] ?? 'Item').toString();
            final qty = item['quantity'] ?? 1;
            final price = item['price'];
            final lineTotal = price is num
                ? (price * (qty is num ? qty : 1)).toStringAsFixed(2)
                : '—';
            return Padding(
              padding: EdgeInsets.only(bottom: 8.h),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '$desc × $qty',
                      style: TextStyles.font12RegularGrey
                          .copyWith(color: Colors.black87),
                    ),
                  ),
                  Text(
                    '$lineTotal QAR',
                    style: TextStyles.font12RegularGrey.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: 10.h),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88.w,
            child: Text(label, style: TextStyles.font12RegularGrey),
          ),
          Expanded(
            child: Text(
              value,
              style: emphasize
                  ? TextStyles.font16RegularBlack.copyWith(
                      fontWeight: FontWeight.bold,
                      color: ColorsManager.mainColor,
                    )
                  : TextStyles.font14RegularGrey.copyWith(
                      color: Colors.black87,
                      fontWeight: FontWeight.w500,
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
