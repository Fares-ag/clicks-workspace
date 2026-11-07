const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerVehicle,
  seedCustomerJob,
  seedAdmin,
} = require("../helpers/seed");
const { customerToken, technicianToken, adminToken, bearer } = require("../helpers/tokens");
const {
  Job,
  Receipt,
  TechnicianEarnings,
  CustomerSubscription,
  SubscriptionPlan,
  OutboxEvent,
} = require("../../clicks-shared/models");
const { seedMembershipPlans } = require("../../clicks-shared/services/membershipPlans");
const { addMonths } = require("../../clicks-shared/services/membershipPlans");

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
  await seedMembershipPlans(SubscriptionPlan);
});

/** A member's included car wash: total 0. */
async function coveredJob({ jobStatus }) {
  const customer = await seedCustomer();
  const vehicle = await seedCustomerVehicle(customer);
  const plan = await SubscriptionPlan.findOne({ code: "plus" });
  const sku = plan.intervals.find((r) => r.interval === "month");
  const now = new Date();
  const sub = await CustomerSubscription.create({
    customer_id: customer._id,
    customer_vehicle_id: vehicle._id,
    plan_id: plan._id,
    planCode: plan.code,
    planName: plan.name_en,
    interval: "month",
    durationMonths: 1,
    priceQar: sku.priceQar,
    discountPercent: plan.discountPercent,
    included: sku.included,
    eligibleServiceTypes: plan.eligibleServiceTypes,
    status: "active",
    startDate: now,
    endDate: addMonths(now, 1),
  });
  const job = await seedCustomerJob({ customer, jobStatus, price: 80 });
  job.issue = "Car Wash - Exterior";
  job.customer_vehicle_id = vehicle._id;
  job.membership = { cover: "included", included: true, discountPercent: 0, subscription_id: sub._id };
  job.customerSignatureUrl = "https://test.local/sig.png";
  job.customerSignedAt = new Date();
  await job.save();
  return { customer, vehicle, sub, job };
}

async function expectSettledAsMembership(job, sub, customer) {
  const fresh = await Job.findById(job._id);
  expect(fresh.job_status).toBe("completed");
  expect(fresh.payment_status).toBe("paid");
  expect(fresh.payment_method).toBe("membership");
  expect(fresh.paid_amount).toBe(0);

  const earnings = await TechnicianEarnings.findOne({ technician_id: job.assignedTechnician });
  expect(earnings.cash_balance).toBe(0);
  expect(earnings.performance.total_completed_jobs).toBe(1);

  const receipt = await Receipt.findOne({ job_id: job._id });
  expect(receipt.total_amount).toBe(0);
  expect(receipt.payment_method).toBe("membership");
  expect(receipt.receipt_number).toMatch(/^REC-\d{4}-\d{6}$/);

  const used = (await CustomerSubscription.findById(sub._id)).usage.reduce(
    (sum, u) => sum + Number(u.used || 0),
    0
  );
  expect(used).toBe(1);

  // No payment hold: the session shows nothing unpaid and allows a new SOS.
  const session = await request(techApp)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(session.body.unpaid_job).toBeNull();
  expect(session.body.can_book_sos).toBe(true);

  // Partner accrual goes through the outbox (delivered immediately here).
  const event = await OutboxEvent.findOne({ type: "partner_accrual", "payload.job_id": String(job._id) });
  expect(event).toBeTruthy();
  expect(event.status).toBe("sent");
}

describe("Zero-due member jobs (scenarios 89, 90)", () => {
  test("technician completes a fully covered job: paid by membership, no cash owed", async () => {
    const { customer, sub, job } = await coveredJob({ jobStatus: "in_progress" });
    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ job_reference: "MEMB-TECH-1" });
    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe("paid");
    expect(res.body.payment_method).toBe("membership");
    await expectSettledAsMembership(job, sub, customer);
  });

  test("admin completes the same kind of job through the same money path", async () => {
    await seedAdmin();
    const { customer, sub, job } = await coveredJob({ jobStatus: "arrived" });
    const res = await request(adminApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(adminToken("Super Admin")))
      .send({ completion_notes: "closed by ops", job_reference: "MEMB-ADM-1" });
    expect(res.status).toBe(200);
    expect(res.body.job.payment_method).toBe("membership");
    await expectSettledAsMembership(job, sub, customer);

    const again = await request(adminApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(adminToken("Super Admin")))
      .send({});
    expect(again.status).toBe(400);
    const earnings = await TechnicianEarnings.findOne({ technician_id: job.assignedTechnician });
    expect(earnings.performance.total_completed_jobs).toBe(1);
  });

  test("admin complete credits the technician and issues the receipt for a paid job", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 140 });
    await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ payment_method: "cash" });
    const res = await request(adminApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(adminToken("Super Admin")))
      .send({});
    expect(res.status).toBe(200);
    const earnings = await TechnicianEarnings.findOne({ technician_id: job.assignedTechnician });
    expect(earnings.cash_balance).toBe(140);
    expect(await Receipt.countDocuments({ job_id: job._id })).toBe(1);
  });

  test("admin cannot delete a paid job; an unpaid one is archived, not destroyed", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const paid = await seedCustomerJob({ customer, jobStatus: "completed", price: 50 });
    paid.payment_status = "paid";
    await paid.save();
    const refused = await request(adminApp)
      .delete(`/api/jobs/${paid._id}`)
      .set(bearer(adminToken("Super Admin")));
    expect(refused.status).toBe(409);
    expect(await Job.exists({ _id: paid._id })).toBeTruthy();

    const unpaid = await seedCustomerJob({ customer, jobStatus: "pending", price: 50 });
    const del = await request(adminApp)
      .delete(`/api/jobs/${unpaid._id}`)
      .set(bearer(adminToken("Super Admin")));
    expect(del.status).toBe(200);
    expect(await Job.exists({ _id: unpaid._id })).toBeNull();
    const JobArchive = require("../../clicks-shared/models/JobArchive");
    const archived = await JobArchive.findById(unpaid._id);
    expect(archived.deleted_at).toBeTruthy();
  });
});
