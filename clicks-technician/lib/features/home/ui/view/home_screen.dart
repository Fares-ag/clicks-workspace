import 'package:clicks_technician/core/helper/app_snack_bars.dart';
import 'package:clicks_technician/core/helper/assets_manager.dart';
import 'package:clicks_technician/core/theme/colors_manager.dart';
import 'package:clicks_technician/core/theme/text_styles.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/home/ui/view/active_job_screen.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/notifications_popup.dart';
import 'package:clicks_technician/features/home/ui/view/widgets/slide_status_toggle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

/// Home tab — Figma full-bleed idle + active job map UI.
/// Incoming Job modal is hosted globally in [MainShell].
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<HomeCubit, HomeState>(
      listener: (context, state) {
        if (state is HomeActionError) {
          AppSnackBars.errorSnackBar(state.message);
        }
        if (state is HomeActionSuccess) {
          AppSnackBars.successSnackBar(state.message);
        }
      },
      builder: (context, state) {
        if (state is HomeInitial || state is HomeLoading) {
          return Scaffold(
            backgroundColor: Colors.white,
            body: Center(
              child:
                  CircularProgressIndicator(color: ColorsManager.mainColor),
            ),
          );
        }

        final cubit = context.read<HomeCubit>();
        final status = cubit.jobStatus;
        final hasActiveFlow =
            cubit.activeJob != null && status.isNotEmpty && status != 'assigned';

        if (hasActiveFlow) {
          return ActiveJobScreen(cubit: cubit);
        }

        return _IdleHeroHome(cubit: cubit);
      },
    );
  }
}

class _IdleHeroHome extends StatelessWidget {
  const _IdleHeroHome({required this.cubit});
  final HomeCubit cubit;

  String _balanceLabel() {
    final v = cubit.balanceQar;
    if (v == null) return 'QAR —';
    final formatted = NumberFormat('#,##0.00').format(v);
    return 'QAR $formatted';
  }

  Future<void> _onSlideComplete(BuildContext context) async {
    if (!cubit.isOnline) {
      final allow = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(
            'Allow Location',
            style: TextStyles.font16RegularBlack
                .copyWith(fontWeight: FontWeight.bold),
          ),
          content: Text(
            'Clicks needs your location while you are Online so nearby jobs and Live Map work correctly.',
            style: TextStyles.font14RegularGrey.copyWith(color: Colors.black87),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Not now', style: TextStyles.font14RegularGrey),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(
                'Allow',
                style: TextStyles.font14RegularGrey.copyWith(
                  color: ColorsManager.mainColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
      if (allow != true) return;
    }
    await cubit.toggleOnlineStatus();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF320A0A),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (cubit.homeHeroUrl != null && cubit.homeHeroUrl!.isNotEmpty)
                Image.network(
                  cubit.homeHeroUrl!,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Image.asset(
                    AssetsManager.homeHeroTech,
                    fit: BoxFit.cover,
                  ),
                )
              else
                Image.asset(
                  AssetsManager.homeHeroTech,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xFF981F1F), Color(0xFF320A0A)],
                      ),
                    ),
                  ),
                ),
              Container(color: Colors.black.withValues(alpha: 0.2)),
              Positioned(
                right: 16.w,
                bottom: 120.h,
                child: Material(
                  color: Colors.black.withValues(alpha: 0.45),
                  shape: const CircleBorder(),
                  child: IconButton(
                    tooltip: 'Change home image',
                    icon: const Icon(Icons.photo_camera_outlined,
                        color: Colors.white),
                    onPressed: () async {
                      final picker = ImagePicker();
                      final file = await picker.pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 85,
                      );
                      if (file == null) return;
                      final ok = await cubit.uploadHomeHero(file.path);
                      if (context.mounted) {
                        if (ok) {
                          AppSnackBars.successSnackBar('Home image updated');
                        } else {
                          AppSnackBars.errorSnackBar('Upload failed');
                        }
                      }
                    },
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  children: [
                    Padding(
                      padding: EdgeInsets.symmetric(
                          horizontal: 16.w, vertical: 8.h),
                      child: Row(
                        children: [
                          Flexible(
                            child: Container(
                              padding: EdgeInsets.symmetric(
                                  horizontal: 12.w, vertical: 10.h),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: const Color(0xFFE4E7EC)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 8,
                                    height: 8,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: cubit.isOnline
                                          ? const Color(0xFF12B76A)
                                          : Colors.grey,
                                    ),
                                  ),
                                  SizedBox(width: 10.w),
                                  Flexible(
                                    child: Text(
                                      _balanceLabel(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style:
                                          TextStyles.font16RegularBlack.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w500,
                                        fontSize: 16.sp,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const Spacer(),
                          _NotificationBell(
                            hasUnread: cubit.unreadNotifications > 0,
                          ),
                        ],
                      ),
                    ),
                    if (cubit.sessionLoadFailed)
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 16.w),
                        child: _sessionBanner(cubit),
                      ),
                    if (cubit.locationWarning)
                      Padding(
                        padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 0),
                        child: _locationBanner(),
                      ),
                    const Spacer(),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 28.w),
                      child: SlideStatusToggle(
                        isOnline: cubit.isOnline,
                        enabled: cubit.jobStatus != 'assigned',
                        loading: cubit.isLoadingStatus,
                        onCompleted: () => _onSlideComplete(context),
                      ),
                    ),
                    SizedBox(height: 10.h),
                    Text(
                      cubit.socketConnected
                          ? (cubit.isOnline
                              ? 'Online — waiting for jobs'
                              : 'Offline')
                          : 'Socket reconnecting…',
                      style: TextStyles.font12RegularGrey
                          .copyWith(color: Colors.white70),
                    ),
                    SizedBox(height: 16.h),
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

class _NotificationBell extends StatelessWidget {
  const _NotificationBell({required this.hasUnread});
  final bool hasUnread;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        await showNotificationsPopup(context);
        if (context.mounted) {
          context.read<HomeCubit>().fetchHomeMeta();
        }
      },
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: EdgeInsets.all(12.w),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0xFFE4E7EC)),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Icon(
              Icons.notifications_none_rounded,
              size: 20.sp,
              color: ColorsManager.blackColor,
            ),
            if (hasUnread)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF79009),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

Widget _sessionBanner(HomeCubit cubit) {
  return Container(
    margin: EdgeInsets.only(bottom: 12.h),
    padding: EdgeInsets.all(12.w),
    decoration: BoxDecoration(
      color: const Color(0xFFFEF3F2),
      borderRadius: BorderRadius.circular(8.r),
      border: Border.all(color: const Color(0xFFFECDCA)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            "Couldn’t load session. Pull to refresh or retry.",
            style: TextStyles.font12RegularGrey
                .copyWith(color: const Color(0xFFD92D20)),
          ),
        ),
        TextButton(
          onPressed: cubit.fetchSession,
          child: Text('Retry',
              style: TextStyle(color: ColorsManager.mainColor)),
        ),
      ],
    ),
  );
}

Widget _locationBanner() {
  return Container(
    margin: EdgeInsets.only(bottom: 12.h),
    padding: EdgeInsets.all(12.w),
    decoration: BoxDecoration(
      color: const Color(0xFFFFFAEB),
      borderRadius: BorderRadius.circular(8.r),
      border: Border.all(color: const Color(0xFFFEC84B)),
    ),
    child: Text(
      'Location unavailable — Live Map may not update. Enable GPS / allow location in the browser.',
      style: TextStyles.font12RegularGrey
          .copyWith(color: const Color(0xFFB54708)),
    ),
  );
}
