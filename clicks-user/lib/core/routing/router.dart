import 'package:clicks_user/features/activity/activity_details_screen.dart';
import 'package:clicks_user/features/activity/activity_screen.dart';
import 'package:clicks_user/features/home/in_call_screen.dart';
import 'package:clicks_user/features/home/timer_sos_screen.dart';
import 'package:clicks_user/features/home/technician_tracking_screen.dart';
import 'package:clicks_user/features/my_cars/my_cars_screen.dart';
import 'package:clicks_user/features/services/service_waiting_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:responsive_builder/responsive_builder.dart';
import '../../features/activity/cubit/activity_cubit.dart';
import '../../features/activity/models/activity_repos.dart';
import '../../features/activity/models/job_history_response.dart';
import '../../features/auth/forget_password/ui/cubit/forget_password_cubit.dart';
import '../../features/auth/forget_password/ui/view/forget_password_screen.dart';
import '../../features/auth/login/ui/cubit/login_cubit.dart';
import '../../features/auth/login/ui/view/login_screen.dart';
import '../../features/auth/register/ui/cubit/register_cubit.dart';
import '../../features/auth/register/ui/view/register_screen.dart';
import '../../features/auth/register/ui/view/register_submitted_screen.dart';
import '../../features/home/job_in_progress_screen.dart';
import '../../features/home/payment_hold_screen.dart';
import '../../features/home/skipcash_checkout_screen.dart';
import '../../features/membership/membership_hub_screen.dart';
import '../../features/membership/membership_plans_screen.dart';
import '../../features/membership/membership_review_screen.dart';
import '../../features/language/change_language_screen.dart';
import '../../features/main/ui/cubit/home_cubit.dart';
import '../../features/main/ui/view/main_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/settings/ui/view/contact_us_success_screen.dart';
import '../../features/settings/ui/view/my_requests_screen.dart';
import '../../features/settings/ui/view/settings_screen.dart';
import '../../features/splash/account_inactive_screen.dart';
import '../../features/splash/force_update_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/welcome/ui/welcome_screen.dart';
import '../theme/text_styles.dart';
import 'app_page_route.dart';
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

    Route<dynamic> page(Widget screen) {
      return AppPageRoute(settings: settings, page: getScreen(screen));
    }

    switch (settings.name) {
      case Routes.splash:
        return page(SplashScreen());
      case Routes.welcome:
        return page(WelcomeScreen());
      case Routes.login:
        return page(
          BlocProvider(
            create: (context) => LoginCubit(),
            child: LoginScreen(),
          ),
        );
      case Routes.register:
        return page(
          BlocProvider(
            create: (context) => RegisterCubit(),
            child: RegisterScreen(),
          ),
        );
      case Routes.forgetPassword:
        return page(
          BlocProvider(
            create: (context) => ForgetPasswordCubit(),
            child: ForgetPasswordScreen(),
          ),
        );

      case Routes.home:
        return page(
          BlocProvider(
            create: (context) => HomeCubit(),
            child: const MainScreen(),
          ),
        );
      case Routes.changeLanguage:
        return page(ChangeLanguageScreen());
      case Routes.settings:
        return page(SettingsScreen());
      case Routes.myCars:
        return page(MyCarsScreen());
      case Routes.activity:
        return page(
          BlocProvider(
            create: (_) => ActivityCubit(ActivityRepository())..loadHistory(),
            child: const ActivityScreen(),
          ),
        );

      case Routes.registerSuccess:
        return page(RegisterSubmittedScreen());
      case Routes.notifications:
        return page(NotificationsScreen());
      case Routes.timerSos:
        final args = settings.arguments;
        final isEmergency =
            args is Map ? args['isEmergency'] as bool? ?? true : true;
        final serviceType =
            args is Map ? args['serviceType'] as String? : null;
        final serviceLabel =
            args is Map ? args['serviceLabel'] as String? : null;
        return page(
          TimerSosScreen(
            isEmergency: isEmergency,
            serviceType: serviceType,
            serviceLabel: serviceLabel,
          ),
        );
      case Routes.serviceWaiting:
        final args = settings.arguments as ServiceWaitingArgs;
        return page(ServiceWaitingScreen(args: args));
      case Routes.activityDetails:
        final job = settings.arguments as JobDto;
        return page(ActivityDetailsPage(job: job));
      case Routes.contactUsSuccess:
        final ticket = settings.arguments;
        return page(ContactUsSuccessScreen(
          ticketNumber: ticket is String ? ticket : null,
        ));
      case Routes.myRequests:
        return page(const MyRequestsScreen());
      case Routes.forceUpdate:
        return page(const ForceUpdateScreen());
      case Routes.accountInactive:
        return page(const AccountInactiveScreen());
      case Routes.inCall:
        return page(InCallWithDispatcherScreen());
      case Routes.jobInProgress:
        final args = settings.arguments as JobProgressArgs;
        return page(JobInProgressScreen(args: args));
      case Routes.technicianTracking:
        final args = settings.arguments as TrackingArgs;
        return page(TechnicianTrackingScreen(args: args));
      case Routes.paymentHold:
        final args = settings.arguments as PaymentHoldArgs;
        return page(PaymentHoldScreen(args: args));
      case Routes.skipcashCheckout:
        final args = settings.arguments as SkipcashCheckoutArgs;
        return page(SkipcashCheckoutScreen(args: args));
      case Routes.membershipHub:
        return page(const MembershipHubScreen());
      case Routes.membershipPlans:
        return page(const MembershipPlansScreen());
      case Routes.membershipReview:
        final raw = settings.arguments;
        final map = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
        return page(
          MembershipReviewScreen(
            args: MembershipReviewArgs(
              planId: map['planId']?.toString() ?? '',
              interval: map['interval']?.toString() ?? 'month',
            ),
          ),
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
      case '/':
        // Flutter pushes '/' implicitly when initialRoute != '/'. Route to splash.
        return page(SplashScreen());
      default:
        // Unknown route — pop back silently instead of showing an error screen.
        return AppPageRoute(
          settings: settings,
          page: getScreen(const _PopImmediately()),
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

/// Used as the route builder for unknown routes. Pops itself immediately so
/// the user never sees a "screen", effectively a no-op navigation.
class _PopImmediately extends StatefulWidget {
  const _PopImmediately();

  @override
  State<_PopImmediately> createState() => _PopImmediatelyState();
}

class _PopImmediatelyState extends State<_PopImmediately> {
  @override
  void initState() {
    super.initState();
    // Schedule pop after the first frame so the route is fully mounted
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
