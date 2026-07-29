import 'package:clicks_technician/core/components/app_button.dart';
import 'package:clicks_technician/core/helper/phone_launcher.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/view/invoice_screen.dart';
import 'package:clicks_technician/features/home/ui/view/job_display.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Full-screen activity / job details (replaces bottom sheet).
class ActivityDetailsScreen extends StatelessWidget {
  const ActivityDetailsScreen({super.key, required this.job});

  final Map<String, dynamic> job;

  String get _jobId =>
      (job['_id'] ?? job['job_id'] ?? '').toString();

  String get _status => (job['job_status'] ?? job['status'] ?? '').toString();

  String get _paymentStatus => (job['payment_status'] ?? '').toString();

  bool get _showInvoice =>
      _status == 'completed' || _paymentStatus == 'paid';

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final badgeColor = JobDisplay.statusColor(status);
    final customer = job['customer_id'] ?? job['customer'];
    final phoneFromCustomer = customer is Map
        ? (customer['phone'] ?? customer['phone_number'] ?? '').toString()
        : '';
    final phone = (job['clientMobileNumber'] ?? phoneFromCustomer).toString();

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
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(16.w, 16.h, 16.w, 24.h),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: EdgeInsets.all(16.w),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12.r),
                border: Border.all(color: ColorsManager.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          JobDisplay.ocId(job),
                          style: TextStyles.font16RegularBlack.copyWith(
                            fontWeight: FontWeight.bold,
                            fontSize: 18.sp,
                          ),
                        ),
                      ),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 10.w,
                          vertical: 4.h,
                        ),
                        decoration: BoxDecoration(
                          color: badgeColor,
                          borderRadius: BorderRadius.circular(20.r),
                        ),
                        child: Text(
                          JobDisplay.statusLabel(status),
                          style: TextStyles.font12RegularBlack.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 16.h),
                  _DetailRow(label: 'When', value: JobDisplay.formatWhen(job)),
                  _DetailRow(
                    label: 'Vehicle',
                    value: JobDisplay.vehicleLine(job),
                  ),
                  _DetailRow(
                    label: 'Issue',
                    value: (job['issue'] ?? '—').toString(),
                  ),
                  _DetailRow(
                    label: 'Location',
                    value: (job['location'] ?? '—').toString(),
                  ),
                  _DetailRow(
                    label: 'Price',
                    value: job['price'] != null
                        ? '${job['price']} QAR'
                        : '—',
                  ),
                  _DetailRow(
                    label: 'Customer',
                    value: (job['clientName'] ?? '—').toString(),
                  ),
                  _DetailRow(
                    label: 'Phone',
                    value: phone.isEmpty ? '—' : phone,
                    onTap: phone.isNotEmpty
                        ? () => launchTel(phone)
                        : null,
                    valueStyle: phone.isNotEmpty
                        ? TextStyles.font14RegularGrey.copyWith(
                            color: ColorsManager.mainColor,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                          )
                        : null,
                  ),
                ],
              ),
            ),
            if (_showInvoice) ...[
              SizedBox(height: 16.h),
              AppButton(
                onPressed: _jobId.isEmpty
                    ? null
                    : () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => InvoiceScreen(jobId: _jobId),
                          ),
                        );
                      },
                label: 'View Invoice',
                margin: 0,
                width: double.infinity,
                bgColor: ColorsManager.mainColor,
                textColor: Colors.white,
                height: 48.h,
                radius: 10.r,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.onTap,
    this.valueStyle,
  });

  final String label;
  final String value;
  final VoidCallback? onTap;
  final TextStyle? valueStyle;

  @override
  Widget build(BuildContext context) {
    final text = Text(
      value,
      style: valueStyle ??
          TextStyles.font14RegularGrey.copyWith(
            color: Colors.black87,
            fontWeight: FontWeight.w500,
          ),
    );

    return Padding(
      padding: EdgeInsets.only(bottom: 12.h),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 88.w,
            child: Text(label, style: TextStyles.font12RegularGrey),
          ),
          Expanded(
            child: onTap != null
                ? InkWell(
                    onTap: onTap,
                    child: text,
                  )
                : text,
          ),
        ],
      ),
    );
  }
}
