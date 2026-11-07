import 'package:clicks_user/core/api/dio_helper.dart';
import 'package:clicks_user/core/api/end_points.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/activity/models/job_history_response.dart';
import 'package:clicks_user/features/activity/widgets/contact_support_sheet.dart';
import 'package:clicks_user/features/home/job_price.dart';
import 'package:clicks_user/features/home/skipcash_api.dart';
import 'package:clicks_user/features/home/skipcash_pay.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class PaymentHoldArgs {
  final String jobId;
  final String jobReference;
  /// Server-priced total (pricing.total), 2 decimals when shown.
  final num? price;

  const PaymentHoldArgs({
    required this.jobId,
    required this.jobReference,
    this.price,
  });

  factory PaymentHoldArgs.fromJob(Map<String, dynamic> job) {
    return PaymentHoldArgs(
      jobId: job['_id']?.toString() ?? job['id']?.toString() ?? '',
      jobReference: job['job_reference']?.toString() ?? '',
      price: jobPayableTotal(job),
    );
  }
}

class PaymentHoldScreen extends StatefulWidget {
  final PaymentHoldArgs args;
  const PaymentHoldScreen({super.key, required this.args});

  @override
  State<PaymentHoldScreen> createState() => _PaymentHoldScreenState();
}

class _PaymentHoldScreenState extends State<PaymentHoldScreen> {
  var _paying = false;
  var _cashChosen = false;
  num? _total;

  PaymentHoldArgs get args => widget.args;

  @override
  void initState() {
    super.initState();
    _total = args.price;
    _refreshTotal();
  }

  Future<void> _refreshTotal() async {
    if (args.jobId.isEmpty) return;
    final total = await SkipcashApi.fetchTotal(args.jobId);
    if (!mounted || total == null) return;
    setState(() => _total = total);
  }

  Future<void> _payNow() async {
    if (_paying || args.jobId.isEmpty) return;
    setState(() => _paying = true);
    final result = await SkipcashPay.start(context, args.jobId);
    if (!mounted) return;
    setState(() => _paying = false);
    switch (result) {
      case SkipcashPayResult.paid:
        _leavePaid();
      case SkipcashPayResult.unavailable:
        _showError('home.payment_unavailable'.tr());
      case SkipcashPayResult.failed:
        _showError('home.payment_failed'.tr());
      case SkipcashPayResult.cancelled:
        break;
    }
  }

  Future<void> _payCash() async {
    if (_paying || args.jobId.isEmpty) return;
    setState(() => _paying = true);
    try {
      final response = await DioHelper.postData(
        url: EndPoints.payCash(args.jobId),
        data: {},
        auth: true,
      );
      if (!mounted) return;
      if (response.statusCode == 200) {
        setState(() => _cashChosen = true);
        _showError('home.pay_cash_hold_success'.tr());
      } else {
        _showError(
          DioHelper.errorMessage(response) ?? 'home.pay_cash_failed'.tr(),
        );
      }
    } catch (_) {
      if (mounted) _showError('home.pay_cash_failed'.tr());
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  void _leavePaid() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('home.payment_success'.tr())),
    );
    context.offNamed(Routes.home);
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 24.w),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: 32.h),
              Text(
                'home.payment_needed_title'.tr(),
                style: TextStyles.font28Bold.copyWith(fontSize: 26.sp),
              ),
              SizedBox(height: 12.h),
              Text(
                'home.payment_needed_body'.tr(),
                style: TextStyles.font14RegularGrey,
              ),
              if (args.jobReference.isNotEmpty) ...[
                SizedBox(height: 16.h),
                Text(
                  args.jobReference,
                  style: TextStyles.font16RegularBlack
                      .copyWith(fontWeight: FontWeight.w600),
                ),
              ],
              if (_total != null) ...[
                SizedBox(height: 8.h),
                Text(
                  '${'common.qar'.tr()} ${formatQarAmount(_total!)}',
                  style: TextStyles.font16RegularBlack,
                ),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 50.h,
                child: FilledButton(
                  onPressed: _paying ? null : _payNow,
                  style: FilledButton.styleFrom(
                    backgroundColor: ColorsManager.mainColor,
                  ),
                  child: _paying
                      ? SizedBox(
                          width: 20.w,
                          height: 20.w,
                          child: const CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text('home.pay_now'.tr()),
                ),
              ),
              SizedBox(height: 12.h),
              SizedBox(
                width: double.infinity,
                height: 50.h,
                child: OutlinedButton(
                  onPressed: _paying ? null : _payCash,
                  child: Text(
                    _cashChosen
                        ? 'home.pay_cash_hold_success'.tr()
                        : 'home.pay_cash_hold'.tr(),
                  ),
                ),
              ),
              SizedBox(height: 12.h),
              SizedBox(
                width: double.infinity,
                height: 50.h,
                child: OutlinedButton(
                  onPressed: () async {
                    await showModalBottomSheet<bool>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => const ContactSupportSheet(),
                    );
                  },
                  child: Text('activity_details.contact_support'.tr()),
                ),
              ),
              SizedBox(height: 12.h),
              SizedBox(
                width: double.infinity,
                height: 50.h,
                child: TextButton(
                  onPressed: () => context.offNamed(Routes.activity),
                  child: Text('activity.activity'.tr()),
                ),
              ),
              SizedBox(height: 24.h),
            ],
          ),
        ),
      ),
    );
  }
}

JobDto unpaidJobDto(PaymentHoldArgs args) {
  return JobDto(
    id: args.jobId,
    jobReference: args.jobReference,
    dateTime: DateTime.now(),
    jobType: '',
    issue: '',
    location: '',
    price: args.price?.round(),
    status: JobStatus.completed,
    paymentStatus: 'unpaid',
    rejectionReasons: const [],
  );
}
