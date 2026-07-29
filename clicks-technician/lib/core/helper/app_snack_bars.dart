import 'package:flutter/material.dart';
import 'app_context.dart';

enum SnackBarType { success, error, warning, info }

class SnackBarMessage {
  final String message;
  final SnackBarType type;
  final Duration? duration;

  SnackBarMessage({
    required this.message,
    required this.type,
    this.duration,
  });

  // Override equality operator to compare snack bar messages
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
          other is SnackBarMessage &&
              message == other.message &&
              type == other.type;

  @override
  int get hashCode => message.hashCode ^ type.hashCode;
}

class AppSnackBars {
  static const _defaultDuration = Duration(seconds: 3);
  static bool _isSnackBarShowing = false;
  // List to store queued snack bars
  static final List<SnackBarMessage> _snackBarQueue = [];

  /// Displays a success snack bar with customizable options
  static void successSnackBar(
      String message, {
        Duration duration = _defaultDuration,
        String? actionLabel,
        VoidCallback? onAction,
      }) {
    _queueSnackBar(
      SnackBarMessage(message: message, type: SnackBarType.success),
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  /// Displays an error snack bar with customizable options
  static void errorSnackBar(
      String message, {
        Duration duration = _defaultDuration,
        String? actionLabel,
        VoidCallback? onAction,
      }) {
    _queueSnackBar(
      SnackBarMessage(message: message, type: SnackBarType.error),
      duration: duration,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }

  static void _queueSnackBar(
      SnackBarMessage snackBarMessage, {
        required Duration duration,
        String? actionLabel,
        VoidCallback? onAction,
      }) {
    if (AppContext.context == null) return;

    // Check if this snack bar is different from what's currently showing or in queue
    if (!_snackBarQueue.contains(snackBarMessage) &&
        (_isSnackBarShowing == false ||
            _snackBarQueue.isEmpty ||
            _snackBarQueue.last != snackBarMessage)) {
      _snackBarQueue.add(snackBarMessage);
    }

    // If no snack bar is showing, show the first one
    if (!_isSnackBarShowing) {
      _showNextSnackBar(duration: duration, actionLabel: actionLabel, onAction: onAction);
    }
  }

  static void _showNextSnackBar({
    required Duration duration,
    String? actionLabel,
    VoidCallback? onAction,
  }) {
    if (_snackBarQueue.isEmpty || AppContext.context == null) {
      _isSnackBarShowing = false;
      return;
    }

    _isSnackBarShowing = true;
    final snackBarMessage = _snackBarQueue.removeAt(0);

    final snackBar = SnackBar(
      content: Text(snackBarMessage.message),
      backgroundColor: _getBackgroundColor(snackBarMessage.type),
      duration: snackBarMessage.duration ?? duration,
      action: actionLabel != null && onAction != null
          ? SnackBarAction(
        label: actionLabel,
        textColor: Colors.white,
        onPressed: onAction,
      )
          : null,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
      ),
    );

    ScaffoldMessenger.of(AppContext.context!)
        .showSnackBar(snackBar)
        .closed
        .then((reason) {
      _isSnackBarShowing = false;
      // Show next snack bar if any
      _showNextSnackBar(duration: duration, actionLabel: actionLabel, onAction: onAction);
    });
  }

  static Color _getBackgroundColor(SnackBarType type) {
    switch (type) {
      case SnackBarType.success:
        return Colors.green;
      case SnackBarType.error:
        return Colors.red;
      case SnackBarType.warning:
        return Colors.orange;
      case SnackBarType.info:
        return Colors.blue;
    }
  }

  /// Clears any active snack bar and the queue
  static void clear() {
    if (AppContext.context != null) {
      ScaffoldMessenger.of(AppContext.context!).clearSnackBars();
      _snackBarQueue.clear();
      _isSnackBarShowing = false;
    }
  }
}