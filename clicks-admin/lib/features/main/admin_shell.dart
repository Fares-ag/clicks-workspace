import 'package:flutter/material.dart';

import '../../core/helper/cache_helper.dart';
import '../../core/notifications/admin_notification_service.dart';
import '../../core/routing/routes.dart';
import '../../core/services/sidebar_badge_service.dart';
import '../../core/socket/admin_socket_service.dart';
import '../../core/theme/app_colors.dart';
import 'admin_sidebar.dart';
import 'admin_topbar.dart';
import 'dispatch_notification_overlay.dart';

/// Web-style admin layout — mirrors AdminLayout.jsx.
class AdminShell extends StatefulWidget {
  const AdminShell({
    super.key,
    required this.currentPath,
    required this.child,
    this.topBarActions,
    this.showTopBar = true,
  });

  final String currentPath;
  final Widget child;
  final List<Widget>? topBarActions;
  final bool showTopBar;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> with WidgetsBindingObserver {
  static const _sidebarBreakpoint = 900.0;

  bool _sidebarOpen = false;
  int _badgeTick = 0;
  int _refreshTick = 0;
  final List<AdminSocketEvent> _notificationQueue = [];

  Map<String, dynamic>? get _user => CacheHelper.getUserProfileSync();
  String? get _role => _user?['role']?.toString();
  String get _adminId => _user?['id']?.toString() ?? '';
  String get _userName {
    final u = _user;
    if (u == null) return '';
    final name = '${u['firstName'] ?? ''} ${u['lastName'] ?? ''}'.trim();
    return name.isNotEmpty ? name : (u['email']?.toString() ?? '');
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SidebarBadgeService.instance.onChanged = () {
      if (mounted) setState(() => _badgeTick++);
    };
    SidebarBadgeService.instance.start();
    _wireSocket();
    AdminNotificationService.instance.onDispatchOpened = (data) {
      _handleDispatchDeepLink(data['type']?.toString() ?? '');
    };
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    SidebarBadgeService.instance.stop();
    SidebarBadgeService.instance.onChanged = null;
    AdminSocketService.instance.disconnect();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    AdminNotificationService.instance.setForeground(
      state == AppLifecycleState.resumed,
    );
    if (state == AppLifecycleState.resumed) {
      SidebarBadgeService.instance.refreshAll();
    }
  }

  void _wireSocket() {
    final socket = AdminSocketService.instance;
    socket.onNotification = (event) {
      setState(() {
        if (event.id.isNotEmpty &&
            _notificationQueue.any((e) => e.id == event.id && e.type == event.type)) {
          return;
        }
        _notificationQueue.add(event);
      });
      if (!AdminNotificationService.instance.isForeground) {
        AdminNotificationService.instance.showLocal(
          title: _titleFor(event.type),
          body: _bodyFor(event),
          payload: event.type.name,
        );
      }
    };
    socket.onSosInvalidated = _invalidate;
    socket.onServiceRequestInvalidated = _invalidate;
    socket.onLeadInvalidated = _invalidate;
    socket.onJobInvalidated = _invalidate;
    socket.onInfo = (msg) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    };
    socket.onError = (msg) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppColors.danger),
      );
    };
    if (_adminId.isNotEmpty) {
      socket.connect(adminId: _adminId);
    }
  }

  void _invalidate() {
    SidebarBadgeService.instance.refreshAll();
    setState(() => _refreshTick++);
  }

  String _titleFor(AdminNotificationType type) {
    switch (type) {
      case AdminNotificationType.sos:
        return 'New SOS request';
      case AdminNotificationType.serviceRequest:
        return 'New service request';
      case AdminNotificationType.businessLead:
        return 'New business lead';
      case AdminNotificationType.businessJob:
        return 'New business job';
      case AdminNotificationType.technicianJob:
        return 'New technician job';
    }
  }

  String _bodyFor(AdminSocketEvent event) {
    final data = event.data;
    final customer = data['customer'];
    if (customer is Map) {
      final name =
          '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim();
      if (name.isNotEmpty) return name;
    }
    return 'Tap to review';
  }

  void _dequeueNotification() {
    if (_notificationQueue.isEmpty) return;
    setState(() => _notificationQueue.removeAt(0));
  }

  void _handleDispatchDeepLink(String payload) {
    if (payload.contains('sos')) {
      _navigate('/sos');
    } else if (payload.contains('service')) {
      _navigate('/service-requests');
    }
  }

  Future<void> _logout() async {
    await AdminNotificationService.instance.clearToken();
    AdminSocketService.instance.disconnect();
    await CacheHelper.clear();
    if (!mounted) return;
    Navigator.of(context).pushNamedAndRemoveUntil(Routes.login, (_) => false);
  }

  void _navigate(String path) {
    setState(() => _sidebarOpen = false);
    if (widget.currentPath == path) return;
    Navigator.of(context).pushReplacementNamed(path);
  }

  void _handleNotificationAction(AdminSocketEvent event) {
    switch (event.type) {
      case AdminNotificationType.sos:
        final sosId = event.data['sos_id']?.toString() ?? event.id;
        final customerId = event.data['customer_id']?.toString() ?? '';
        AdminSocketService.instance.emitSosAccepted(
          sosId: sosId,
          customerId: customerId,
        );
        Navigator.of(context).pushNamed(Routes.jobNew, arguments: event.data);
        break;
      case AdminNotificationType.serviceRequest:
        Navigator.of(context).pushNamed(
          Routes.leadNew,
          arguments: event.data,
        );
        break;
      case AdminNotificationType.businessLead:
        final leadId = event.data['lead_id']?.toString();
        if (leadId != null && leadId.isNotEmpty) {
          Navigator.of(context).pushNamed(
            Routes.leadConvertPath(leadId),
          );
        } else {
          _navigate('/leads');
        }
        break;
      case AdminNotificationType.businessJob:
      case AdminNotificationType.technicianJob:
        final jobId = event.data['job_id']?.toString();
        if (jobId != null && jobId.isNotEmpty) {
          Navigator.of(context).pushNamed(Routes.jobDetailPath(jobId));
        } else {
          _navigate('/jobs');
        }
        break;
    }
    _dequeueNotification();
  }

  @override
  Widget build(BuildContext context) {
    // ignore: unused_local_variable
    final _ = _badgeTick;
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= _sidebarBreakpoint;

    final content = _ShellRefreshScope(
      refreshTick: _refreshTick,
      child: widget.child,
    );

    return Scaffold(
      backgroundColor: AppColors.pageBackground,
      body: Stack(
        children: [
          Row(
            children: [
              if (wide)
                AdminSidebar(
                  currentPath: widget.currentPath,
                  role: _role,
                  onNavigate: _navigate,
                  onLogout: _logout,
                ),
              Expanded(
                child: Column(
                  children: [
                    if (widget.showTopBar)
                      AdminTopBar(
                        currentPath: widget.currentPath,
                        role: _role,
                        userName: _userName,
                        onMenuTap: wide ? null : () => setState(() => _sidebarOpen = true),
                        actions: widget.topBarActions,
                      ),
                    Expanded(child: content),
                  ],
                ),
              ),
            ],
          ),
          if (!wide && _sidebarOpen) ...[
            GestureDetector(
              onTap: () => setState(() => _sidebarOpen = false),
              child: Container(color: const Color(0x73101828)),
            ),
            AdminSidebar(
              currentPath: widget.currentPath,
              role: _role,
              isDrawer: true,
              onNavigate: _navigate,
              onLogout: _logout,
            ),
          ],
          if (_notificationQueue.isNotEmpty)
            DispatchNotificationOverlay(
              event: _notificationQueue.first,
              queueCount: _notificationQueue.length,
              onDismiss: _dequeueNotification,
              onAction: () => _handleNotificationAction(_notificationQueue.first),
            ),
        ],
      ),
    );
  }
}

/// Passes socket refresh tick to list screens via InheritedWidget.
class _ShellRefreshScope extends InheritedWidget {
  const _ShellRefreshScope({
    required this.refreshTick,
    required super.child,
  });

  final int refreshTick;

  static int of(BuildContext context) {
    return context
            .dependOnInheritedWidgetOfExactType<_ShellRefreshScope>()
            ?.refreshTick ??
        0;
  }

  @override
  bool updateShouldNotify(_ShellRefreshScope oldWidget) =>
      oldWidget.refreshTick != refreshTick;
}

int adminShellRefreshTick(BuildContext context) => _ShellRefreshScope.of(context);
