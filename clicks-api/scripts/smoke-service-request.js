/**
 * Lightweight structural smoke for ServiceRequest wiring (no DB required).
 * Run: node scripts/smoke-service-request.js
 */
const assert = require("assert");
const path = require("path");

const ServiceRequest = require("../clicks-shared/models/ServiceRequest");
const Job = require("../clicks-shared/models/Job");
const shared = require("../clicks-shared/models");
const customerCtrl = require("../clicks-customer-tech-api/src/controllers/serviceRequestController");
const adminCtrl = require("../clicks-admin-api/src/controllers/serviceRequestController");

assert.ok(shared.ServiceRequest, "shared exports ServiceRequest");
assert.strictEqual(
  typeof customerCtrl.createServiceRequest,
  "function",
  "customer createServiceRequest"
);
assert.strictEqual(
  typeof customerCtrl.cancelServiceRequest,
  "function",
  "customer cancelServiceRequest"
);
assert.strictEqual(
  typeof customerCtrl.getActiveServiceRequest,
  "function",
  "customer getActive"
);
assert.strictEqual(
  typeof adminCtrl.getServiceRequests,
  "function",
  "admin list"
);

const paths = ServiceRequest.schema.paths;
assert.ok(paths.service_type, "service_type field");
assert.ok(paths.timing, "timing field");
assert.ok(paths.scheduled_for, "scheduled_for field");
assert.ok(paths.status, "status field");
assert.ok(Job.schema.paths.service_request_id, "Job.service_request_id");

const timingEnum = paths.timing.enumValues;
assert.deepStrictEqual(timingEnum, ["immediate", "scheduled"]);

console.log("smoke-service-request: OK");
console.log("  model:", path.basename(ServiceRequest.modelName));
console.log("  timing enum:", timingEnum.join(", "));
