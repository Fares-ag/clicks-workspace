import 'dart:ui';

import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/core/notifications/job_notification_service.dart';
import 'package:clicks_technician/core/permissions/permissions_setup_sheet.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/activity_tab.dart';
import 'package:clicks_technician/features/home/ui/view/earnings_tab.dart';
import 'package:clicks_technician/features/home/ui/view/home_screen.dart';
import 'package:clicks_technician/features/home/ui/view/settings_tab.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/incoming_job_modal.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/incoming_job_top_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

/// Figma bottom nav + global Incoming Job overlay on any tab.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  int _index = 0;
  String? _lastJobStatus;
  bool _showIncomingDetails = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _promptPermissionsIfNeeded());
  }

  Future<void> _promptPermissionsIfNeeded() async {
    if (!mounted) return;
    await PermissionsSetupSheet.showIfNeeded(context);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    JobNotificationService.instance.setForeground(
      state == AppLifecycleState.resumed,
    );
    if (state == AppLifecycleState.resumed) {
      context.read<HomeCubit>().onAppResumed();
      // Re-check location after returning from Settings.
      context.read<HomeCubit>().recheckLocationPermission();
    }
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<HomeCubit, HomeState>(
      listener: (context, state) {
        final cubit = context.read<HomeCubit>();
        final status = cubit.jobStatus;
        // Activities → Continue job: switch to Home tab.
        if (cubit.pendingNavigateHome) {
          setState(() {
            _index = 0;
            _showIncomingDetails = false;
          });
          cubit.clearPendingNavigateHome();
        }
        // After Accept, jump to Home so the map / job flow is visible.
        if (_lastJobStatus == 'assigned' &&
            status.isNotEmpty &&
            status != 'assigned' &&
            cubit.activeJob != null) {
          setState(() {
            _index = 0;
            _showIncomingDetails = false;
          });
        }
        if (status != 'assigned' && _showIncomingDetails) {
          setState(() => _showIncomingDetails = false);
        }
        _lastJobStatus = status.isEmpty ? null : status;
      },
      builder: (context, state) {
        final cubit = context.read<HomeCubit>();
        final status = cubit.jobStatus;
        final showIncoming =
            cubit.activeJob != null && status == 'assigned';
        if (showIncoming) {
          // Keep the alarm going while the Accept modal is visible.
          // ignore: discarded_futures
          JobNotificationService.instance.startInsistentAlarm();
        }
        final onPhotoHome = cubit.activeJob == null || status == 'assigned';
        final photoHome = _index == 0 && onPhotoHome;
        final idleIcon = photoHome ? Colors.white : ColorsManager.greyColor;

        return Stack(
          children: [
            Scaffold(
              backgroundColor:
                  photoHome ? const Color(0xFF320A0A) : Colors.white,
              body: IndexedStack(
                index: _index,
                children: const [
                  HomeScreen(),
                  ActivityTab(),
                  EarningsTab(),
                  SettingsTab(),
                ],
              ),
              bottomNavigationBar: photoHome
                  ? ClipRect(
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                        child: Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF5C1515)
                                .withValues(alpha: 0.72),
                            border: Border.all(
                              color: const Color(0x28EFEFEF),
                              width: 1.5,
                            ),
                          ),
                          child: _navRow(context, photoHome, idleIcon),
                        ),
                      ),
                    )
                  : Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border(
                            top: BorderSide(color: ColorsManager.border)),
                      ),
                      child: _navRow(context, photoHome, idleIcon),
                    ),
            ),
            if (showIncoming)
              Positioned(
                top: 0,
                right: 0,
                left: 0,
                child: IncomingJobTopBanner(
                  cubit: cubit,
                  onExpand: () => setState(() => _showIncomingDetails = true),
                ),
              ),
            if (showIncoming && _showIncomingDetails)
              Positioned.fill(
                child: IncomingJobModal(cubit: cubit),
              ),
          ],
        );
      },
    );
  }

  Widget _navRow(BuildContext context, bool photoHome, Color idleIcon) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 6.h, horizontal: 10.w),
        child: Row(
          children: [
            _NavItem(
              icon: Icons.home_outlined,
              selectedIcon: Icons.home_rounded,
              label: 'Home',
              selected: _index == 0,
              photoHome: photoHome,
              idleColor: idleIcon,
              onTap: () => setState(() => _index = 0),
            ),
            _NavItem(
              icon: Icons.history_rounded,
              selectedIcon: Icons.history_rounded,
              label: 'Activity',
              selected: _index == 1,
              photoHome: photoHome,
              idleColor: idleIcon,
              onTap: () {
                setState(() => _index = 1);
                context.read<HomeCubit>().fetchHistory();
              },
            ),
            _NavItem(
              icon: Icons.attach_money_rounded,
              selectedIcon: Icons.attach_money_rounded,
              label: 'Earnings',
              selected: _index == 2,
              photoHome: photoHome,
              idleColor: idleIcon,
              onTap: () {
                setState(() => _index = 2);
                context.read<HomeCubit>().fetchHomeMeta();
              },
            ),
            _NavItem(
              icon: Icons.settings_outlined,
              selectedIcon: Icons.settings_rounded,
              label: 'Settings',
              selected: _index == 3,
              photoHome: photoHome,
              idleColor: idleIcon,
              onTap: () => setState(() => _index = 3),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.photoHome,
    required this.idleColor,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final bool photoHome;
  final Color idleColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? Colors.white
        : (photoHome ? Colors.white : idleColor);
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4.r),
        child: Container(
          margin: EdgeInsets.symmetric(horizontal: 2.w),
          padding: EdgeInsets.symmetric(vertical: 8.h),
          decoration: BoxDecoration(
            color: selected ? ColorsManager.mainColor : Colors.transparent,
            borderRadius: BorderRadius.circular(selected ? 4.r : 100.r),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(selected ? selectedIcon : icon, color: color, size: 22.sp),
              SizedBox(height: 2.h),
              Text(
                label,
                style: TextStyles.font12RegularBlack.copyWith(
                  color: color,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 11.sp,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
