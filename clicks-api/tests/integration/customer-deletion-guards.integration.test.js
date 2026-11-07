/**
 * WS-F item 5 (scenarios 3, 4, 5): deletion guards, membership deactivation,
 * anonymisation and restore-on-re-register.
 */
const request = require("supertest");
const mongoose = require("../../clicks-shared/mongoose");
const {
  Customer,
  CustomerSubscription,
  SOSRequest,
  ServiceRequest,
  OTPVerification,
  Job,
} = require("../../clicks-shared/models");
const {
  anonymiseDeletedCustomers,
} = require("../../clicks-shared/services/anonymiseDeletedCustomers");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerJob,
  seedCustomerVehicle,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

function deleteAs(customer, body = { reason: "not_using" }) {
  return request(techApp)
    .post("/api/customers/delete")
    .set(bearer(customerToken(customer._id)))
    .send(body);
}

async function seedSubscription(customer, status = "active") {
  const vehicle = await seedCustomerVehicle(customer);
  return CustomerSubscription.create({
    customer_id: customer._id,
    customer_vehicle_id: vehicle._id,
    plan_id: new mongoose.Types.ObjectId(),
    planName: "Plus",
    interval: "month",
    durationMonths: 1,
    priceQar: 99,
    status,
    startDate: new Date(),
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
  });
}

describe("deletion is blocked while something is live", () => {
  test("live SOS → 409 DELETE_BLOCKED_LIVE_SOS", async () => {
    const customer = await seedCustomer();
    await SOSRequest.create({
      customer_id: customer._id,
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "pending",
    });
    const res = await deleteAs(customer);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DELETE_BLOCKED_LIVE_SOS");
    expect((await Customer.findById(customer._id)).deleted_at).toBeNull();
  });

  test("live job → 409 DELETE_BLOCKED_LIVE_JOB", async () => {
    const customer = await seedCustomer();
    await seedCustomerJob({ customer, jobStatus: "en_route" });
    const res = await deleteAs(customer);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DELETE_BLOCKED_LIVE_JOB");
  });

  test("active booking → 409 DELETE_BLOCKED_ACTIVE_BOOKING", async () => {
    const customer = await seedCustomer();
    await ServiceRequest.create({
      customer_id: customer._id,
      service_type: "Battery Change",
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      timing: "scheduled",
      scheduled_for: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: "pending",
    });
    const res = await deleteAs(customer);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DELETE_BLOCKED_ACTIVE_BOOKING");
  });

  test("unpaid completed job → 409 UNPAID_JOB_HOLD with the job id (Pay-now link)", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed" });
    const res = await deleteAs(customer);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UNPAID_JOB_HOLD");
    expect(res.body.job_id).toBe(String(job._id));
  });

  test("delete-check lists blockers and the membership warning", async () => {
    const customer = await seedCustomer();
    await seedCustomerJob({ customer, jobStatus: "en_route" });
    await seedSubscription(customer);
    const res = await request(techApp)
      .get("/api/customers/delete-check")
      .set(bearer(customerToken(customer._id)));
    expect(res.status).toBe(200);
    expect(res.body.can_delete).toBe(false);
    expect(res.body.blockers.map((b) => b.code)).toContain("DELETE_BLOCKED_LIVE_JOB");
    expect(res.body.active_membership).toBe(true);
    expect(res.body.membership_policy).toBe("forfeit_no_refund");
  });
});

describe("successful deletion", () => {
  test("records the reason, revokes tokens and deactivates the membership", async () => {
    const customer = await seedCustomer();
    const sub = await seedSubscription(customer, "active");
    const pending = await seedSubscription(customer, "pending_payment");
    const token = customerToken(customer._id);

    const res = await deleteAs(customer, { reason: "privacy", other_reason: "moving abroad" });
    expect(res.status).toBe(200);
    expect(res.body.memberships_cancelled).toBe(2);

    const after = await Customer.findById(customer._id);
    expect(after.status).toBe("Inactive");
    expect(after.deleted_at).toBeInstanceOf(Date);
    expect(after.deleted_reason).toBe("privacy");
    expect(after.deletion_request.other_reason).toBe("moving abroad");

    for (const id of [sub._id, pending._id]) {
      const raw = await CustomerSubscription.collection.findOne({ _id: id });
      expect(raw.status).toBe("cancelled");
      expect(raw.cancel_reason).toBe("account_deleted");
      expect(raw.history.at(-1)).toMatchObject({ action: "cancel", note: "account_deleted" });
    }

    const stale = await request(techApp).get("/api/customers/profile").set(bearer(token));
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe("ACCOUNT_INACTIVE");
  });

  test("login of a deleted account says ACCOUNT_DELETED", async () => {
    const customer = await seedCustomer();
    await deleteAs(customer);
    const res = await request(techApp)
      .post("/api/customers/login")
      .send({ phone_number: customer.phone_number, password: "password123" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_DELETED");
  });
});

async function verifiedRegistrationOtp(phone) {
  const send = await request(techApp).post("/api/customers/otp/send").send({ phone_number: phone });
  expect(send.status).toBe(200);
  const rec = await OTPVerification.findOne({ phone, purpose: "registration" });
  expect(rec).not.toBeNull();
  await request(techApp).post("/api/customers/otp/verify").send({ phone_number: phone, otp: rec.otp });
  return rec.otp;
}

describe("coming back after deletion (scenario 3)", () => {
  const PHONE = "+97455588001";

  test("before anonymisation, re-registering restores the same account", async () => {
    const customer = await seedCustomer({ phone_number: PHONE });
    const job = await seedCustomerJob({ customer, jobStatus: "completed" });
    await Job.updateOne({ _id: job._id }, { $set: { payment_status: "paid" } });
    expect((await deleteAs(customer)).status).toBe(200);

    const otp = await verifiedRegistrationOtp(PHONE);
    const res = await request(techApp).post("/api/customers/register").send({
      phone_number: PHONE,
      first_name: "Returning",
      last_name: "Customer",
      email: "returning@example.com",
      password: "password123",
      otp,
    });
    expect(res.status).toBe(201);
    expect(res.body.restored).toBe(true);

    const restored = await Customer.findById(customer._id);
    expect(restored.status).toBe("Active");
    expect(restored.deleted_at).toBeNull();
    expect(await Customer.countDocuments({})).toBe(1);
    // History stays attached to the restored account.
    expect(await Job.countDocuments({ customer_id: customer._id })).toBe(1);
  });

  test("anonymisation tombstones PII after 30 days and frees the number", async () => {
    const customer = await seedCustomer({ phone_number: PHONE, fcm_token: "tok-123" });
    await deleteAs(customer);
    await Customer.updateOne(
      { _id: customer._id },
      { $set: { deleted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) } }
    );

    const dry = await anonymiseDeletedCustomers({ dryRun: true });
    expect(dry.candidates).toBe(1);
    expect((await Customer.findById(customer._id)).anonymized_at).toBeNull();

    const run = await anonymiseDeletedCustomers();
    expect(run.anonymised).toBe(1);
    const tomb = await Customer.findById(customer._id);
    expect(tomb.first_name).toBe("Deleted");
    expect(tomb.phone_number).toBe(`deleted:${customer._id}`);
    expect(tomb.email).toMatch(/@deleted\.invalid$/);
    expect(tomb.fcm_token).toBeUndefined();
    expect(tomb.anonymized_at).toBeInstanceOf(Date);

    // Idempotent.
    expect((await anonymiseDeletedCustomers()).anonymised).toBe(0);

    const otp = await verifiedRegistrationOtp(PHONE);
    const res = await request(techApp).post("/api/customers/register").send({
      phone_number: PHONE,
      first_name: "New",
      last_name: "Owner",
      email: customer.email,
      password: "password123",
      otp,
    });
    expect(res.status).toBe(201);
    expect(res.body.restored).toBe(false);
    const fresh = await Customer.findOne({ phone_number: PHONE });
    expect(String(fresh._id)).not.toBe(String(customer._id));
  });

  test("a recent deletion is not anonymised", async () => {
    const customer = await seedCustomer();
    await deleteAs(customer);
    const run = await anonymiseDeletedCustomers();
    expect(run.anonymised).toBe(0);
  });
});
