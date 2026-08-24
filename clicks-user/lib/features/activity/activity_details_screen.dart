import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/dio_helper.dart';
import '../../core/components/success_screen.dart';
import 'models/job_history_response.dart';
import 'widgets/contact_support_sheet.dart';

class ActivityDetailsPage extends StatelessWidget {
  const ActivityDetailsPage({super.key, required this.job});
  final JobDto job;

  // ──────── Formatters ────────

  String _formatDate(DateTime dt) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final h12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    final min = dt.minute.toString().padLeft(2, '0');
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year} - $h12:$min $ampm';
  }

  String get _shortJobId {
    final ref = (job.jobReference ?? '').trim();
    if (ref.isNotEmpty) return ref;
    if (job.id.isEmpty) return '\u2014';
    if (job.id.length > 6) {
      return '#${job.id.substring(job.id.length - 6)}';
    }
    return '#${job.id}';
  }

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

    try {
      final response = await DioHelper.getData(
        url: '/api/receipts/job/${job.id}',
      );

      nav.pop(); // dismiss loading

      if (response.statusCode == 200) {
        final body = response.data;
        final data = body is Map && body['receipt'] is Map
            ? Map<String, dynamic>.from(body['receipt'] as Map)
            : (body is Map ? Map<String, dynamic>.from(body) : <String, dynamic>{});
        final pdfUrl = data['pdf_url'] ?? data['pdfUrl'];
        if (pdfUrl != null && pdfUrl.toString().isNotEmpty) {
          final uri = Uri.parse(pdfUrl.toString());
          if (await canLaunchUrl(uri)) {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } else {
            messenger.showSnackBar(
              SnackBar(content: Text('activity_details.cannot_open_receipt'.tr())),
            );
          }
        } else {
          if (context.mounted) _showReceiptDialog(context, data);
        }
      } else {
        final msg = response.data is Map
            ? (response.data['error'] ?? 'activity_details.failed_get_receipt'.tr())
            : 'activity_details.failed_get_receipt'.tr();
        messenger.showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      nav.pop();
      messenger.showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    }
  }

  void _showReceiptDialog(BuildContext context, dynamic data) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('activity_details.receipt'.tr()),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${'activity_details.job_id_label'.tr()}: $_shortJobId'),
            Text('${'activity_details.amount_label'.tr()}: ${NumberFormat.decimalPattern(Localizations.localeOf(context).languageCode).format((data['total_amount'] as num?) ?? job.price)} ${'common.qar'.tr()}'),
            if (data['issued_at'] != null) Text('${'activity_details.issued_label'.tr()}: ${data['issued_at']}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('common.close'.tr()),
          ),
        ],
      ),
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
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => SuccessScreen(
            message: 'activity_details.support_submitted'.tr(),
            buttonLabel: 'common.ok'.tr(),
            onButtonPressed: () => Navigator.pop(context),
          ),
        ),
      );
    }
  }

  void _callSupport() async {
    const phone = 'tel:70919191';
    final uri = Uri.parse(phone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  // ──────── Build ────────

  @override
  Widget build(BuildContext context) {
    final dateText = _formatDate(job.dateTime);

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
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        shape: const Border(bottom: BorderSide(color: Color(0xFFD0D5DD), width: 1.0)),
        title: Text(
          'activity_details.title'.tr(),
          style: TextStyles.font16RegularBlack.copyWith(
            fontWeight: FontWeight.w700,
            fontSize: 20.sp,
          ),
        ),
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

              // ─── View Receipt ───
              Padding(
                padding: EdgeInsets.symmetric(vertical: 20.h),
                child: SizedBox(
                  width: 120,
                  height: 36,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: ColorsManager.mainColor,
                      foregroundColor: Colors.white,
                      padding: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      elevation: 1,
                    ),
                    onPressed: () => _viewReceipt(context),
                    child: Text(
                      'activity_details.view_receipt'.tr(),
                      style: TextStyle(
                        fontFamily: 'HelveticaNeue',
                        fontSize: 14.sp,
                        fontWeight: FontWeight.w500,
                        letterSpacing: -0.14,
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
              height: 93,
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
                  style: TextStyle(
                    fontFamily: 'HelveticaNeue',
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w500,
                    color: const Color(0xFF252525),
                    height: 24 / 16,
                  ),
                ),
                SizedBox(height: 5.h),
                Text(
                  '${'activity_details.job_id_label'.tr()}: $_shortJobId',
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
                    job.technicianPhone!,
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
    return Padding(
      padding: EdgeInsets.symmetric(vertical: 16.h),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'activity_details.rate_technician'.tr(),
              style: TextStyle(
                fontFamily: 'HelveticaNeue',
                fontSize: 12.sp,
                fontWeight: FontWeight.w400,
                color: const Color(0xFF667085),
                height: 18 / 12,
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
                  '7091 9191',
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
