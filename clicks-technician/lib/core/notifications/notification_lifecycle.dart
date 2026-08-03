import 'package:flutter/widgets.dart';

import 'job_notification_service.dart';

/// Tracks app foreground/background at the root so FCM knows when to show
/// heads-up notifications (MainShell alone is too late / not always mounted).
class NotificationLifecycleObserver extends StatefulWidget {
  const NotificationLifecycleObserver({super.key, required this.child});

  final Widget child;

  @override
  State<NotificationLifecycleObserver> createState() =>
      _NotificationLifecycleObserverState();
}

class _NotificationLifecycleObserverState extends State<NotificationLifecycleObserver>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    JobNotificationService.instance.setForeground(true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    JobNotificationService.instance.setForeground(
      state == AppLifecycleState.resumed,
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
