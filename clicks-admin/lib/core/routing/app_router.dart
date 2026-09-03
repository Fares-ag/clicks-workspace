import 'package:flutter/material.dart';

import '../../core/auth/admin_roles.dart';
import '../../features/auth/login_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/jobs/job_detail_screen.dart';
import '../../features/jobs/jobs_screen.dart';
import '../../features/jobs/new_job_screen.dart';
import '../../features/leads/add_lead_screen.dart';
import '../../features/leads/convert_lead_screen.dart';
import '../../features/leads/lead_detail_screen.dart';
import '../../features/leads/leads_screen.dart';
import '../../features/live_map/live_map_screen.dart';
import '../../features/main/admin_shell.dart';
import '../../features/phase2/admin_management_screen.dart';
import '../../features/phase2/businesses_screen.dart';
import '../../features/phase2/clients_screen.dart';
import '../../features/phase2/finance_screen.dart';
import '../../features/phase2/finance_users_screen.dart';
import '../../features/phase2/generic_list_screen.dart';
import '../../features/phase2/partners_screen.dart';
import '../../features/phase2/performance_screen.dart';
import '../../features/phase2/sources_screen.dart';
import '../../features/phase2/support_tickets_screen.dart';
import '../../features/phase2/vehicles_screen.dart';
import '../../features/service_requests/service_requests_screen.dart';
import '../../features/sos/sos_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/technicians/technician_detail_screen.dart';
import '../../features/technicians/technicians_screen.dart';
import '../api/end_points.dart';
import '../helper/cache_helper.dart';
import 'routes.dart';

class AppRouter {
  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final name = settings.name ?? Routes.splash;
    final args = settings.arguments;

    switch (name) {
      case Routes.splash:
        return _plain(const SplashScreen(), name);
      case Routes.login:
        return _plain(const LoginScreen(), name);

      case Routes.dashboard:
        return _shell(const DashboardScreen(), name);

      case Routes.sos:
        return _shell(const SosScreen(), name);
      case Routes.serviceRequests:
        return _shell(const ServiceRequestsScreen(), name);
      case Routes.jobs:
        return _shell(const JobsScreen(), name);
      case Routes.leads:
        return _shell(const LeadsScreen(), name);
      case Routes.liveMap:
        return _shell(const LiveMapScreen(), name, showTopBar: false);
      case Routes.technicians:
        return _shell(const TechniciansScreen(), name);
      case Routes.vehicles:
        return _shell(const VehiclesScreen(), name);
      case Routes.clients:
        return _shell(const ClientsScreen(), name);
      case Routes.supportTickets:
        return _shell(const SupportTicketsScreen(), name);
      case Routes.businesses:
        return _shell(const BusinessesScreen(), name);
      case Routes.partners:
        return _shell(const PartnersScreen(), name);
      case Routes.finance:
        return _shell(const FinanceScreen(), name);
      case Routes.financeUsers:
        return _shell(const FinanceUsersScreen(), name);
      case Routes.adminManagement:
        return _shell(const AdminManagementScreen(), name);
      case Routes.performance:
        return _shell(const PerformanceScreen(), name);
      case Routes.sources:
        return _shell(const SourcesScreen(), name);
      case Routes.heatMap:
        return _shell(
          const GenericListScreen(
            title: 'Heat Map',
            endpoint: '${EndPoints.jobs}/heatmap',
            moduleId: 'heat-map',
          ),
          name,
        );
      case Routes.vehicleMakes:
        return _shell(
          const GenericListScreen(
            title: 'Vehicle Makes',
            endpoint: EndPoints.vehicleMakes,
            moduleId: 'vehicle-makes',
          ),
          name,
        );

      case Routes.jobNew:
        final sosData = args is Map<String, dynamic> ? args : null;
        final srData = args is Map && args['serviceRequestData'] != null
            ? Map<String, dynamic>.from(args['serviceRequestData'] as Map)
            : null;
        return _shell(
          NewJobScreen(sosData: sosData, serviceRequestData: srData ?? (args is Map && args.containsKey('service_request_id') ? Map<String, dynamic>.from(args) : null)),
          name,
          showTopBar: false,
        );

      case Routes.leadNew:
        return _shell(
          AddLeadScreen(
            serviceRequestData:
                args is Map<String, dynamic> ? args : null,
          ),
          name,
          showTopBar: false,
        );

      // Legacy detail routes
      case Routes.jobDetail:
        final id = args?.toString() ?? '';
        return _shell(JobDetailScreen(jobId: id), Routes.jobDetailPath(id));
      case Routes.leadDetail:
        final id = args?.toString() ?? '';
        return _shell(LeadDetailScreen(leadId: id), Routes.leadDetailPath(id));
      case Routes.leadConvert:
        final id = args?.toString() ?? '';
        return _shell(
          ConvertLeadScreen(leadId: id),
          Routes.leadConvertPath(id),
          showTopBar: false,
        );
      case Routes.technicianDetail:
        final id = args?.toString() ?? '';
        return _shell(
          TechnicianDetailScreen(technicianId: id),
          Routes.technicianDetailPath(id),
        );

      default:
        return _routeFromPath(name, args);
    }
  }

  static Route<dynamic> _routeFromPath(String path, Object? args) {
    if (path.startsWith('/jobs/new')) {
      return onGenerateRoute(RouteSettings(name: Routes.jobNew, arguments: args));
    }
    if (path.startsWith('/leads/new')) {
      return onGenerateRoute(RouteSettings(name: Routes.leadNew, arguments: args));
    }
    final jobMatch = RegExp(r'^/jobs/([^/]+)$').firstMatch(path);
    if (jobMatch != null) {
      final id = jobMatch.group(1)!;
      return _shell(JobDetailScreen(jobId: id), path);
    }
    final leadConvertMatch = RegExp(r'^/leads/([^/]+)/convert$').firstMatch(path);
    if (leadConvertMatch != null) {
      final id = leadConvertMatch.group(1)!;
      return _shell(ConvertLeadScreen(leadId: id), path, showTopBar: false);
    }
    final leadMatch = RegExp(r'^/leads/([^/]+)$').firstMatch(path);
    if (leadMatch != null) {
      final id = leadMatch.group(1)!;
      return _shell(LeadDetailScreen(leadId: id), path);
    }
    final techMatch = RegExp(r'^/technicians/([^/]+)$').firstMatch(path);
    if (techMatch != null) {
      final id = techMatch.group(1)!;
      return _shell(TechnicianDetailScreen(technicianId: id), path);
    }

    // RBAC guard for unknown paths
    if (path.startsWith('/') && path != Routes.splash) {
      final role = CacheHelper.getUserProfileSync()?['role']?.toString();
      if (!AdminRoles.canAccessPath(role, path)) {
        return _shell(
          const Center(child: Text('You do not have access to this module.')),
          Routes.dashboard,
        );
      }
    }

    return _plain(const SplashScreen(), Routes.splash);
  }

  static MaterialPageRoute<dynamic> _plain(Widget child, String name) {
    return MaterialPageRoute(
      settings: RouteSettings(name: name),
      builder: (_) => child,
    );
  }

  static MaterialPageRoute<dynamic> _shell(
    Widget child,
    String path, {
    bool showTopBar = true,
    List<Widget>? topBarActions,
  }) {
    final role = CacheHelper.getUserProfileSync()?['role']?.toString();
    if (!AdminRoles.canAccessPath(role, _modulePath(path))) {
      return MaterialPageRoute(
        settings: RouteSettings(name: path),
        builder: (_) => AdminShell(
          currentPath: Routes.dashboard,
          child: const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('You do not have access to this module.'),
            ),
          ),
        ),
      );
    }

    return MaterialPageRoute(
      settings: RouteSettings(name: path),
      builder: (_) => AdminShell(
        currentPath: path,
        showTopBar: showTopBar,
        topBarActions: topBarActions,
        child: child,
      ),
    );
  }

  static String _modulePath(String path) {
    if (path.startsWith('/jobs')) return '/jobs';
    if (path.startsWith('/leads')) return '/leads';
    if (path.startsWith('/technicians')) return '/technicians';
    return path;
  }
}
