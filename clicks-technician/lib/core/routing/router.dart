import 'package:clicks_technician/features/auth/forget_password/ui/cubit/forget_password_cubit.dart';
import 'package:clicks_technician/features/auth/forget_password/ui/view/forget_password_screen.dart';
import 'package:clicks_technician/features/auth/login/ui/cubit/login_cubit.dart';
import 'package:clicks_technician/features/auth/login/ui/view/login_screen.dart';
import 'package:clicks_technician/features/auth/register/ui/cubit/register_cubit.dart';
import 'package:clicks_technician/features/auth/register/ui/view/register_screen.dart';
import 'package:clicks_technician/features/auth/register/ui/view/register_submitted_screen.dart';
import 'package:clicks_technician/features/home/ui/cubit/home_cubit.dart';
import 'package:clicks_technician/features/main/ui/view/main_shell.dart';
import 'package:clicks_technician/features/settings/ui/view/content_screens.dart';
import 'package:clicks_technician/features/status/ui/cubit/status_cubit.dart';
import 'package:clicks_technician/features/status/ui/view/status_screen.dart';
import 'package:clicks_technician/features/welcome/ui/cubit/welcome_cubit.dart';
import 'package:clicks_technician/features/welcome/ui/welcome_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:responsive_builder/responsive_builder.dart';
import '../../features/splash/splash_screen.dart';
import '../di/di.dart';
import '../theme/text_styles.dart';
import 'routes.dart';

/// A class that handles the routing for the application.
class AppRouter {
  /// Generates a route based on the given [RouteSettings].
  static Route<dynamic> generateRoute(RouteSettings settings) {
    Widget getScreen(Widget mobileScreen) {
      return ScreenTypeLayout.builder(
        mobile: (context) => mobileScreen,
        tablet: (context) => mobileScreen,
        desktop: (context) => mobileScreen,
        watch: (context) => NotSupportedScreen(),
      );
    }

    switch (settings.name) {
      case Routes.splash:
        return MaterialPageRoute(builder: (_) => getScreen(SplashScreen()));
      case Routes.welcome:
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => getIt<WelcomeCubit>(),
                child: getScreen(WelcomeScreen()),
              ),
        );
      case Routes.login:
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => getIt<LoginCubit>(),
                child: getScreen(LoginScreen()),
              ),
        );
      case Routes.register:
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => getIt<RegisterCubit>(),
                child: getScreen(RegisterScreen()),
              ),
        );
      case Routes.forgetPassword:
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => getIt<ForgetPasswordCubit>(),
                child: getScreen(ForgetPasswordScreen()),
              ),
        );
      case Routes.status:
        final initialStatus =
            settings.arguments is StatusType
                ? settings.arguments as StatusType
                : StatusType.pending;
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => StatusCubit(initialStatus: initialStatus),
                child: getScreen(StatusScreen()),
              ),
        );
      case Routes.home:
        return MaterialPageRoute(
          builder:
              (_) => BlocProvider(
                create: (context) => getIt<HomeCubit>(),
                child: getScreen(const MainShell()),
              ),
        );
      case Routes.registerSuccess:
        return MaterialPageRoute(
          builder: (_) => getScreen(RegisterSubmittedScreen()),
        );
      case Routes.faqs:
        return MaterialPageRoute(
          builder: (_) =>
              getScreen(const ContentPageScreen(type: ContentPageType.faqs)),
        );
      case Routes.privacyPolicy:
        return MaterialPageRoute(
          builder: (_) => getScreen(
              const ContentPageScreen(type: ContentPageType.privacy)),
        );
      case Routes.termsConditions:
        return MaterialPageRoute(
          builder: (_) =>
              getScreen(const ContentPageScreen(type: ContentPageType.terms)),
        );
      // case Routes.forgetPassword:
      //   return MaterialPageRoute(
      //     builder:
      //         (_) => BlocProvider(
      //           create: (_) => getIt<ForgetPasswordCubit>(),
      //           child: getScreen(ForgetPasswordScreen()),
      //         ),
      //   );
      // case Routes.bookingDetails:
      //   return MaterialPageRoute(
      //     builder:
      //         (_) => getScreen(
      //           BookingDetailsScreen(status: settings.arguments as TicketType),
      //         ),
      //   );
      default:
        return MaterialPageRoute(
          builder:
              (_) => Scaffold(
                body: Center(
                  child: Text(
                    'This screen is currently under development',
                    textAlign: TextAlign.center,
                    style: TextStyles.font16RegularBlack,
                  ),
                ),
              ),
        );
    }
  }
}

class NotSupportedScreen extends StatelessWidget {
  const NotSupportedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Text(
          "This Device Is Not Supported",
          style: TextStyles.font28Bold,
        ),
      ),
    );
  }
}
