function isSentryEnabled() {
  return Boolean(process.env.SENTRY_DSN && String(process.env.SENTRY_DSN).trim());
}

function loadSentry() {
  // Resolved from the API package that boots the process (admin-api / tech-api).
  return require("@sentry/node");
}

function initSentry() {
  if (!isSentryEnabled()) return false;

  const Sentry = loadSentry();
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.GIT_SHA || undefined,
    integrations: [Sentry.expressIntegration()],
  });
  return true;
}

/** Early Express middleware — pairs with expressIntegration for request-scoped errors. */
function sentryRequestMiddleware() {
  if (!isSentryEnabled()) {
    return (_req, _res, next) => next();
  }
  const Sentry = loadSentry();
  return (req, _res, next) => {
    if (req.requestId) {
      Sentry.getIsolationScope().setTag("requestId", req.requestId);
    }
    next();
  };
}

/** Install before the app's own errorHandler so Sentry captures then JSON still goes out. */
function sentryErrorMiddleware() {
  if (!isSentryEnabled()) {
    return (err, _req, _res, next) => next(err);
  }
  const { expressErrorHandler } = loadSentry();
  return expressErrorHandler();
}

function captureException(err, tags = {}) {
  if (!isSentryEnabled()) return;
  const Sentry = loadSentry();
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value != null) scope.setTag(key, String(value));
    }
    Sentry.captureException(err);
  });
}

module.exports = {
  initSentry,
  isSentryEnabled,
  sentryRequestMiddleware,
  sentryErrorMiddleware,
  captureException,
};
