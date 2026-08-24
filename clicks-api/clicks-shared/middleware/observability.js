const crypto = require("crypto");

/**
 * Attach request id + structured JSON access log.
 * Does not leak stack traces to clients — pair with errorHandler.
 */
function requestContext(req, res, next) {
  const requestId =
    req.headers["x-request-id"] || crypto.randomUUID?.() || crypto.randomBytes(16).toString("hex");
  req.requestId = requestId;
  // Correlates client, Sentry, and structured http_request logs
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  res.on("finish", () => {
    const entry = {
      level: res.statusCode >= 500 ? "error" : "info",
      msg: "http_request",
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - start,
      service: process.env.SERVICE_NAME || "clicks-api",
    };
    // Structured logs for log shippers
    console.log(JSON.stringify(entry));
  });
  next();
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const requestId = req.requestId;
  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled_error",
      requestId,
      path: req.originalUrl || req.url,
      error: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    })
  );
  res.status(status).json({
    error: status >= 500 ? "Internal server error" : err.message || "Request failed",
    requestId,
  });
}

module.exports = { requestContext, errorHandler };
