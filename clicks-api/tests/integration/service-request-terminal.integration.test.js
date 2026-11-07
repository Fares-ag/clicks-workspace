/**
 * WS-G (scenarios 53-55): ServiceRequests reach a terminal state, finished
 * jobs stop counting as an active session, scheduled bookings only become the
 * session inside their window, and resubmits are deduplicated.
 */
const request = require("supertest");
const { Job, Lead, ServiceRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerJob,
  seedSource,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");
const {
  markServiceRequestForJob,
} = require("../../clicks-shared/services/serviceRequestLifecycle");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  await ServiceRequest.init();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

function slot(hoursAhead) {
  const d = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  return d;
}

/** 10:00 Qatar, `days` ahead — inside the dispatch window. */
function daySlot(days) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(7, 0, 0, 0);
  return d;
}

function body(overrides = {}) {
  return {
    service_type: "Battery Change",
    timing: "immediate",
    latitude: JOB_LAT,
    longitude: JOB_LNG,
    skip_vehicle: true,
    ...overrides,
  };
}

async function srWithJob(customer, jobStatus) {
  const job = await seedCustomerJob({ customer, jobStatus });
  const sr = await ServiceRequest.create({
    customer_id: customer._id,
    service_type: "Battery Change",
    timing: "immediate",
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "assigned",
    job_id: job._id,
  });
  job.service_request_id = sr._id;
  await job.save();
  return { job, sr };
}

describe("terminal states", () => {
  test("markServiceRequestForJob moves the linked request and never flips it back", async () => {
    const customer = await seedCustomer();
    const { job, sr } = await srWithJob(customer, "completed");

    const first = await markServiceRequestForJob(job, "completed");
    expect(first.modified).toBe(1);
    const stored = await ServiceRequest.findById(sr._id).lean();
    expect(stored.status).toBe("completed");
    expect(stored.completed_at).toBeTruthy();

    const second = await markServiceRequestForJob(String(job._id), "cancelled");
    expect(second.modified).toBe(0);
    expect((await ServiceRequest.findById(sr._id)).status).toBe("completed");

    await expect(markServiceRequestForJob(job, "assigned")).rejects.toThrow(/invalid status/);
  });

  test("customer cancel of the job also cancels its service request", async () => {
    const customer = await seedCustomer();
    const { job, sr } = await srWithJob(customer, "assigned");
    await request(techApp)
      .post(`/api/jobs/${job._id}/cancel-customer`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "changed_mind" })
      .expect(200);
    expect((await ServiceRequest.findById(sr._id)).status).toBe("cancelled");
  });

  test("an 'assigned' request whose job already finished is not an active session (and is healed)", async () => {
    const customer = await seedCustomer();
    const { job, sr } = await srWithJob(customer, "completed");
    job.payment_status = "paid";
    await job.save();

    const session = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
    expect(session.status).toBe(200);
    expect(session.body.active_service_request).toBeNull();
    expect(session.body.has_active_session).toBe(false);

    const active = await request(techApp)
      .get("/api/service-requests/active")
      .set(bearer(customerToken(customer._id)));
    expect(active.body.has_active_service_request).toBe(false);

    // Healing is fire-and-forget; give it a moment.
    await new Promise((r) => setTimeout(r, 200));
    expect((await ServiceRequest.findById(sr._id)).status).toBe("completed");
  });
});

describe("scheduled window (scenario 55)", () => {
  test("a booking days away is an upcoming card, not the active session", async () => {
    const customer = await seedCustomer();
    const res = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(body({ timing: "scheduled", scheduled_for: daySlot(3).toISOString() }));
    expect(res.status).toBe(201);

    const session = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
    expect(session.body.active_service_request).toBeNull();
    expect(session.body.session_kind).toBeNull();
    expect(String(session.body.upcoming_booking._id)).toBe(res.body.service_request.id);
  });

  test("a booking inside the next hour is the active session", async () => {
    const customer = await seedCustomer();
    const sr = await ServiceRequest.create({
      customer_id: customer._id,
      service_type: "Battery Change",
      timing: "scheduled",
      scheduled_for: slot(0.5),
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "pending",
    });
    const session = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
    expect(String(session.body.active_service_request._id)).toBe(String(sr._id));
    expect(session.body.session_kind).toBe("scheduled");
  });
});

describe("dedupe (scenario 53)", () => {
  test("same client_request_id twice -> one request, one Lead", async () => {
    await seedSource("App");
    const customer = await seedCustomer();
    const payload = body({
      timing: "scheduled",
      scheduled_for: daySlot(2).toISOString(),
      client_request_id: "booking-abc",
    });
    const [a, b] = await Promise.all([
      request(techApp).post("/api/service-requests").set(bearer(customerToken(customer._id))).send(payload),
      request(techApp).post("/api/service-requests").set(bearer(customerToken(customer._id))).send(payload),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.service_request.id).toBe(b.body.service_request.id);
    expect(await ServiceRequest.countDocuments({ customer_id: customer._id })).toBe(1);
    expect(await Lead.countDocuments({})).toBe(1);
  });

  test("a keyless resubmit for the same slot inside 2 minutes returns the original", async () => {
    const customer = await seedCustomer();
    const payload = body({ timing: "scheduled", scheduled_for: daySlot(2).toISOString() });
    const first = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(payload);
    expect(first.status).toBe(201);
    const second = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.service_request.id).toBe(first.body.service_request.id);
    expect(await ServiceRequest.countDocuments({ customer_id: customer._id })).toBe(1);

    // A different slot is a different booking.
    const other = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(body({ timing: "scheduled", scheduled_for: daySlot(4).toISOString() }));
    expect(other.status).toBe(201);
  });

  test("cancelling a request that already has a job points at the job", async () => {
    const customer = await seedCustomer();
    const { job, sr } = await srWithJob(customer, "assigned");
    const res = await request(techApp)
      .post(`/api/service-requests/${sr._id}/cancel`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "x" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SERVICE_REQUEST_HAS_JOB");
    expect(res.body.job_id).toBe(String(job._id));
    expect((await Job.findById(job._id)).job_status).toBe("assigned");
  });
});
