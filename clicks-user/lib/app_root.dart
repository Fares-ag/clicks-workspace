import 'package:clicks_user/core/sos_services/customer_socket_service.dart';
import 'package:clicks_user/core/sos_services/sos_cubit.dart';
import 'package:clicks_user/features/my_cars/cubit/my_cars_cubit.dart';
import 'package:clicks_user/features/settings/ui/cubit/settings_cubit.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'core/helper/app_context.dart';
import 'core/routing/router.dart';
import 'core/routing/routes.dart';
import 'core/theme/colors_manager.dart';
import 'core/theme/text_styles.dart';

class AppRoot extends StatelessWidget {
  const AppRoot({super.key});

  @override
  Widget build(BuildContext context) {
    return ScreenUtilInit(
      designSize: const Size(375, 812),
      minTextAdapt: true,
      splitScreenMode: true,
      builder:
          (context, child) => MultiBlocProvider(
            providers: [
              BlocProvider(create: (context) => SettingsCubit()),
              BlocProvider(create: (context) => MyCarsCubit()),
              BlocProvider(
                create: (context) => SosCubit(CustomerSocketService()),
              ),
            ],
            child: MaterialApp(
              navigatorKey: AppContext.navigatorKey,
              title: 'Clicks',
              builder: (context, child) {
                return MediaQuery.withClampedTextScaling(
                  minScaleFactor: 1.0,
                  maxScaleFactor: 1.0,
                  child: child!,
                );
              },
              theme: ThemeData(
                fontFamily: 'HelveticaNeue',
                scaffoldBackgroundColor: Colors.white,
                appBarTheme: AppBarTheme(
                  surfaceTintColor: Colors.white,
                  backgroundColor: Colors.white,
                  elevation: 0,
                  iconTheme: IconThemeData(color: Colors.black),
                ),
                dialogTheme: DialogThemeData(
                  backgroundColor: Colors.white,
                  surfaceTintColor: Colors.white,
                  elevation: 0,
                ),
                datePickerTheme: DatePickerThemeData(
                  confirmButtonStyle: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(
                      ColorsManager.whiteColor,
                    ),
                    overlayColor: WidgetStateProperty.all(
                      ColorsManager.mainColor,
                    ),
                    foregroundColor: WidgetStateProperty.all(
                      ColorsManager.mainColor,
                    ),
                    textStyle: WidgetStatePropertyAll(
                      TextStyles.font14Medium.copyWith(
                        color: ColorsManager.mainColor,
                      ),
                    ),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  cancelButtonStyle: ButtonStyle(
                    backgroundColor: WidgetStateProperty.all(
                      ColorsManager.whiteColor,
                    ),
                    overlayColor: WidgetStateProperty.all(
                      ColorsManager.mainColor,
                    ),
                    foregroundColor: WidgetStateProperty.all(
                      ColorsManager.mainColor,
                    ),
                    textStyle: WidgetStatePropertyAll(
                      TextStyles.font14Medium.copyWith(
                        color: ColorsManager.mainColor,
                      ),
                    ),
                    shape: WidgetStateProperty.all(
                      RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  backgroundColor: Colors.white,
                  todayBackgroundColor: WidgetStateProperty.all(
                    ColorsManager.mainColor,
                  ),
                  rangeSelectionBackgroundColor: ColorsManager.mainColor,
                  dayStyle: TextStyles.font14Medium,
                  todayBorder: const BorderSide(
                    color: ColorsManager.mainColor,
                    width: 1,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  dividerColor: ColorsManager.mainColor,
                  dayShape: WidgetStatePropertyAll(
                    RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(50),
                    ),
                  ),
                  dayBackgroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return ColorsManager.mainColor;
                    }
                    return null;
                  }),
                  dayForegroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return Colors.white;
                    }
                    return Colors.black;
                  }),
                ),
                primaryColor: Colors.white,
                canvasColor: ColorsManager.mainColor,
                progressIndicatorTheme: ProgressIndicatorThemeData(
                  color: ColorsManager.mainColor,
                ),
              ),
              debugShowCheckedModeBanner: false,
              localizationsDelegates: context.localizationDelegates,
              supportedLocales: context.supportedLocales,
              locale: context.locale,
              onGenerateRoute: AppRouter.generateRoute,
              initialRoute: (kDebugMode) ? Routes.splash : Routes.splash,
            ),
          ),
    );
  }
}
