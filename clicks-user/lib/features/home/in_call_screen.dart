import 'package:clicks_user/core/constants/job_status_labels.dart';
import 'package:clicks_user/core/helper/app_snack_bars.dart';
import 'package:clicks_user/core/helper/extensions.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/routing/routes.dart';
import '../settings/ui/cubit/settings_cubit.dart';
import 'job_in_progress_screen.dart';
import '../../core/helper/technician_location.dart';
import 'technician_tracking_screen.dart';
import 'timer_sos_screen.dart';

class InCallWithDispatcherScreen extends StatefulWidget {
  const InCallWithDispatcherScreen({super.key});

  @override
  State<InCallWithDispatcherScreen> createState() => _InCallWithDispatcherScreenState();
}

class _InCallWithDispatcherScreenState extends State<InCallWithDispatcherScreen> {
  Map<String, dynamic>? techInfo;
  String? jobId;
  bool _techAssigned = false;
  String _techName = '';

  double _parseDouble(dynamic v) {
    if (v == null) return 0;
    if (v is double) return v;
    if (v is int) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  String _monthName(int m) {
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[m];
  }

  String _formatTime(DateTime dt) {
    final h = dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final ampm = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:${dt.minute.toString().padLeft(2, '0')} $ampm';
  }

  @override
  Widget build(BuildContext context) {
    final bg = const Color(0xFFF6F7F9);

    return Scaffold(
      backgroundColor: bg,
      body: BlocListener<SosCubit, SosState>(
        listener: (context, state) {
          if (state is JobCancelled || state is SosCancelled) {
            AppSnackBars.errorSnackBar('home.sos_cancelled'.tr());
            context.offAllNamed(Routes.home);
          } else if (state is TechnicianAssigned) {
            setState(() {
              techInfo = state.technicianInfo;
              jobId = state.jobId;
              _techAssigned = true;
              _techName = state.technicianInfo['name'] ?? 'a technician';
            });
            AppSnackBars.successSnackBar(
              'in_call.tech_assigned_snack'.tr(),
            );
          } else if (state is TechnicianAccepted) {
            techInfo = state.technicianInfo;
            jobId = state.jobId;
            AppSnackBars.successSnackBar(
              "${techInfo?["name"] ?? 'N/A'} ${'home.technician_accepted'.tr()}",
            );
          } else if (state is TechnicianEnRoute) {
            // Navigate to live tracking map screen
            final position = context.read<SosCubit>().lastKnownPosition;
            final ti = techInfo ?? state.technicianInfo;
            final (techLat, techLng) = TechnicianLocation.latLngFrom(ti);
            context.offNamed(
              Routes.technicianTracking,
              arguments: TrackingArgs(
                jobId: state.jobId,
                techInfo: ti,
                customerLat: position?.latitude ?? 25.2854,
                customerLng: position?.longitude ?? 51.5310,
                initialPhase: 'en_route',
                techLat: techLat,
                techLng: techLng,
              ),
            );
          } else if (state is TechnicianArrived) {
            // Navigate to tracking in arrived mode
            final position = context.read<SosCubit>().lastKnownPosition;
            context.offNamed(
              Routes.technicianTracking,
              arguments: TrackingArgs(
                jobId: state.jobId,
                techInfo: techInfo ?? {},
                customerLat: position?.latitude ?? 25.2854,
                customerLng: position?.longitude ?? 51.5310,
                initialPhase: 'arrived',
              ),
            );
          } else if (state is JobStarted) {
            AppSnackBars.successSnackBar(
              'in_call.tech_started'.tr(namedArgs: {'name': techInfo?["name"] ?? "N/A"}),
            );
            final car = context.read<MyCarsCubit>().selectedCar;

            // Format date/time
            String dateText = '';
            if (state.dateTime != null) {
              try {
                final dt = DateTime.parse(state.dateTime!).toLocal();
                dateText = '${_monthName(dt.month)} ${dt.day}, ${dt.year} - ${_formatTime(dt)}';
              } catch (_) {}
            }
            if (dateText.isEmpty) {
              final now = DateTime.now();
              dateText = '${_monthName(now.month)} ${now.day}, ${now.year} - ${_formatTime(now)}';
            }

            // Format estimate time
            String estimateText = '';
            if (state.estimateTimeMinutes != null && state.estimateTimeMinutes! > 0) {
              final mins = state.estimateTimeMinutes!;
              if (mins >= 60) {
                final h = mins ~/ 60;
                final m = mins % 60;
                estimateText = m > 0 ? '${h}h ${m}min' : '${h}h';
              } else {
                estimateText = '$mins min';
              }
            }

            context.offNamed(
              Routes.jobInProgress,
              arguments: JobProgressArgs(
                userName:
                    context.read<SettingsCubit>().profile?.firstName ?? "N/A",
                bannerTitle: 'home.job_in_progress'.tr(),
                bannerBody: 'job_progress.banner_body'.tr(),
                serviceTitle: state.issue,
                jobId: jobId ?? "",
                dateText: dateText,
                estimatedTime: estimateText,
                statusPillText: JobStatusLabels.labelFor('in_progress'),
                technicianName: techInfo?["name"] ?? "",
                technicianPhone: techInfo?["phone"] ?? "",
                technicianAvatarUrl: techInfo?["photo"] ?? "",
                vehicleName:
                    '${car?.vehicleMake?.makeName ?? ""} ${car?.year ?? ""} ${car?.vehicleModel?.modelName ?? ""}',
                vehicleCode: car?.plateNumber ?? "",
                onCallDispatch: () {},
                onCallTechnician: () {},
              ),
            );
          } else if (state is SosError) {
            // A cancel the server refuses comes back as an `error` event, not
            // `sosCancelled` — without this the sheet closes silently.
            AppSnackBars.errorSnackBar(
              state.message.trim().isEmpty
                  ? 'home.cancel_failed'.tr()
                  : state.message,
            );
          }
        },
        child: SafeArea(
          child: Column(
            children: [
              SizedBox(height: 50),
              // Top bar (custom)
              // Padding(
              //   padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              //   child: Row(
              //     children: [
              //       const Icon(Icons.location_on_outlined, size: 20, color: Color(0xFF6B7280)),
              //       const SizedBox(width: 8),
              //       Expanded(
              //         child: Text(
              //           'Al Nasr Tower B Doha Qatar',
              //           maxLines: 1,
              //           overflow: TextOverflow.ellipsis,
              //           style: TextStyle(
              //             fontSize: 13,
              //             color: textDark,
              //             fontWeight: FontWeight.w600,
              //           ),
              //         ),
              //       ),
              //       const SizedBox(width: 8),
              //       Container(
              //         width: 36,
              //         height: 36,
              //         decoration: BoxDecoration(
              //           color: Colors.white,
              //           borderRadius: BorderRadius.circular(10),
              //           boxShadow: const [
              //             BoxShadow(
              //               color: Color(0x14000000),
              //               blurRadius: 10,
              //               offset: Offset(0, 4),
              //             )
              //           ],
              //         ),
              //         child: const Icon(Icons.notifications_none, color: Color(0xFF111827)),
              //       ),
              //     ],
              //   ),
              // ),

              // Content scroll
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    // Red gradient banner — dynamic based on tech assignment
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: _techAssigned
                              ? [const Color(0xFF0D5F2C), const Color(0xFF0A3E1D)]
                              : [const Color(0xFF7A0F12), const Color(0xFF4D0B0D)],
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
                            _techAssigned
                                ? 'in_call.tech_assigned'.tr()
                                : 'in_call.in_call_dispatcher'.tr(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _techAssigned
                                ? 'in_call.tech_assigned_msg'.tr()
                                : 'in_call.request_handled'.tr(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (_techAssigned && _techName.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                const Icon(Icons.person, color: Colors.white70, size: 18),
                                const SizedBox(width: 6),
                                Text(
                                  _techName,
                                  style: const TextStyle(
                                    color: Colors.white70,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // Helper text
                    Text(
                      _techAssigned
                          ? 'in_call.tech_on_way_msg'.tr()
                          : 'in_call.stay_on_call'.tr(),
                      style: const TextStyle(
                        color: Color(0xFF6B7280),
                        height: 1.35,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),

                    const SizedBox(height: 18),
                    Divider(),
                    const SizedBox(height: 18),

                    // Car image
                    Center(
                      child: SizedBox(
                        height: 190,
                        child: Image.asset(
                          'assets/images/car_image.png', // replace with your figma export
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),

                    const SizedBox(height: 18),

                    // Tips card
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x14000000),
                            blurRadius: 14,
                            offset: Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'in_call.stay_calm'.tr(),
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF111827),
                            ),
                          ),
                          SizedBox(height: 10),
                          Text(
                            'in_call.tips'.tr(),
                            style: TextStyle(
                              fontSize: 13,
                              color: Color(0xFF6B7280),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          SizedBox(height: 10),
                          _TipLine(index: '1.', text: 'in_call.tip_safe_spot'.tr()),
                          SizedBox(height: 6),
                          _TipLine(
                            index: '2.',
                            text: 'in_call.tip_phone_charged'.tr(),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 18),

                    // Cancel SOS button — hidden once technician is assigned
                    if (!_techAssigned)
                      SizedBox(
                        height: 48,
                        child: OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            backgroundColor: Colors.white,
                            side: const BorderSide(color: Color(0xFFE5E7EB)),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          onPressed: () {
                            showCancelSOSSheet(context);
                          },
                          child: Text(
                            'home.cancel_sos'.tr(),
                            style: TextStyle(
                              color: Color(0xFF111827),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),

                    const SizedBox(height: 24),
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

class _TipLine extends StatelessWidget {
  final String index;
  final String text;
  const _TipLine({required this.index, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          index,
          style: const TextStyle(
            fontSize: 13,
            color: Color(0xFF111827),
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 13,
              color: Color(0xFF111827),
              fontWeight: FontWeight.w600,
              height: 1.25,
            ),
          ),
        ),
      ],
    );
  }
}
