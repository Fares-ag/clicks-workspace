/**
 * Scenarios 50, 51: dispatcher cancel from the admin portal.
 * POST /api/jobs/:id/cancel exists, runs the shared cancel service (SOS
 * outcome, ServiceRequest state, technician freed, customer + technician
 * notified) and refuses a paid job without a refund decision.
 */
const request = require("supertest");
const axios = require("axios");
const {
  AdminAuditLog,
  Job,
  ServiceRequest,
  SOSRequest,
  Technician,
} = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedAdmin,
  seedCustomer,
  seedCustomerJob,
  seedTechnician,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { adminToken, bearer } = require("../helpers/tokens");

let adminApp;
const SUPER = "507f1f77bcf86cd799439041";
const DISPATCHER = "507f1f77bcf86cd799439042";

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedAdmin({ _id: SUPER, role: "Super Admin" });
  await seedAdmin({ _id: DISPATCHER, role: "Job Dispatcher" });
  axios.post.mockClear();
});

function cancelCall(jobId, role, id, body) {
  return request(adminApp)
    .post(`/api/jobs/${jobId}/cancel`)
    .set(bearer(adminToken(role, id)))
    .send(body);
}

test("dispatcher cancel: job cancelled, SOS + ServiceRequest terminal, technician freed and notified", async () => {
  const customer = await seedCustomer();
  const technician = await seedTechnician({ currentStatus: "On Job" });
  const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "accepted",
    job_id: job._id,
  });
  const sr = await ServiceRequest.create({
    customer_id: customer._id,
    service_type: "Battery Change",
    timing: "immediate",
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "assigned",
    job_id: job._id,
  });
  job.sos_request_id = sos._id;
  job.service_request_id = sr._id;
  await job.save();

  const res = await cancelCall(job._id, "Job Dispatcher", DISPATCHER, {
    reason: "Customer called to cancel",
  });
  expect(res.status).toBe(200);
  expect(res.body.job.job_status).toBe("cancelled");

  const stored = await Job.findById(job._id).lean();
  expect(stored.cancelled_by).toBe("admin");
  expect(stored.cancellation_reason).toBe("Customer called to cancel");
  expect((await SOSRequest.findById(sos._id)).status).toBe("cancelled");
  const storedSr = await ServiceRequest.findById(sr._id).lean();
  expect(storedSr.status).toBe("cancelled");
  expect(storedSr.cancelled_at).toBeTruthy();
  expect((await Technician.findById(technician._id)).currentStatus).toBe("Online");

  const notifyCall = axios.post.mock.calls.find(([url]) =>
    String(url).includes("/api/sos/notify-job-cancelled")
  );
  expect(notifyCall).toBeTruthy();
  expect(notifyCall[1].customer_id).toBe(String(customer._id));
  expect(notifyCall[1].technician_id).toBe(String(technician._id));

  const audit = await AdminAuditLog.findOne({ action: "job.cancel", entity_id: job._id });
  expect(audit).toBeTruthy();
});

test("cancel requires a reason; a second cancel is idempotent", async () => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "assigned" });

  const noReason = await cancelCall(job._id, "Job Dispatcher", DISPATCHER, {});
  expect(noReason.status).toBe(400);

  await cancelCall(job._id, "Job Dispatcher", DISPATCHER, { reason: "dup" }).expect(200);
  const again = await cancelCall(job._id, "Job Dispatcher", DISPATCHER, { reason: "dup" });
  expect(again.status).toBe(200);
  expect(again.body.already_cancelled).toBe(true);
});

test("completed jobs cannot be cancelled", async () => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "completed" });
  const res = await cancelCall(job._id, "Super Admin", SUPER, { reason: "oops" });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("JOB_NOT_CANCELLABLE");
});

describe("paid job needs a refund decision (scenario 51)", () => {
  async function paidJob() {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 200 });
    job.payment_status = "paid";
    job.payment_method = "card";
    await job.save();
    return job;
  }

  test("no decision -> 400 REFUND_DECISION_REQUIRED, job untouched", async () => {
    const job = await paidJob();
    const res = await cancelCall(job._id, "Super Admin", SUPER, { reason: "No show" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REFUND_DECISION_REQUIRED");
    expect((await Job.findById(job._id)).job_status).toBe("in_progress");
  });

  test("dispatchers cannot take refund decisions", async () => {
    const job = await paidJob();
    const res = await cancelCall(job._id, "Job Dispatcher", DISPATCHER, {
      reason: "No show",
      refund: "full",
    });
    expect(res.status).toBe(403);
    expect((await Job.findById(job._id)).job_status).toBe("in_progress");
  });

  test("partial refund needs a valid amount", async () => {
    const job = await paidJob();
    const missing = await cancelCall(job._id, "Super Admin", SUPER, {
      reason: "Partial service",
      refund: "partial",
    });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("REFUND_AMOUNT_INVALID");

    const tooMuch = await cancelCall(job._id, "Super Admin", SUPER, {
      reason: "Partial service",
      refund: "partial",
      refund_amount: 500,
    });
    expect(tooMuch.status).toBe(400);
  });

  test("admin with a partial refund decision cancels and the decision is stored", async () => {
    const job = await paidJob();
    const res = await cancelCall(job._id, "Super Admin", SUPER, {
      reason: "Technician could not finish",
      refund: "partial",
      refund_amount: 80,
      refund_reason: "Only diagnosis was done",
    });
    expect(res.status).toBe(200);
    const stored = await Job.findById(job._id).lean();
    expect(stored.job_status).toBe("cancelled");
    expect(stored.payment_status).toBe("paid");
    expect(stored.cancellation_refund.decision).toBe("partial");
    expect(stored.cancellation_refund.amount).toBe(80);
    expect(stored.cancellation_refund.reason).toBe("Only diagnosis was done");
    expect(String(stored.cancellation_refund.decided_by)).toBe(SUPER);

    // The decision opens a refund case awaiting a second approver.
    const Refund = require("../../clicks-shared/models/Refund");
    const refund = await Refund.findOne({ job_id: job._id }).lean();
    expect(refund).toBeTruthy();
    expect(refund.amount).toBe(80);
    expect(String(stored.cancellation_refund.refund_id)).toBe(String(refund._id));
    expect(stored.cancellation_refund.request_error).toBeFalsy();
  });

  test("a full refund decision opens a refund case for the whole paid amount", async () => {
    const job = await paidJob();
    const res = await cancelCall(job._id, "Super Admin", SUPER, {
      reason: "Customer was charged but nobody came",
      refund: "full",
    });
    expect(res.status).toBe(200);
    const Refund = require("../../clicks-shared/models/Refund");
    const refund = await Refund.findOne({ job_id: job._id }).lean();
    expect(refund).toBeTruthy();
    expect(refund.amount).toBe(200);
  });
});

test("PUT /api/jobs/:id refuses cancelled/completed and points at the dedicated endpoints", async () => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "assigned" });

  const cancel = await request(adminApp)
    .put(`/api/jobs/${job._id}`)
    .set(bearer(adminToken("Super Admin", SUPER)))
    .send({ job_status: "cancelled" });
  expect(cancel.status).toBe(400);
  expect(cancel.body.code).toBe("USE_DEDICATED_ENDPOINT");
  expect(cancel.body.message).toMatch(/\/cancel/);

  const complete = await request(adminApp)
    .put(`/api/jobs/${job._id}`)
    .set(bearer(adminToken("Super Admin", SUPER)))
    .send({ job_status: "completed" });
  expect(complete.status).toBe(400);
  expect(complete.body.message).toMatch(/\/complete/);

  expect((await Job.findById(job._id)).job_status).toBe("assigned");

  // Other edits still work.
  const edit = await request(adminApp)
    .put(`/api/jobs/${job._id}`)
    .set(bearer(adminToken("Super Admin", SUPER)))
    .send({ issue: "Battery dead" });
  expect(edit.status).toBe(200);
});
