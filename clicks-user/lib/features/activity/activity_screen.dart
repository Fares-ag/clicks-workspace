import '../../core/config/public_config.dart';
import 'package:clicks_user/core/components/clicks_app_header.dart';
import 'package:clicks_user/core/components/clicks_card.dart';
import 'package:clicks_user/core/components/header_icon_button.dart';
import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/services/session_resume.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/home/job_in_progress_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/text_styles.dart';
import 'cubit/activity_cubit.dart';
import 'models/activity_repos.dart';
import 'models/job_history_response.dart';

class ActivityScreen extends StatefulWidget {
  const ActivityScreen({super.key});

  @override
  State<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends State<ActivityScreen> {
  DateTimeRange? selectedDateRange;

  void _pickDateRange(BuildContext context) async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      initialDateRange: selectedDateRange,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
      currentDate: DateTime.now(),
      helpText: 'activity.select_date_range'.tr(),
      saveText: 'common.done'.tr(),
    );

    if (picked != null && picked != selectedDateRange) {
      setState(() {
        selectedDateRange = picked;
      });
    }
  }

  bool _inRangeInclusive(DateTime value, DateTimeRange range) {
    final start = DateTime(
      range.start.year,
      range.start.month,
      range.start.day,
    );
    final end = DateTime(
      range.end.year,
      range.end.month,
      range.end.day,
      23,
      59,
      59,
      999,
    );

    return value.compareTo(start) >= 0 && value.compareTo(end) <= 0;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ColorsManager.canvas,
      appBar: ClicksAppHeader(
        title: "activity.activity".tr(),
        actions: [
          HeaderIconButton(
            icon: Icons.calendar_month_outlined,
            selected: selectedDateRange != null,
            semanticsLabel: 'activity.select_date_range'.tr(),
            onTap: () => _pickDateRange(context),
          ),
          if (selectedDateRange != null)
            Padding(
              padding: EdgeInsetsDirectional.only(start: 8.w),
              child: HeaderIconButton(
                icon: Icons.close,
                semanticsLabel: 'activity.clear_date_filter'.tr(),
                onTap: () => setState(() => selectedDateRange = null),
              ),
            ),
        ],
      ),
      body: BlocBuilder<ActivityCubit, ActivityState>(
        builder: (context, state) {
          if (state is ActivityLoading) {
            return Center(
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            );
          }

          if (state is ActivityFailure) {
            return Center(
              child: Padding(
                padding: EdgeInsets.all(24.w),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      state.message,
                      style: TextStyles.font16RegularBlack,
                      textAlign: TextAlign.center,
                    ),
                    SizedBox(height: 16.h),
                    TextButton(
                      onPressed: () =>
                          context.read<ActivityCubit>().loadHistory(),
                      child: Text('common.retry'.tr()),
                    ),
                  ],
                ),
              ),
            );
          }

          if (state is ActivitySuccess) {
            final range = selectedDateRange;

            final filteredJobs =
                (range == null)
                    ? state.jobs
                    : state.jobs
                        .where((j) => _inRangeInclusive(j.dateTime, range))
                        .toList();

            if (filteredJobs.isEmpty) {
              return Center(
                child: Text(
                  'activity.no_activity'.tr(),
                  style: TextStyles.font14RegularGrey,
                ),
              );
            }

            final items =
                filteredJobs.map((j) {
                  final vehicle = [
                    j.vehicleMake,
                    j.vehicleModel,
                  ]
                      .map((e) => e?.trim() ?? '')
                      .where((e) => e.isNotEmpty)
                      .join(' ');
                  return JobCardData(
                    dateTime: j.dateTime,
                    title: j.jobType,
                    jobId: _displayJobId(j),
                    priceQar: j.price,
                    status: j.status,
                    paid: _isPaid(j.paymentStatus),
                    technician: j.technicianName ?? '',
                    vehicle: vehicle,
                    location: j.location,
                    imageAsset: AssetsManager.carExample2Image,
                  );
                }).toList();

            return NotificationListener<ScrollNotification>(
              onNotification: (n) {
                // Only react to real scrolling of a scrollable list — an empty
                // or short list has maxScrollExtent == 0, which used to make
                // every notification request another page.
                if (n is ScrollUpdateNotification &&
                    n.metrics.maxScrollExtent > 0 &&
                    n.metrics.extentAfter < 200) {
                  context.read<ActivityCubit>().loadMore();
                }
                return false;
              },
              child: JobsExactScreenFromApi(
                items: items,
                jobs: filteredJobs,
                loadingMore: state is ActivitySuccess && state.loadingMore,
                hasMore: state is ActivitySuccess && state.hasMore,
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }
}

class JobsExactScreenFromApi extends StatefulWidget {
  final List<JobCardData> items;
  final List<JobDto> jobs;
  final bool loadingMore;
  final bool hasMore;
  const JobsExactScreenFromApi({
    super.key,
    required this.items,
    required this.jobs,
    this.loadingMore = false,
    this.hasMore = false,
  });

  @override
  State<JobsExactScreenFromApi> createState() => _JobsExactScreenFromApiState();
}

class _JobsExactScreenFromApiState extends State<JobsExactScreenFromApi> {
  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: EdgeInsets.all(16.w),
      itemCount: widget.items.length + (widget.loadingMore || widget.hasMore ? 1 : 0),
      separatorBuilder: (_, __) => SizedBox(height: 12.h),
      itemBuilder: (context, i) {
        if (i >= widget.items.length) {
          return Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 12.h),
              child: CircularProgressIndicator(color: ColorsManager.mainColor),
            ),
          );
        }
        final data = widget.items[i];
        final job = widget.jobs[i];
        final isOngoing = data.status == JobStatus.ongoing;

        return _ExactJobCard(
          data: data,
          buttonLabel: isOngoing
              ? 'activity.continue_btn'.tr()
              : 'activity.view_details'.tr(),
          onViewDetails: () {
            if (isOngoing) {
              _continueJob(context, job.id);
            } else {
              context.toNamed(Routes.activityDetails, arguments: job);
            }
          },
        );
      },
    );
  }

  Future<void> _continueJob(BuildContext ctx, String jobId) async {
    // Show loading
    showDialog(
      context: ctx,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final repo = ActivityRepository();
      final jobData = await repo.getJobRaw(jobId);

      if (!ctx.mounted) return;
      Navigator.of(ctx).pop(); // close loading

      final status = jobData['job_status']?.toString() ?? '';

      // Parse technician info for tracking screen
      Map<String, dynamic> techInfo = {};
      final tech = jobData['assignedTechnician'];
      if (tech is Map<String, dynamic>) {
        techInfo = {
          'name': '${tech['firstName'] ?? ''} ${tech['lastName'] ?? ''}'.trim(),
          'phone': tech['phone'] ?? '',
          'photo': tech['profilePicture'] ?? '',
          'rating': tech['rating'] ?? 0,
        };
      }

      // Parse customer location
      double? lat;
      double? lng;
      final loc = jobData['location'];
      if (loc is Map) {
        lat = (loc['latitude'] as num?)?.toDouble();
        lng = (loc['longitude'] as num?)?.toDouble();
      } else if (loc is String && loc.contains(',')) {
        final parts = loc.split(',');
        lat = double.tryParse(parts[0].trim());
        lng = double.tryParse(parts[1].trim());
      }

      final garagePhase = SessionResume.resolveGaragePhase(jobData);

      switch (status) {
        case 'on_hold':
          if (garagePhase == 'returning') {
            if (lat != null && lng != null) {
              Navigator.pushNamed(
                ctx,
                Routes.technicianTracking,
                arguments: TrackingArgs(
                  jobId: jobId,
                  techInfo: techInfo,
                  customerLat: lat,
                  customerLng: lng,
                  initialPhase: 'on_hold',
                  techLat: SessionResume.techLat(jobData),
                  techLng: SessionResume.techLng(jobData),
                ),
              );
            } else {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text('activity.location_unavailable'.tr()),
                  backgroundColor: Colors.orange,
                ),
              );
            }
          } else {
            ctx.toNamed(
              Routes.activityDetails,
              arguments: JobDto.fromJson(jobData),
            );
          }
          break;
        case 'accepted':
        case 'en_route':
          if (lat != null && lng != null) {
            Navigator.pushNamed(
              ctx,
              Routes.technicianTracking,
              arguments: TrackingArgs(
                jobId: jobId,
                techInfo: techInfo,
                customerLat: lat,
                customerLng: lng,
                initialPhase: status == 'en_route' ? 'en_route' : 'en_route',
              ),
            );
          } else {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text('activity.location_unavailable'.tr()), backgroundColor: Colors.orange),
            );
          }
          break;
        case 'arrived':
          if (lat != null && lng != null) {
            Navigator.pushNamed(
              ctx,
              Routes.technicianTracking,
              arguments: TrackingArgs(
                jobId: jobId,
                techInfo: techInfo,
                customerLat: lat,
                customerLng: lng,
                initialPhase: 'arrived',
              ),
            );
          } else {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text('activity.location_unavailable'.tr()), backgroundColor: Colors.orange),
            );
          }
          break;
        case 'in_progress':
          // Parse vehicle info
          String vehicleName = '';
          final vehicle = jobData['customer_vehicle_id'];
          if (vehicle is Map<String, dynamic>) {
            final make = vehicle['vehicle_make'];
            final model = vehicle['vehicle_model'];
            final makeName = make is Map ? make['makeName'] ?? '' : '';
            final modelName = model is Map ? model['modelName'] ?? '' : '';
            vehicleName = '$makeName $modelName ${vehicle['year'] ?? ''}'.trim();
          }

          Navigator.pushNamed(
            ctx,
            Routes.jobInProgress,
            arguments: JobProgressArgs(
              userName: '',
              bannerTitle: 'home.job_in_progress'.tr(),
              bannerBody: 'job_progress.banner_body'.tr(),
              jobId: jobId,
              jobReference: jobData['job_reference']?.toString() ?? '',
              statusPillText: JobStatusLabels.labelFor('in_progress'),
              technicianName: techInfo['name'] ?? '',
              technicianPhone: techInfo['phone'] ?? '',
              technicianAvatarUrl: techInfo['photo'] ?? '',
              vehicleName: vehicleName,
              vehicleCode: '',
              onCallDispatch: () async {
                await PublicConfig.callSupport();
              },
              onCallTechnician: () async {
                final phone = techInfo['phone'] ?? '';
                if (phone.isNotEmpty) {
                  final uri = Uri.parse('tel:$phone');
                  if (await canLaunchUrl(uri)) {
                    await launchUrl(uri);
                  }
                }
              },
            ),
          );
          break;
        default:
          // Fallback: show details
          final dto = JobDto.fromJson(jobData);
          ctx.toNamed(Routes.activityDetails, arguments: dto);
      }
    } catch (e) {
      if (!ctx.mounted) return;
      Navigator.of(ctx).pop();
      ScaffoldMessenger.of(ctx).showSnackBar(
        SnackBar(content: Text('${'activity.failed_to_load'.tr()}: $e'), backgroundColor: Colors.red),
      );
    }
  }
}

class JobCardData {
  final DateTime dateTime;
  final String title;
  final String? jobId;
  final int? priceQar;
  final JobStatus status;
  final bool paid;
  final String technician;
  final String vehicle;
  final String location;
  final String imageAsset;

  const JobCardData({
    required this.dateTime,
    required this.title,
    required this.jobId,
    required this.priceQar,
    required this.status,
    required this.paid,
    required this.technician,
    required this.vehicle,
    required this.location,
    required this.imageAsset,
  });
}

// class JobsExactScreen extends StatefulWidget {
//   const JobsExactScreen({super.key});

//   @override
//   State<JobsExactScreen> createState() => _JobsExactScreenState();
// }

// class _JobsExactScreenState extends State<JobsExactScreen> {
//   final items = <JobCardData>[
//     JobCardData(
//       dateTime: DateTime(2025, 2, 12, 14, 30),
//       title: 'Flat Tire Assistance',
//       jobId: 'OC - 001',
//       priceQar: 500,
//       status: JobStatus.ongoing,
//       technician: 'Ahmed Ali',
//       location: 'Al-Adan, Zarqa',
//       imageAsset: AssetsManager.carExample2Image,
//     ),
//     JobCardData(
//       dateTime: DateTime(2025, 1, 10, 20, 30),
//       title: 'Flat Tire Assistance',
//       jobId: 'OC - 001',
//       priceQar: 500,
//       status: JobStatus.completed,
//       technician: 'Ahmed Ali',
//       location: 'Al-Adan, Zarqa',
//       imageAsset: AssetsManager.carExample2Image,
//     ),
//     JobCardData(
//       dateTime: DateTime(2025, 1, 1, 18, 30),
//       title: 'Flat Tire Assistance',
//       jobId: 'OC - 001',
//       priceQar: 500,
//       status: JobStatus.cancelled,
//       technician: 'Ahmed Ali',
//       location: 'Al-Adan, Zarqa',
//       imageAsset: AssetsManager.carExample2Image,
//     ),
//   ];

//   // Track expanded tile indices for chevron swap
//   final expanded = <int, bool>{};

//   @override
//   Widget build(BuildContext context) {
//     return ListView.separated(
//       padding: const EdgeInsets.all(12),
//       itemCount: items.length,
//       separatorBuilder: (_, __) => const SizedBox(height: 12),
//       itemBuilder: (context, i) {
//         final data = items[i];
//         final isExpanded = expanded[i] ?? false;
//         return _ExactJobCard(
//           data: data,
//           isExpanded: isExpanded,
//           onExpand: (v) => setState(() => expanded[i] = v),
//         );
//       },
//     );
//   }
// }

class _ExactJobCard extends StatelessWidget {
  final JobCardData data;
  final VoidCallback onViewDetails;
  final String buttonLabel;

  const _ExactJobCard({
    required this.data,
    required this.onViewDetails,
    required this.buttonLabel,
  });

  bool get _ongoing => data.status == JobStatus.ongoing;

  String _subtitle() {
    if (data.vehicle.isNotEmpty) return data.vehicle;
    if (data.technician.isNotEmpty) return data.technician;
    if (data.jobId != null) {
      return '${'activity.job_id'.tr()}: ${data.jobId}';
    }
    return '';
  }

  String _amountText(BuildContext context) {
    if (data.status == JobStatus.cancelled && !data.paid) {
      return 'activity.no_charge'.tr();
    }
    if (data.priceQar == null) return 'activity.price_tbd'.tr();
    final n = NumberFormat.decimalPattern(context.locale.languageCode)
        .format(data.priceQar);
    return '${'common.qar'.tr()} $n';
  }

  @override
  Widget build(BuildContext context) {
    final chipBg = switch (data.status) {
      JobStatus.ongoing => const Color(0xFFFFFAEB),
      JobStatus.completed => const Color(0xFFECFDF3),
      JobStatus.cancelled => const Color(0xFFFEF3F2),
    };
    final chipFg = switch (data.status) {
      JobStatus.ongoing => const Color(0xFFDC6803),
      JobStatus.completed => const Color(0xFF039855),
      JobStatus.cancelled => const Color(0xFFD92D20),
    };
    final subtitle = _subtitle();

    return ClicksCard(
      onTap: onViewDetails,
      padding: EdgeInsets.all(16.w),
      radius: 14,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.calendar_today_outlined,
                  size: 14.sp, color: ColorsManager.greyColor),
              SizedBox(width: 6.w),
              Expanded(
                child: Text(
                  _formatDate(context, data.dateTime),
                  style: TextStyles.font12RegularBlack.copyWith(
                    color: ColorsManager.greyColor,
                  ),
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(20.r),
                  border: Border.all(color: chipFg.withValues(alpha: 0.25)),
                ),
                child: Text(
                  _statusText(data.status),
                  style: TextStyles.font12RegularBlack.copyWith(
                    color: chipFg,
                    fontWeight: FontWeight.w600,
                    fontSize: 11.sp,
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 12.h),
            child: Divider(height: 1.h, color: ColorsManager.cardBorder),
          ),
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4.r),
                child: Image.asset(
                  data.imageAsset,
                  width: 48.w,
                  height: 48.w,
                  fit: BoxFit.contain,
                ),
              ),
              SizedBox(width: 12.w),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      data.title.isEmpty ? '—' : data.title,
                      style: TextStyles.font16Medium.copyWith(
                        fontWeight: FontWeight.w600,
                        color: ColorsManager.blackColor,
                      ),
                    ),
                    if (subtitle.isNotEmpty) ...[
                      SizedBox(height: 2.h),
                      Text(
                        subtitle,
                        style: TextStyles.font12RegularBlack.copyWith(
                          color: ColorsManager.greyColor,
                        ),
                      ),
                    ],
                    if (data.jobId != null &&
                        subtitle !=
                            '${'activity.job_id'.tr()}: ${data.jobId}') ...[
                      SizedBox(height: 2.h),
                      Text(
                        '${'activity.job_id'.tr()}: ${data.jobId}',
                        style: TextStyles.font12RegularBlack.copyWith(
                          color: ColorsManager.greyColor,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: ColorsManager.listTileArrowForward,
                size: 22.sp,
              ),
            ],
          ),
          SizedBox(height: 16.h),
          Text(
            _amountText(context),
            style: TextStyles.font16Medium.copyWith(
              fontWeight: FontWeight.w600,
              color: ColorsManager.blackColor,
            ),
          ),
          if (_ongoing) ...[
            SizedBox(height: 12.h),
            SizedBox(
              width: double.infinity,
              height: 48.h,
              child: FilledButton(
                onPressed: onViewDetails,
                style: FilledButton.styleFrom(
                  backgroundColor: ColorsManager.mainColor,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10.r),
                  ),
                ),
                child: Text(
                  buttonLabel,
                  style: TextStyles.font14Medium.copyWith(color: Colors.white),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _statusText(JobStatus s) {
    switch (s) {
      case JobStatus.ongoing:
        return 'activity_details.on_going'.tr();
      case JobStatus.completed:
        return 'activity.completed_jobs'.tr();
      case JobStatus.cancelled:
        return 'activity.cancelled_jobs'.tr();
    }
  }
}

/// Customer-facing job number. Only a real `job_reference` — never a
/// truncated Mongo id that looks like a ticket number.
String? _displayJobId(JobDto job) {
  final ref = (job.jobReference ?? '').trim();
  if (ref.isEmpty) return null;
  return ref;
}

bool _isPaid(String? status) {
  switch ((status ?? '').toLowerCase()) {
    case 'paid':
    case 'partially_refunded':
    case 'refunded':
      return true;
    default:
      return false;
  }
}

String _formatDate(BuildContext context, DateTime dt) {
  final locale = context.locale.toString();
  try {
    return DateFormat('MMM d, yyyy - h:mm a', locale).format(dt);
  } catch (_) {
    return DateFormat('MMM d, yyyy - h:mm a').format(dt);
  }
}
