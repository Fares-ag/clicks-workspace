/**
 * Runs before any test module is loaded — env must exist before createApp requireEnv().
 */
const path = require("path");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "integration-test-jwt-secret-not-production";
process.env.JWT_REFRESH_SECRET = "integration-test-jwt-refresh-not-production";
process.env.INTERNAL_API_SECRET = "integration-test-internal-not-production";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/clicks_integration_placeholder";
process.env.REQUIRE_STRICT_ENV = "false";
process.env.LAUNCH_PUBLIC_SIGNUP = "true";
process.env.LAUNCH_PUBLIC_SOS = "true";
process.env.SANITIZE_REJECT = "true";
process.env.JOB_START_MAX_METERS = "200";
process.env.SMS_PROVIDER = "console";
process.env.CORS_ORIGINS = "http://localhost:3000";
// Soft-launch default: tests must not inherit a developer REDIS_URL.
delete process.env.REDIS_URL;

// One mongoose instance for db helper + clicks-shared models (sibling packages).
const testNodeModules = path.join(__dirname, "..", "node_modules");
process.env.NODE_PATH = [testNodeModules, process.env.NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
require("module").Module._initPaths();
