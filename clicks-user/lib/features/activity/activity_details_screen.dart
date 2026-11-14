import '../../core/config/public_config.dart';
import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/dio_helper.dart';
import '../../core/api/end_points.dart';
import '../../core/components/success_screen.dart';
import 'models/job_history_response.dart';
import 'receipt_opener.dart';
import 'widgets/contact_support_sheet.dart';

class ActivityDetailsPage extends StatelessWidget {
  const ActivityDetailsPage({super.key, required this.job});
  final JobDto job;

  // ──────── Formatters ────────

  String _formatDate(BuildContext context, DateTime dt) {
    final locale = context.locale.toString();
    try {
      return DateFormat('MMM d, yyyy - h:mm a', locale).format(dt.toLocal());
    } catch (_) {
      return DateFormat('MMM d, yyyy - h:mm a').format(dt.toLocal());
    }
  }

  String? get _jobRef {
    final ref = (job.jobReference ?? '').trim();
    return ref.isEmpty ? null : ref;
  }

  String get _shortJobId => _jobRef ?? 'job';

  String get _vehicleDisplay {
    final parts = <String>[];
    if (job.vehicleMake != null && job.vehicleMake!.isNotEmpty) {
      parts.add(job.vehicleMake!);
    }
    if (job.vehicleModel != null && job.vehicleModel!.isNotEmpty) {
      parts.add(job.vehicleModel!);
    }
    if (job.vehicleYear != null) {
      parts.add(job.vehicleYear.toString());
    }
    return parts.isEmpty ? '\u2014' : parts.join(' ');
  }

  String get _totalJobTimeDisplay {
    final mins = job.totalJobTimeMinutes;
    if (mins == null || mins <= 0) return '\u2014';
    final days = mins ~/ (60 * 24);
    final hours = (mins % (60 * 24)) ~/ 60;
    final remainder = mins % 60;
    final parts = <String>[];
    if (days > 0) parts.add('$days ${days == 1 ? 'day' : 'days'}');
    if (hours > 0) parts.add('$hours ${hours == 1 ? 'hr' : 'hrs'}');
    if (remainder > 0) parts.add('$remainder min');
    return parts.join(' ');
  }

  String _qarAmount(BuildContext context, num? value) {
    if (value == null) return 'activity.price_tbd'.tr();
    final n = NumberFormat.decimalPattern(context.locale.languageCode)
        .format(value);
    return '${'common.qar'.tr()} $n';
  }

  String _receiptAmount(BuildContext context, Map<String, dynamic> data) {
    final amount = data['total_amount'];
    final value = amount is num ? amount : job.price;
    return _qarAmount(context, value);
  }

  String _paymentLabel(Map<String, dynamic> data) {
    final raw = (data['payment_method'] ?? job.paymentMethod ?? '')
        .toString()
        .toLowerCase();
    return switch (raw) {
      'cash' => 'activity_details.payment_cash'.tr(),
      'card' => 'activity_details.payment_card'.tr(),
      '' => '',
      _ => raw,
    };
  }

  String _formatPhone(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('974') && digits.length >= 11) {
      return '+974 ${digits.substring(3, 7)} ${digits.substring(7, 11)}';
    }
    if (digits.length == 8) {
      return '+974 ${digits.substring(0, 4)} ${digits.substring(4)}';
    }
    return raw;
  }

  // ──────── Helpers ────────

  Future<void> _viewReceipt(BuildContext context) async {
    if (job.status != JobStatus.completed) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('activity_details.receipt_completed_only'.tr())),
      );
      return;
    }

    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    var loading = true;
    void dismissLoading() {
      if (!loading) return;
      loading = false;
      nav.pop();
    }

    List<int>? pdfBytes;
    var data = <String, dynamic>{};

    try {
      final pdf = await DioHelper.getBytes(
        url: EndPoints.jobReceiptDownload(job.id),
      );
      if (pdf.statusCode == 200 && pdf.data != null && pdf.data!.isNotEmpty) {
        final header = String.fromCharCodes(pdf.data!.take(5));
        if (header == '%PDF-') pdfBytes = pdf.data;
      }

      final response = await DioHelper.getData(
        url: '/api/receipts/job/${job.id}',
      );
      if (response.statusCode == 200 && response.data is Map) {
        final body = Map<String, dynamic>.from(response.data as Map);
        if (body['receipt'] is Map) {
          data = Map<String, dynamic>.from(body['receipt'] as Map);
        } else {
          data = body;
        }
      }
    } catch (_) {
      // Sheet still opens from job fields.
    }

    dismissLoading();
    if (!context.mounted) return;
    if (data.isEmpty && pdfBytes == null && job.price == null) {
      messenger.showSnackBar(
        SnackBar(content: Text('activity_details.failed_get_receipt'.tr())),
      );
      return;
    }
    await _showReceiptSheet(context, data, pdfBytes);
  }

  Future<void> _showReceiptSheet(
    BuildContext context,
    Map<String, dynamic> data,
    List<int>? pdfBytes,
  ) {
    final issued = DateTime.tryParse(
          data['issued_at']?.toString() ?? '',
        )?.toLocal() ??
        job.dateTime;
    final payment = _paymentLabel(data);
    final filename = 'clicks-receipt-$_shortJobId.pdf';

    return showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: ColorsManager.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16.r)),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(16.w, 12.h, 16.w, 24.h),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40.w,
                height: 4.h,
                decoration: BoxDecoration(
                  color: ColorsManager.cardBorder,
                  borderRadius: BorderRadius.circular(2.r),
                ),
              ),
              SizedBox(height: 16.h),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  'activity_details.receipt'.tr(),
                  style: TextStyles.font18Bold,
                ),
              ),
              SizedBox(height: 12.h),
              _ReceiptRow(
                label: 'activity_details.service_label'.tr(),
                value: job.jobType.isNotEmpty ? job.jobType : '—',
              ),
              if (_jobRef != null)
                _ReceiptRow(
                  label: 'activity_details.job_id_label'.tr(),
                  value: _jobRef!,
                ),
              _ReceiptRow(
                label: 'activity.vehicle'.tr(),
                value: _vehicleDisplay,
              ),
              _ReceiptRow(
                label: 'activity_details.amount_label'.tr(),
                value: _receiptAmount(context, data),
              ),
              if (payment.isNotEmpty)
                _ReceiptRow(
                  label: 'activity_details.payment_label'.tr(),
                  value: payment,
                ),
              _ReceiptRow(
                label: 'activity_details.issued_label'.tr(),
                value: _formatDate(context, issued),
                last: true,
              ),
              SizedBox(height: 20.h),
              if (pdfBytes != null) ...[
                SizedBox(
                  width: double.infinity,
                  height: 48.h,
                  child: FilledButton(
                    onPressed: () async {
                      final opened = await openReceiptPdf(pdfBytes, filename);
                      if (!opened && ctx.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              'activity_details.cannot_open_receipt'.tr(),
                            ),
                          ),
                        );
                      }
                    },
                    style: FilledButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12.r),
                      ),
                    ),
                    child: Text(
                      kIsWeb
                          ? 'activity_details.download_pdf'.tr()
                          : 'activity_details.open_pdf'.tr(),
                    ),
                  ),
                ),
                SizedBox(height: 8.h),
              ],
              SizedBox(
                width: double.infinity,
                height: 48.h,
                child: TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: Text(
                    'common.close'.tr(),
                    style: TextStyles.font14Medium.copyWith(
                      color: ColorsManager.greyColor,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showContactSupport(BuildContext context) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const ContactSupportSheet(),
    );

    if (result == true && context.mounted) {
      context.pushSmooth(
        SuccessScreen(
          message: 'activity_details.support_submitted'.tr(),
          buttonLabel: 'common.ok'.tr(),
          onButtonPressed: () => Navigator.pop(context),
        ),
      );
    }
  }

  void _callSupport() async {
    await PublicConfig.callSupport();
  }

  // ──────── Build ────────

  @override
  Widget build(BuildContext context) {
    final dateText = _formatDate(context, job.dateTime);

    final statusText = switch (job.status) {
      JobStatus.completed => 'activity.completed_jobs'.tr(),
      JobStatus.cancelled => 'activity.cancelled_jobs'.tr(),
      JobStatus.ongoing => 'activity_details.on_going'.tr(),
    };

    final statusColor = switch (job.status) {
      JobStatus.completed => const Color(0xFF039855),
      JobStatus.cancelled => const Color(0xFFD92D20),
      JobStatus.ongoing => const Color(0xFFDC6803),
    };

    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        title: 'activity_details.title'.tr(),
        automaticallyImplyLeading: true,
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 16.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: 20.h),

              // ─── Job Summary ───
              _buildJobSummary(context, dateText, statusText, statusColor),
              Divider(height: 1.h, color: ColorsManager.border),

              // ─── Technician Section ───
              _buildTechnicianSection(context),
              const Divider(height: 1, color: Color(0xFFE4E7EC)),

              // ─── Rating ───
              if (job.status == JobStatus.completed) _buildRatingRow(context),

              // ─── Vehicle Details ───
              _buildSectionTitle('activity_details.vehicle_details'.tr()),
              _buildVehicleDetails(context),
              const Divider(height: 1, color: Color(0xFFE4E7EC)),

              // ─── Service Details ───
              _buildSectionTitle('activity_details.service_details'.tr()),
              Padding(
                padding: EdgeInsets.only(bottom: 20.h),
                child: Text(
                  job.issue.isNotEmpty ? job.issue : '\u2014',
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xFF252525),
                    height: 20 / 14,
                  ),
                ),
              ),
              const Divider(height: 1, color: Color(0xFFE4E7EC)),

              // ─── Help ───
              _buildHelpSection(context),
              const Divider(height: 1, color: Color(0xFFE4E7EC)),

              if (job.status == JobStatus.completed)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 20.h),
                  child: SizedBox(
                    width: double.infinity,
                    height: 48.h,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: ColorsManager.mainColor,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10.r),
                        ),
                      ),
                      onPressed: () => _viewReceipt(context),
                      child: Text(
                        'activity_details.view_receipt'.tr(),
                        style: TextStyles.font14Medium.copyWith(
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              SizedBox(height: 20.h),
            ],
          ),
        ),
      ),
    );
  }

  // ──────── Sub-widgets ────────

  Widget _buildJobSummary(
    BuildContext context,
    String dateText,
    String statusText,
    Color statusColor,
  ) {
    return Padding(
      padding: EdgeInsets.only(bottom: 20.h),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: Image.asset(
              AssetsManager.carExample2Image,
              width: 58,
              height: 58,
              fit: BoxFit.contain,
            ),
          ),
          SizedBox(width: 16.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  job.jobType.isNotEmpty ? job.jobType : 'activity_details.service_details'.tr(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF252525),
                    height: 24 / 16,
                  ),
                ),
                SizedBox(height: 5.h),
                if (_jobRef != null)
                  Text(
                    '${'activity_details.job_id_label'.tr()}: $_jobRef',
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFF667085),
                      height: 18 / 12,
                    ),
                  ),
                SizedBox(height: 5.h),
                Text(
                  dateText,
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 12.sp,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xFF667085),
                    height: 18 / 12,
                  ),
                ),
                if (job.totalJobTimeMinutes != null && job.totalJobTimeMinutes! > 0) ...[
                  SizedBox(height: 5.h),
                  Text(
                    '${'activity_details.total_job_time'.tr()} : $_totalJobTimeDisplay',
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFF667085),
                      height: 18 / 12,
                    ),
                  ),
                ],
                SizedBox(height: 8.h),
                Container(
                  padding:
                      EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20.r),
                  ),
                  child: Text(
                    statusText,
                    style: TextStyles.font12RegularGrey.copyWith(
                      color: statusColor,
                      fontWeight: FontWeight.w600,
                      fontSize: 11.sp,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: EdgeInsets.only(top: 24.h, bottom: 16.h),
      child: Text(
        title,
        style: TextStyles.font16RegularBlack.copyWith(
          fontWeight: FontWeight.w600,
          fontSize: 16.sp,
          color: const Color(0xFF252525),
          letterSpacing: -0.18,
          height: 28 / 18,
        ),
      ),
    );
  }

  Widget _buildTechnicianSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('activity_details.technician'.tr()),
        Padding(
          padding: EdgeInsets.only(bottom: 16.h),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFE4E7EC), width: 0.5),
                  image: (job.technicianProfilePicture != null &&
                          job.technicianProfilePicture!.isNotEmpty)
                      ? DecorationImage(
                          image: NetworkImage(job.technicianProfilePicture!),
                          fit: BoxFit.cover,
                        )
                      : DecorationImage(
                          image: AssetImage(AssetsManager.homeProfileImage),
                          fit: BoxFit.cover,
                        ),
                ),
              ),
              SizedBox(width: 6.w),
              Expanded(
                child: Text(
                  job.technicianName ?? '\u2014',
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xFF252525),
                    height: 20 / 14,
                  ),
                ),
              ),
              if (job.technicianPhone != null && job.technicianPhone!.isNotEmpty) ...[
                const Icon(Icons.phone, size: 18, color: Color(0xFF667085)),
                SizedBox(width: 6.w),
                GestureDetector(
                  onTap: () async {
                    final uri = Uri.parse('tel:${job.technicianPhone}');
                    if (await canLaunchUrl(uri)) await launchUrl(uri);
                  },
                  child: Text(
                    _formatPhone(job.technicianPhone!),
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFF252525),
                      height: 20 / 14,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const Divider(height: 1, color: Color(0xFFE4E7EC)),
      ],
    );
  }

  Widget _buildRatingRow(BuildContext context) {
    final rating = job.rating ?? 0;
    if (rating <= 0) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: 16.h),
        child: Text(
          'activity_details.not_rated'.tr(),
          style: TextStyles.font12RegularBlack.copyWith(
            color: ColorsManager.greyColor,
          ),
        ),
      );
    }
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 16.h),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'activity_details.rate_technician'.tr(),
              style: TextStyles.font12RegularBlack.copyWith(
                color: ColorsManager.greyColor,
              ),
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(5, (i) {
              return Icon(
                i < rating ? Icons.star : Icons.star_border,
                color: const Color(0xFFFDB022),
                size: 24,
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildVehicleDetails(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: 20.h),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _vehicleDisplay,
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 14.sp,
                fontWeight: FontWeight.w400,
                color: const Color(0xFF252525),
                height: 20 / 14,
              ),
            ),
          ),
          if (job.vehiclePlateNumber != null && job.vehiclePlateNumber!.isNotEmpty)
            Text(
              job.vehiclePlateNumber!,
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 14.sp,
                fontWeight: FontWeight.w400,
                color: const Color(0xFF252525),
                height: 20 / 14,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildHelpSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('activity_details.help'.tr()),
        Padding(
          padding: EdgeInsets.only(bottom: 16.h),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => _showContactSupport(context),
                  child: Text(
                    'activity_details.contact_support'.tr(),
                    style: TextStyle(
                      fontFamily: 'HelveticaNeue',
                      fontSize: 12.sp,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFF667085),
                      height: 18 / 12,
                    ),
                  ),
                ),
              ),
              GestureDetector(
                onTap: _callSupport,
                child: Text(
                  _formatPhone(PublicConfig.supportPhone),
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 14.sp,
                    fontWeight: FontWeight.w400,
                    color: const Color(0xFF252525),
                    height: 20 / 14,
                  ),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1, color: Color(0xFFE4E7EC)),
      ],
    );
  }
}

class _ReceiptRow extends StatelessWidget {
  final String label;
  final String value;
  final bool last;

  const _ReceiptRow({
    required this.label,
    required this.value,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(vertical: 10.h),
      decoration: last
          ? null
          : const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: ColorsManager.cardBorder),
              ),
            ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96.w,
            child: Text(
              label,
              style: TextStyles.font12RegularBlack.copyWith(
                color: ColorsManager.greyColor,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: TextStyles.font14Medium.copyWith(
                fontWeight: FontWeight.w600,
                color: ColorsManager.blackColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
