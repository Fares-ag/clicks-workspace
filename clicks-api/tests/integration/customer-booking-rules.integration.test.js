const request = require("supertest");
const { SOSRequest, OTPVerification, Customer } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  assertCustomerCanCreateSos,
} = require("../../clicks-shared/utils/customerBookingGuard");
const {
  seedCustomer,
  seedCustomerJob,
  seedCustomerVehicle,
  seedOtpRecord,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { customerToken, adminToken, bearer } = require("../helpers/tokens");
const { seedAdmin } = require("../helpers/seed");

let techApp;
let adminApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

/** A slot inside the dispatch window, `days` days ahead at 10:00 Qatar time. */
function nextSlot(days = 1) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  d.setUTCHours(7, 0, 0, 0); // 10:00 Asia/Qatar
  return d;
}

function immediateBody(overrides = {}) {
  return {
    service_type: "Battery Change",
    timing: "immediate",
    latitude: JOB_LAT,
    longitude: JOB_LNG,
    skip_vehicle: true,
    ...overrides,
  };
}

describe("Customer booking rules", () => {
  test("allows SOS for another vehicle while a live job exists", async () => {
    const customer = await seedCustomer();
    const garageCar = await seedCustomerVehicle(customer);
    const otherCar = await seedCustomerVehicle(customer);
    const job = await seedCustomerJob({ customer, jobStatus: "on_hold" });
    job.customer_vehicle_id = garageCar._id;
    await job.save();

    await expect(
      assertCustomerCanCreateSos({
        customerId: customer._id,
        customerVehicleId: otherCar._id.toString(),
        skipVehicle: false,
      })
    ).resolves.toBe(true);

    await expect(
      assertCustomerCanCreateSos({
        customerId: customer._id,
        customerVehicleId: garageCar._id.toString(),
        skipVehicle: false,
      })
    ).rejects.toMatchObject({ code: "LIVE_JOB_VEHICLE_ACTIVE" });

    await expect(
      assertCustomerCanCreateSos({
        customerId: customer._id,
        skipVehicle: true,
      })
    ).resolves.toBe(true);
  });

  test("blocks immediate service while a live job exists", async () => {
    const customer = await seedCustomer();
    await seedCustomerJob({ customer, jobStatus: "en_route" });

    const res = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(immediateBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("LIVE_JOB_ACTIVE");
  });

  test("blocks new bookings while a completed job is unpaid", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed" });
    job.payment_status = "unpaid";
    await job.save();

    const res = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(immediateBody());

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UNPAID_JOB_HOLD");
  });

  test("rejects a pin outside Qatar", async () => {
    const customer = await seedCustomer();
    const res = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(immediateBody({ latitude: 40.7, longitude: -74 }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("OUTSIDE_COVERAGE");
  });

  test("session reports unpaid and scheduled separately", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed" });
    job.payment_status = "unpaid";
    await job.save();

    const res = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));

    expect(res.status).toBe(200);
    expect(res.body.session_kind).toBe("unpaid");
    expect(res.body.unpaid_job).toBeTruthy();
    // Scenario 91 (decision): an unpaid balance never blocks an SOS — the
    // session reports the balance instead.
    expect(res.body.can_book_sos).toBe(true);
    expect(res.body.outstanding_balance).toBe(150);
    expect(res.body.outstanding_job_ids.map(String)).toEqual([String(job._id)]);
  });

  test("scheduled booking stays blocked by an unpaid job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed" });
    job.payment_status = "unpaid";
    await job.save();

    const res = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(
        immediateBody({
          timing: "scheduled",
          scheduled_for: nextSlot().toISOString(),
        })
      );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("UNPAID_JOB_HOLD");
  });

  test("future booking allowed for another vehicle while a tow is live (scenario 56)", async () => {
    const customer = await seedCustomer();
    const towed = await seedCustomerVehicle(customer);
    const other = await seedCustomerVehicle(customer);
    const job = await seedCustomerJob({ customer, jobStatus: "en_route" });
    job.customer_vehicle_id = towed._id;
    await job.save();

    const ok = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(
        immediateBody({
          timing: "scheduled",
          scheduled_for: nextSlot().toISOString(),
          skip_vehicle: false,
          customer_vehicle_id: String(other._id),
        })
      );
    expect(ok.status).toBe(201);

    const blocked = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send(
        immediateBody({
          timing: "scheduled",
          scheduled_for: nextSlot(2).toISOString(),
          skip_vehicle: false,
          customer_vehicle_id: String(towed._id),
        })
      );
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("LIVE_JOB_VEHICLE_ACTIVE");
  });

  test("immediate service request obeys the public SOS switch (scenario 28)", async () => {
    const customer = await seedCustomer();
    const prev = process.env.LAUNCH_PUBLIC_SOS;
    process.env.LAUNCH_PUBLIC_SOS = "false";
    try {
      const immediate = await request(techApp)
        .post("/api/service-requests")
        .set(bearer(customerToken(customer._id)))
        .send(immediateBody());
      expect(immediate.status).toBe(503);
      expect(immediate.body.code).toBe("LAUNCH_PUBLIC_SOS_OFF");

      const scheduled = await request(techApp)
        .post("/api/service-requests")
        .set(bearer(customerToken(customer._id)))
        .send(
          immediateBody({
            timing: "scheduled",
            scheduled_for: nextSlot().toISOString(),
          })
        );
      expect(scheduled.status).toBe(201);
    } finally {
      process.env.LAUNCH_PUBLIC_SOS = prev;
    }
  });

  test("customer can cancel a pending (unassigned) job for free (scenario 57)", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "pending" });
    job.assignedTechnician = null;
    await job.save();

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/cancel-customer`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "changed_mind" });
    expect(res.status).toBe(200);
    expect(res.body.cancel_fee_due).toBe(false);
    expect(res.body.job.job_status).toBe("cancelled");
  });

  test("an on_hold job routes the customer to support (scenario 57)", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "on_hold" });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/cancel-customer`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "changed_mind" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("JOB_ON_HOLD_CONTACT_SUPPORT");
    expect(res.body.error).toMatch(/contact support/i);
  });

  test("customer can cancel an assigned job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "assigned" });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/cancel-customer`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "changed_mind" });

    expect(res.status).toBe(200);
    expect(res.body.cancel_fee_due).toBe(false);
  });

  test("customer cannot cancel an in-progress job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress" });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/cancel-customer`)
      .set(bearer(customerToken(customer._id)))
      .send({ reason: "changed_mind" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("JOB_NOT_CANCELLABLE");
  });
});

describe("Customer identity", () => {
  test("register without a verified OTP is rejected", async () => {
    const res = await request(techApp).post("/api/customers/register").send({
      phone_number: "55511122",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@test.local",
      password: "password123",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REGISTRATION_OTP_REQUIRED");
  });

  test("register consumes a verified OTP and stores E.164", async () => {
    const phone = "+97455511122";
    await seedOtpRecord({
      phone,
      otp: "123456",
      purpose: "registration",
      verified: true,
    });

    const res = await request(techApp).post("/api/customers/register").send({
      phone_number: "55511122",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@test.local",
      password: "password123",
      otp: "123456",
    });
    expect(res.status).toBe(201);

    const saved = await Customer.findOne({ email: "ada@test.local" });
    expect(saved.phone_number).toBe(phone);
    expect(await OTPVerification.countDocuments({ phone, purpose: "registration" })).toBe(0);
  });

  test("inactive and deleted accounts cannot log in", async () => {
    const customer = await seedCustomer({
      phone_number: "+97455522233",
      status: "Inactive",
    });
    const inactive = await request(techApp).post("/api/customers/login").send({
      phone_number: customer.phone_number,
      password: "password123",
    });
    expect(inactive.status).toBe(403);

    const active = await seedCustomer({ phone_number: "+97455522244" });
    await request(techApp)
      .post("/api/customers/delete")
      .set(bearer(customerToken(active._id)))
      .send({ reason: "test" });

    const deleted = await request(techApp).post("/api/customers/login").send({
      phone_number: active.phone_number,
      password: "password123",
    });
    expect(deleted.status).toBe(403);
  });
});

describe("Dispatcher SOS outcomes", () => {
  test("schedule SOS creates a booking and closes the SOS", async () => {
    const customer = await seedCustomer();
    await seedAdmin();
    const sos = await SOSRequest.create({
      customer_id: customer._id,
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "in_call",
      service_type: "Battery Change",
    });

    const when = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    const res = await request(adminApp)
      .post(`/api/sos/${sos._id}/schedule`)
      .set(bearer(adminToken("Job Dispatcher")))
      .send({
        service_type: "Battery Change",
        scheduled_for: when,
      });

    expect(res.status).toBe(200);
    expect(res.body.service_request_id).toBeTruthy();

    const updated = await SOSRequest.findById(sos._id);
    expect(updated.status).toBe("scheduled");
  });

  test("close SOS as not a job", async () => {
    const customer = await seedCustomer();
    await seedAdmin();
    const sos = await SOSRequest.create({
      customer_id: customer._id,
      location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
      status: "pending",
    });

    const res = await request(adminApp)
      .post(`/api/sos/${sos._id}/close`)
      .set(bearer(adminToken("Job Dispatcher")))
      .send({ reason: "Accident with police — not roadside" });

    expect(res.status).toBe(200);
    const updated = await SOSRequest.findById(sos._id);
    expect(updated.status).toBe("not_a_job");
  });
});
