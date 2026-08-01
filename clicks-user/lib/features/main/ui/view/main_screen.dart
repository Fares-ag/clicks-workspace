import 'package:clicks_user/core/helper/assets_manager.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/core/theme/colors_manager.dart';
import 'package:clicks_user/core/theme/text_styles.dart';
import 'package:clicks_user/features/activity/activity_screen.dart';
import 'package:clicks_user/features/activity/cubit/activity_cubit.dart';
import 'package:clicks_user/features/activity/models/activity_repos.dart';
import 'package:clicks_user/features/home/home_screen.dart';
import 'package:clicks_user/features/services/services_screen.dart';
import 'package:clicks_user/features/settings/ui/view/settings_screen.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../settings/ui/cubit/settings_cubit.dart';
import '../cubit/home_cubit.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> with WidgetsBindingObserver {
  late final List<Widget> screens = [
    HomeScreen(),
    BlocProvider(
      create: (_) => ActivityCubit(ActivityRepository())..loadHistory(),
      child: const ActivityScreen(),
    ),
    ServicesScreen(),
    SettingsScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<SettingsCubit>().getProfile(
            context,
            showLoading: false,
          );
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      context.read<SosCubit>().socketService.ensureConnected();
    }
  }

  @override
  Widget build(BuildContext context) {
    final systemNavPadding =
        !kIsWeb && defaultTargetPlatform == TargetPlatform.android
            ? MediaQuery.of(context).viewPadding.bottom
            : 0.0;

    // Use .r so the FAB scales with the shorter axis — .w alone grows too tall
    // on wide web viewports and gets clipped by the nav Stack.
    final fabSize = 64.r;
    final fabBottom = 18.h;
    final navBarHeight = 60.h;
    final navStackHeight =
        (fabBottom + fabSize).clamp(90.h, double.infinity) + systemNavPadding;

    return SafeArea(
      bottom: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        bottomNavigationBar: SizedBox(
          height: navStackHeight,
          child: Stack(
            alignment: Alignment.bottomCenter,
            clipBehavior: Clip.none,
            children: [
              if (systemNavPadding > 0)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: systemNavPadding,
                  child: const ColoredBox(color: Colors.white),
                ),
              Positioned(
                bottom: systemNavPadding,
                left: 0,
                right: 0,
                child: BlocBuilder<HomeCubit, HomeState>(
                  builder: (context, state) {
                    int currentIndex = 0;
                    if (state is ChangeBottomNavIndexHomeState) {
                      currentIndex = state.index;
                    }

                    return Container(
                      height: navBarHeight,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border(
                          top: BorderSide(color: ColorsManager.border),
                        ),
                        boxShadow: [
                          BoxShadow(
                            blurRadius: 8,
                            offset: const Offset(0, -2),
                            color: Colors.black.withValues(alpha: 0.06),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _buildNavItem(
                            AssetsManager.homeSvg,
                            'bottom_nav.home'.tr(),
                            0,
                            currentIndex,
                            context,
                          ),
                          _buildNavItem(
                            AssetsManager.activityNavSvg,
                            'bottom_nav.activity'.tr(),
                            1,
                            currentIndex,
                            context,
                          ),
                          SizedBox(width: fabSize),
                          _buildNavItem(
                            AssetsManager.repairedSvg,
                            'bottom_nav.services'.tr(),
                            2,
                            currentIndex,
                            context,
                          ),
                          _buildNavItem(
                            AssetsManager.settingsSvg,
                            'bottom_nav.settings'.tr(),
                            3,
                            currentIndex,
                            context,
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
              Positioned(
                bottom: fabBottom + systemNavPadding,
                child: GestureDetector(
                  onTap: () {
                    context.read<HomeCubit>().changeBottomNavIndex(0);
                  },
                  child: Container(
                    height: fabSize,
                    width: fabSize,
                    padding: EdgeInsets.all(14.r),
                    decoration: BoxDecoration(
                      color: ColorsManager.mainColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: ColorsManager.mainColor.withValues(alpha: 0.35),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: SvgPicture.asset(
                      AssetsManager.centerNavSvg,
                      width: 24.r,
                      height: 24.r,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        body: BlocBuilder<HomeCubit, HomeState>(
          builder: (context, state) {
            int currentIndex = 0;
            if (state is ChangeBottomNavIndexHomeState) {
              currentIndex = state.index;
            }
            return screens[currentIndex];
          },
        ),
      ),
    );
  }

  Widget _buildNavItem(
    String icon,
    String label,
    int index,
    int selectedIndex,
    BuildContext context,
  ) {
    final isSelected = index == selectedIndex;
    final color =
        isSelected ? ColorsManager.mainColor : ColorsManager.greyColor;

    return GestureDetector(
      onTap: () => context.read<HomeCubit>().changeBottomNavIndex(index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64.w,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SvgPicture.asset(
              icon,
              colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
            ),
            SizedBox(height: 2.h),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyles.font12RegularGrey.copyWith(
                color: color,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
