class Routes {
  static const splash = '/';
  static const login = '/login';

  // Ops — web-aligned paths
  static const dashboard = '/dashboard';
  static const sos = '/sos';
  static const serviceRequests = '/service-requests';
  static const jobs = '/jobs';
  static const jobNew = '/jobs/new';
  static const leads = '/leads';
  static const leadNew = '/leads/new';
  static const liveMap = '/live-map';
  static const technicians = '/technicians';
  static const vehicles = '/vehicles';
  static const clients = '/clients';
  static const supportTickets = '/support-tickets';

  // Phase 2 / full admin
  static const businesses = '/businesses';
  static const partners = '/partners';
  static const finance = '/finance';
  static const financeUsers = '/finance-users';
  static const adminManagement = '/admin-management';
  static const performance = '/performance';
  static const sources = '/sources';
  static const heatMap = '/heat-map';
  static const vehicleMakes = '/vehicle-makes';

  /// Legacy alias — redirects to dashboard.
  static const home = dashboard;

  static String jobDetailPath(String id) => '/jobs/$id';
  static String leadDetailPath(String id) => '/leads/$id';
  static String leadConvertPath(String id) => '/leads/$id/convert';
  static String technicianDetailPath(String id) => '/technicians/$id';

  // Legacy named routes (still used in some pushNamed calls)
  static const jobDetail = '/jobs/detail';
  static const leadDetail = '/leads/detail';
  static const leadConvert = '/leads/convert';
  static const technicianDetail = '/technicians/detail';
}
