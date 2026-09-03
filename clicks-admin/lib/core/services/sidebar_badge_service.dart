import 'dart:async';

import '../api/dio_helper.dart';
import '../api/end_points.dart';

/// Polls sidebar badge counts — same intervals as web AdminSidebar.
class SidebarBadgeService {
  SidebarBadgeService._();
  static final SidebarBadgeService instance = SidebarBadgeService._();

  int sosCount = 0;
  int serviceCount = 0;
  int leadsCount = 0;

  void Function()? onChanged;
  Timer? _sosTimer;
  Timer? _serviceTimer;
  Timer? _leadsTimer;

  void start() {
    stop();
    _refreshSos();
    _refreshService();
    _refreshLeads();
    _sosTimer = Timer.periodic(const Duration(seconds: 15), (_) => _refreshSos());
    _serviceTimer =
        Timer.periodic(const Duration(seconds: 15), (_) => _refreshService());
    _leadsTimer =
        Timer.periodic(const Duration(seconds: 30), (_) => _refreshLeads());
  }

  void stop() {
    _sosTimer?.cancel();
    _serviceTimer?.cancel();
    _leadsTimer?.cancel();
    _sosTimer = null;
    _serviceTimer = null;
    _leadsTimer = null;
  }

  void refreshAll() {
    _refreshSos();
    _refreshService();
    _refreshLeads();
  }

  Future<void> _refreshSos() async {
    try {
      final pending = await _count('${EndPoints.sos}?page=1&limit=1&status=pending');
      final inCall =
          await _count('${EndPoints.sos}?page=1&limit=1&status=in_call');
      final total = pending + inCall;
      if (total != sosCount) {
        sosCount = total;
        onChanged?.call();
      }
    } catch (_) {}
  }

  Future<void> _refreshService() async {
    try {
      final pending = await _count(
        '${EndPoints.serviceRequests}?page=1&limit=1&status=pending',
      );
      if (pending != serviceCount) {
        serviceCount = pending;
        onChanged?.call();
      }
    } catch (_) {}
  }

  Future<void> _refreshLeads() async {
    try {
      final res = await DioHelper.getData(
        url: '${EndPoints.leads}?page=1&limit=1&open=true',
      );
      if (res.statusCode == 200 && res.data is Map) {
        final data = res.data as Map;
        final count = (data['openCount'] as num?)?.toInt() ??
            (data['pagination'] is Map
                ? ((data['pagination'] as Map)['total'] as num?)?.toInt()
                : null) ??
            0;
        if (count != leadsCount) {
          leadsCount = count;
          onChanged?.call();
        }
      }
    } catch (_) {}
  }

  Future<int> _count(String url) async {
    final res = await DioHelper.getData(url: url);
    if (res.statusCode != 200 || res.data is! Map) return 0;
    final data = res.data as Map;
    final pagination = data['pagination'];
    if (pagination is Map) {
      return (pagination['total'] as num?)?.toInt() ?? 0;
    }
    return 0;
  }

  int badgeFor(String? badgeKey) {
    switch (badgeKey) {
      case 'sos':
        return sosCount;
      case 'service':
        return serviceCount;
      case 'leads':
        return leadsCount;
      default:
        return 0;
    }
  }
}
