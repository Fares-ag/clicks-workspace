import 'dart:async';

import 'package:sentry_flutter/sentry_flutter.dart';

import '../config/app_config.dart';

/// DSN-gated Sentry setup — complete no-op when [AppConfig.sentryDsn] is empty.
class SentryConfig {
  SentryConfig._();

  static bool get isEnabled => AppConfig.isSentryEnabled;

  static Future<void> initIfEnabled() async {
    if (!isEnabled) return;
    await SentryFlutter.init((options) => configure(options));
  }

  static void configure(SentryFlutterOptions options) {
    options.dsn = AppConfig.sentryDsn;
    options.environment = AppConfig.env;
    options.release = AppConfig.sentryRelease;
    options.tracesSampleRate = 0;
    options.profilesSampleRate = 0;
    options.sendDefaultPii = false;
    options.beforeSend = _beforeSend;
    options.beforeBreadcrumb = _beforeBreadcrumb;
  }

  static void captureException(
    Object exception, {
    StackTrace? stackTrace,
    Map<String, String>? tags,
  }) {
    if (!isEnabled) return;
    Sentry.captureException(
      exception,
      stackTrace: stackTrace,
      withScope: (scope) {
        tags?.forEach(scope.setTag);
      },
    );
  }

  static FutureOr<SentryEvent?> _beforeSend(SentryEvent event, Hint hint) {
    return _scrubEvent(event);
  }

  static Breadcrumb? _beforeBreadcrumb(Breadcrumb? breadcrumb, Hint hint) {
    if (breadcrumb == null) return null;
    final message = breadcrumb.message;
    if (message == null) return breadcrumb;
    return breadcrumb.copyWith(message: _scrubString(message));
  }

  static SentryEvent _scrubEvent(SentryEvent event) {
    var scrubbed = event;
    final formatted = event.message?.formatted;
    if (formatted != null) {
      scrubbed = scrubbed.copyWith(
        message: SentryMessage(formatted: _scrubString(formatted)),
      );
    }
    final exceptions = event.exceptions;
    if (exceptions != null && exceptions.isNotEmpty) {
      scrubbed = scrubbed.copyWith(
        exceptions: exceptions
            .map(
              (ex) => ex.value == null
                  ? ex
                  : ex.copyWith(value: _scrubString(ex.value!)),
            )
            .toList(),
      );
    }
    final breadcrumbs = event.breadcrumbs;
    if (breadcrumbs != null && breadcrumbs.isNotEmpty) {
      scrubbed = scrubbed.copyWith(
        breadcrumbs: breadcrumbs
            .map(
              (b) => b.message == null
                  ? b
                  : b.copyWith(message: _scrubString(b.message!)),
            )
            .toList(),
      );
    }
    return scrubbed;
  }

  static String _scrubString(String input) {
    var s = input;
    s = s.replaceAll(
      RegExp(r'Bearer\s+\S+', caseSensitive: false),
      'Bearer [REDACTED]',
    );
    s = s.replaceAll(
      RegExp(r'("token"\s*:\s*")[^"]*"', caseSensitive: false),
      r'$1[REDACTED]"',
    );
    s = s.replaceAll(
      RegExp(r"('token'\s*:\s*')[^']*'", caseSensitive: false),
      r"$1[REDACTED]'",
    );
    s = s.replaceAll(RegExp(r'\+974\d{8}'), '[PHONE_REDACTED]');
    s = s.replaceAll(
      RegExp(
        r'"(latitude|longitude|lat|lng)"\s*:\s*-?\d+(?:\.\d+)?',
        caseSensitive: false,
      ),
      r'"$1":[COORD_REDACTED]',
    );
    s = s.replaceAll(
      RegExp(
        r"'(latitude|longitude|lat|lng)'\s*:\s*-?\d+(?:\.\d+)?",
        caseSensitive: false,
      ),
      r"'$1':[COORD_REDACTED]",
    );
    return s;
  }
}
