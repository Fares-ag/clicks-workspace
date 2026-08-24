import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/routing/routes.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'rating_bottom_sheet.dart';

@immutable
class JobProgressArgs {
  final String userName;

  // Banner
  final String bannerTitle;
  final String bannerBody;

  // Job info
  final String serviceTitle; // Issue title / Flat Tire Assistance
  final String jobId; // Full MongoDB _id — shortened for display
  final String jobReference; // Technician-entered Job ID, when the job has one
  final String dateText;     // Feb 12, 2025 - 2:30 PM
  final String estimatedTime; // e.g. "45 min"
  final String statusPillText; // Working on your vehicle

  // Technician
  final String technicianName;
  final String technicianPhone;
  final String technicianAvatarUrl;

  // Vehicle
  final String vehicleName; // Audi A6 2016 Sedan
  final String vehicleCode; // 129874

  // Actions
  final VoidCallback onCallTechnician;
  final VoidCallback onCallDispatch;

  const JobProgressArgs({
    required this.userName,
    required this.bannerTitle,
    required this.bannerBody,
    this.serviceTitle = '',
    required this.jobId,
    this.jobReference = '',
    this.dateText = '',
    this.estimatedTime = '',
    required this.statusPillText,
    required this.technicianName,
    required this.technicianPhone,
    required this.technicianAvatarUrl,
    required this.vehicleName,
    required this.vehicleCode,
    required this.onCallTechnician,
    required this.onCallDispatch,
  });

  /// Technician-entered Job ID, falling back to the tail of the mongo id for
  /// jobs that have no reference yet. Same format as the activity list/details.
  String get shortJobId {
    final ref = jobReference.trim();
    if (ref.isNotEmpty) return ref;
    if (jobId.isEmpty) return '—';
    if (jobId.length > 6) {
      return '#${jobId.substring(jobId.length - 6)}';
    }
    return '#$jobId';
  }
}

class JobInProgressScreen extends StatelessWidget {
  final JobProgressArgs args;

  const JobInProgressScreen({super.key, required this.args});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F7F9),
      body: BlocListener<SosCubit, SosState>(
        listener: (context, state) {
          if (state is JobCancelled || state is SosCancelled) {
            AppSnackBars.errorSnackBar('job_progress.job_cancelled'.tr());
            context.offAllNamed(Routes.home);
          } else if (state is JobCompleted) {
            // Show rating bottom sheet instead of just going home
            showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
              isDismissible: false,
              enableDrag: false,
              builder: (_) => RatingBottomSheet(
                technicianName: args.technicianName,
                technicianPhotoUrl: args.technicianAvatarUrl,
                jobId: args.jobId,
                onSubmitted: () {
                  Navigator.of(context).pop();
                  AppSnackBars.successSnackBar('job_progress.thank_you_review'.tr());
                  context.offAllNamed(Routes.home);
                },
                onSkipped: () {
                  Navigator.of(context).pop();
                  context.offAllNamed(Routes.home);
                },
              ),
            );
          }
        },
        child: SafeArea(
          child: Column(
            children: [
              _TopBar(
                userName: args.userName,
                // notificationsCount: args.notificationsCount,
                // onTapNotifications: () {},
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    const SizedBox(height: 10),
                    _Banner(title: args.bannerTitle, body: args.bannerBody),
                    const SizedBox(height: 16),

                    _JobInfo(
                      serviceTitle: args.serviceTitle,
                      jobId: args.shortJobId,
                      dateText: args.dateText,
                      estimatedTime: args.estimatedTime,
                      statusPillText: args.statusPillText,
                    ),

                    const SizedBox(height: 14),
                    _SectionTitle('job_progress.technician'.tr()),
                    const SizedBox(height: 10),

                    _TechRow(
                      avatarUrl: args.technicianAvatarUrl,
                      name: args.technicianName,
                      phone: args.technicianPhone,
                      onCall: args.onCallTechnician,
                    ),

                    const SizedBox(height: 14),
                    _SectionTitle('job_progress.vehicle_details'.tr()),
                    const SizedBox(height: 10),

                    _VehicleRow(
                      vehicleName: args.vehicleName,
                      vehicleCode: args.vehicleCode,
                    ),

                    const SizedBox(height: 18),

                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF8B1A1B),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        onPressed: args.onCallDispatch,
                        child: Text(
                          'home.call_dispatch'.tr(),
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 22),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  final String userName;
  // final int notificationsCount;
  // final VoidCallback onTapNotifications;

  const _TopBar({
    required this.userName,
    // required this.notificationsCount,
    // required this.onTapNotifications,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'home.welcome'.tr(),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF111827),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  userName,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF6B7280),
                  ),
                ),
              ],
            ),
          ),

          // InkWell(
          //   // onTap: onTapNotifications,
          //   borderRadius: BorderRadius.circular(12),
          //   child: Stack(
          //     clipBehavior: Clip.none,
          //     children: [
          //       Container(
          //         width: 40,
          //         height: 40,
          //         decoration: BoxDecoration(
          //           color: Colors.white,
          //           borderRadius: BorderRadius.circular(12),
          //           boxShadow: const [
          //             BoxShadow(
          //               color: Color(0x14000000),
          //               blurRadius: 12,
          //               offset: Offset(0, 4),
          //             )
          //           ],
          //         ),
          //         child: const Icon(Icons.notifications_none, color: Color(0xFF111827)),
          //       ),
          //       if (notificationsCount > 0)
          //         Positioned(
          //           right: -2,
          //           top: -2,
          //           child: Container(
          //             padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          //             decoration: BoxDecoration(
          //               color: const Color(0xFFB91C1C),
          //               borderRadius: BorderRadius.circular(999),
          //               border: Border.all(color: const Color(0xFFF6F7F9), width: 2),
          //             ),
          //             child: Text(
          //               '$notificationsCount',
          //               style: const TextStyle(
          //                 color: Colors.white,
          //                 fontSize: 11,
          //                 fontWeight: FontWeight.w800,
          //               ),
          //             ),
          //           ),
          //         ),
          //     ],
          //   ),
          // ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  final String title;
  final String body;

  const _Banner({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF7A0F12), Color(0xFF4D0B0D)],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            body,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.25,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _JobInfo extends StatelessWidget {
  final String serviceTitle;
  final String jobId;
  final String dateText;
  final String estimatedTime;
  final String statusPillText;

  const _JobInfo({
    required this.serviceTitle,
    required this.jobId,
    required this.dateText,
    required this.estimatedTime,
    required this.statusPillText,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (serviceTitle.isNotEmpty) ...[
          Text(
            serviceTitle,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 6),
        ],
        Text(
          'job_progress.job_id'.tr(namedArgs: {'id': jobId}),
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Color(0xFF6B7280),
          ),
        ),
        if (dateText.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            dateText,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF9CA3AF),
            ),
          ),
        ],
        if (estimatedTime.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            'job_progress.estimated_job_time'.tr(namedArgs: {'time': estimatedTime}),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF6B7280),
            ),
          ),
        ],
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFFF59E0B),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            statusPillText,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle(this.title);

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w900,
        color: Color(0xFF111827),
      ),
    );
  }
}

class _TechRow extends StatelessWidget {
  final String avatarUrl;
  final String name;
  final String phone;
  final VoidCallback onCall;

  const _TechRow({
    required this.avatarUrl,
    required this.name,
    required this.phone,
    required this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundImage: NetworkImage(avatarUrl),
              backgroundColor: const Color(0xFFE5E7EB),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                name,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF111827),
                ),
              ),
            ),
            InkWell(
              onTap: onCall,
              borderRadius: BorderRadius.circular(10),
              child: Row(
                children: [
                  const Icon(Icons.call, size: 18, color: Color(0xFF111827)),
                  const SizedBox(width: 8),
                  Text(
                    phone,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF111827),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Divider(height: 1, color: Color(0xFFE5E7EB)),
      ],
    );
  }
}

class _VehicleRow extends StatelessWidget {
  final String vehicleName;
  final String vehicleCode;

  const _VehicleRow({required this.vehicleName, required this.vehicleCode});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                vehicleName,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF111827),
                ),
              ),
            ),
            Text(
              vehicleCode,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: Color(0xFF111827),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        const Divider(height: 1, color: Color(0xFFE5E7EB)),
      ],
    );
  }
}
