const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob, seedFinanceUser, seedAdmin } = require("../helpers/seed");
const { customerToken, technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash, sendWebhook } = require("../helpers/skipcash");
const {
  Job,
  PaymentAttempt,
  Refund,
  Receipt,
  AdminAuditLog,
} = require("../../clicks-shared/models");

let techApp;
let adminApp;
let sc;

beforeAll(async () => {
  configureSkipcashEnv();
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  sc = fakeSkipcash();
  techApp.set("skipcashFetch", sc.fetch);
});

async function cardCheckout(customer, job) {
  const res = await request(techApp)
    .post(`/api/jobs/${job._id}/skipcash/session`)
    .set(bearer(customerToken(customer._id)))
    .send();
  expect(res.status).toBe(200);
  return res.body;
}

function confirmCash(job, body = { payment_method: "cash" }) {
  return request(techApp)
    .post(`/api/jobs/${job._id}/payment`)
    .set(bearer(technicianToken(job.assignedTechnician)))
    .send(body);
}

async function financeLogin(user, password) {
  const res = await request(adminApp)
    .post("/api/finance/auth/login")
    .send({ email: user.email, password });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

describe("Technician cash confirmation (scenarios 80, 85)", () => {
  test("technicians can only confirm cash", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    for (const method of ["card", "wallet", "fawran"]) {
      const res = await confirmCash(job, { payment_method: method });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CASH_ONLY");
    }
    expect((await Job.findById(job._id)).payment_status).toBe("unpaid");
  });

  test("blocked while a card checkout is pending; allowed after an explicit cancel", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    const session = await cardCheckout(customer, job);

    const blocked = await confirmCash(job);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CARD_PAYMENT_PENDING");
    expect((await Job.findById(job._id)).payment_status).toBe("unpaid");

    const cash = await confirmCash(job, { payment_method: "cash", cancel_card: true });
    expect(cash.status).toBe(200);
    expect(cash.body.payment_method).toBe("cash");
    const attempt = await PaymentAttempt.findOne({ provider_payment_id: session.payment_id });
    expect(attempt.status).toBe("cancelled");

    // The card webhook arrives late anyway: recorded as a duplicate to refund.
    const hook = await sendWebhook(techApp, {
      PaymentId: session.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-late",
      Custom1: job._id.toString(),
      VisaId: "v",
    });
    expect(hook.status).toBe(200);
    expect(hook.body.outcome).toBe("duplicate_capture");
    const fresh = await Job.findById(job._id);
    expect(fresh.payment_method).toBe("cash");
    expect(await Refund.countDocuments({ job_id: job._id, source: "duplicate_capture" })).toBe(1);
  });

  test("a card payment that already went through is settled as card, and cash is refused", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    const session = await cardCheckout(customer, job);
    sc.setStatus(session.payment_id, 2); // paid, webhook delayed

    const res = await confirmCash(job, { payment_method: "cash", cancel_card: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CARD_PAYMENT_RECEIVED");

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_status).toBe("paid");
    expect(fresh.payment_method).toBe("card");
    const receipt = await Receipt.findOne({ job_id: job._id });
    expect(receipt.payment_method).toBe("card");
    expect(receipt.provider_payment_id).toBe(session.payment_id);
  });

  test("cash is refused when SkipCash cannot be reached to rule out a card payment", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    await cardCheckout(customer, job);
    sc.failLookups(true);
    const res = await confirmCash(job, { payment_method: "cash", cancel_card: true });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CARD_PAYMENT_UNVERIFIED");
  });

  test("technician re-check settles a card payment whose webhook was lost", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    const session = await cardCheckout(customer, job);
    sc.setStatus(session.payment_id, 2);
    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/recheck`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe("paid");
    expect(res.body.payment_method).toBe("card");
  });

  test("finance marks card/wallet/Fawran paid with a reference; audited", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed", price: 220 });
    const user = await seedFinanceUser("fin-pass-1");
    const auth = await financeLogin(user, "fin-pass-1");

    const noRef = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/mark-paid`)
      .set(auth)
      .send({ payment_method: "fawran" });
    expect(noRef.status).toBe(400);
    expect(noRef.body.code).toBe("REFERENCE_REQUIRED");

    const waive = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/mark-paid`)
      .set(auth)
      .send({ payment_method: "waived", reason: "goodwill" });
    expect(waive.status).toBe(403);

    const ok = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/mark-paid`)
      .set(auth)
      .send({ payment_method: "fawran", reference: "FWN-889123" });
    expect(ok.status).toBe(200);
    expect(ok.body.job.payment_status).toBe("paid");
    expect(ok.body.job.payment_method).toBe("fawran");
    expect(ok.body.job.payment_reference).toBe("FWN-889123");
    expect(ok.body.receipt.receipt_number).toMatch(/^REC-\d{4}-\d{6}$/);
    const audit = await AdminAuditLog.findOne({ action: "job.mark_paid", entity_id: job._id });
    expect(audit).toBeTruthy();
    expect(audit.admin_role).toBe("finance");

    const again = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/mark-paid`)
      .set(auth)
      .send({ payment_method: "fawran", reference: "FWN-889123" });
    expect(again.status).toBe(409);
  });

  test("admin can waive a balance with a reason (scenario 90 escape hatch)", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed", price: 90 });
    const dispatcher = await request(adminApp)
      .post(`/api/jobs/${job._id}/mark-paid`)
      .set(bearer(adminToken("Job Dispatcher")))
      .send({ payment_method: "waived", reason: "service failed" });
    expect(dispatcher.status).toBe(403);

    const res = await request(adminApp)
      .post(`/api/jobs/${job._id}/mark-paid`)
      .set(bearer(adminToken("Super Admin")))
      .send({ payment_method: "waived", reason: "service failed" });
    expect(res.status).toBe(200);
    expect(res.body.job.payment_method).toBe("waived");
    expect(res.body.job.paid_amount).toBe(0);
    expect(await AdminAuditLog.countDocuments({ action: "job.payment_waived" })).toBe(1);
  });
});
