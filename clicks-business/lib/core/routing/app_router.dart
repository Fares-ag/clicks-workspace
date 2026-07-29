import 'package:flutter/material.dart';

import '../../features/auth/login_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/jobs/job_detail_screen.dart';
import '../../features/jobs/new_job_screen.dart';
import '../../features/splash/splash_screen.dart';
import 'routes.dart';

class AppRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case Routes.splash:
        return MaterialPageRoute(builder: (_) => const SplashScreen());
      case Routes.login:
        return MaterialPageRoute(builder: (_) => const LoginScreen());
      case Routes.home:
        return MaterialPageRoute(builder: (_) => const HomeScreen());
      case Routes.newJob:
        return MaterialPageRoute(builder: (_) => const NewJobScreen());
      case Routes.jobDetail:
        final id = settings.arguments?.toString() ?? '';
        return MaterialPageRoute(
          builder: (_) => JobDetailScreen(jobId: id),
        );
      default:
        return MaterialPageRoute(builder: (_) => const SplashScreen());
    }
  }
}
