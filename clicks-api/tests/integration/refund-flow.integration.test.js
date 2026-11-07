const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob, seedAdmin, seedFinanceUser } = require("../helpers/seed");
const { customerToken, technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash, sendWebhook } = require("../helpers/skipcash");
const {
  Job,
  PaymentAttempt,
  Refund,
  Receipt,
  AdminAuditLog,
} = require("../../clicks-shared/models");
const { requestRefund } = require("../../clicks-shared/services/refunds");

const REQUESTER_ID = "507f1f77bcf86cd799439011";
const APPROVER_ID = "507f1f77bcf86cd799439022";

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
  adminApp.set("skipcashFetch", sc.fetch);
  await seedAdmin({ _id: REQUESTER_ID, role: "Admin" });
  await seedAdmin({ _id: APPROVER_ID, role: "Super Admin" });
});

async function cardPaidJob(price = 200) {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price });
  const session = await request(techApp)
    .post(`/api/jobs/${job._id}/skipcash/session`)
    .set(bearer(customerToken(customer._id)))
    .send();
  const hook = await sendWebhook(techApp, {
    PaymentId: session.body.payment_id,
    Amount: session.body.amount,
    StatusId: 2,
    TransactionId: `tx-${job._id}`,
    Custom1: job._id.toString(),
    VisaId: "visa",
  });
  expect(hook.body.payment_status).toBe("paid");
  return { customer, job, paymentId: session.body.payment_id };
}

const asRequester = () => bearer(adminToken("Admin", REQUESTER_ID));
const asApprover = () => bearer(adminToken("Super Admin", APPROVER_ID));

describe("Refunds (scenario 83)", () => {
  test("request → approve by someone else → SkipCash refund → job, attempt and receipt updated", async () => {
    const { job, paymentId } = await cardPaidJob(200);

    const create = await request(adminApp)
      .post("/api/payments/refunds")
      .set(asRequester())
      .send({ job_id: job._id.toString(), amount: 50, reason: "Overcharged for parts" });
    expect(create.status).toBe(201);
    const refundId = create.body.refund._id;
    expect(create.body.refund.status).toBe("requested");
    expect(sc.calls.refund).toBe(0);

    // The requester cannot approve their own refund.
    const self = await request(adminApp)
      .post(`/api/payments/refunds/${refundId}/approve`)
      .set(bearer(adminToken("Super Admin", REQUESTER_ID)))
      .send();
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("REFUND_SAME_APPROVER");

    // An "Admin" (not Super Admin) cannot approve at all.
    const role = await request(adminApp)
      .post(`/api/payments/refunds/${refundId}/approve`)
      .set(bearer(adminToken("Admin", APPROVER_ID)))
      .send();
    expect(role.status).toBe(403);
    expect(role.body.code).toBe("REFUND_APPROVER_ROLE");

    const approve = await request(adminApp)
      .post(`/api/payments/refunds/${refundId}/approve`)
      .set(asApprover())
      .send();
    expect(approve.status).toBe(200);
    expect(approve.body.refund.status).toBe("succeeded");
    expect(approve.body.refund.provider_refund_id).toBe("refund-1");
    expect(approve.body.refund.credit_note_number).toMatch(/^CN-\d{4}-000001$/);

    expect(sc.calls.refund).toBe(1);
    expect(sc.refunds[0].body).toMatchObject({ PaymentId: paymentId, Amount: "50.00" });
    expect(sc.refunds[0].authorization).toBeTruthy();

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_status).toBe("partially_refunded");
    expect(fresh.refunded_amount).toBe(50);
    const attempt = await PaymentAttempt.findOne({ provider_payment_id: paymentId });
    expect(attempt.status).toBe("partially_refunded");
    expect(attempt.refunded_amount).toBe(50);
    const receipt = await Receipt.findOne({ job_id: job._id });
    expect(receipt.payment_status).toBe("partially_refunded");
    expect(receipt.credit_notes).toHaveLength(1);
    expect(receipt.credit_notes[0].amount).toBe(50);

    const pdf = await request(adminApp)
      .get(`/api/payments/refunds/${refundId}/credit-note`)
      .set(asApprover());
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    expect(pdf.body.toString("latin1")).toMatch(/CREDIT NOTE/);

    // Refund the rest: fully refunded. Over-refunding is refused.
    const tooMuch = await request(adminApp)
      .post("/api/payments/refunds")
      .set(asRequester())
      .send({ job_id: job._id.toString(), amount: 151, reason: "oops" });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.code).toBe("REFUND_TOO_LARGE");

    const rest = await request(adminApp)
      .post("/api/payments/refunds")
      .set(asRequester())
      .send({ job_id: job._id.toString(), reason: "Service not delivered" });
    expect(rest.body.refund.amount).toBe(150);
    await request(adminApp)
      .post(`/api/payments/refunds/${rest.body.refund._id}/approve`)
      .set(asApprover())
      .send();
    expect((await Job.findById(job._id)).payment_status).toBe("refunded");

    // SkipCash's refund webhook (StatusId 6) confirms; it creates nothing new.
    const hook = await sendWebhook(techApp, {
      PaymentId: paymentId,
      Amount: "50.00",
      StatusId: 6,
      TransactionId: `tx-${job._id}`,
      Custom1: job._id.toString(),
      VisaId: "visa",
    });
    expect(hook.status).toBe(200);
    expect(await Refund.countDocuments({})).toBe(2);
    expect((await Refund.findById(refundId)).provider_confirmed_at).toBeTruthy();

    const actions = (await AdminAuditLog.find({}).lean()).map((a) => a.action);
    expect(actions.filter((a) => a === "refund.request")).toHaveLength(2);
    expect(actions.filter((a) => a === "refund.approve")).toHaveLength(2);
  });

  test("SkipCash failure leaves the case failed; finance completes it with a portal reference", async () => {
    const { job } = await cardPaidJob(120);
    const create = await request(adminApp)
      .post("/api/payments/refunds")
      .set(asRequester())
      .send({ job_id: job._id.toString(), reason: "Double charged" });
    sc.failRefundWith("refunds unavailable");
    const fail = await request(adminApp)
      .post(`/api/payments/refunds/${create.body.refund._id}/approve`)
      .set(asApprover())
      .send();
    expect(fail.status).toBe(502);
    expect(fail.body.code).toBe("REFUND_PROVIDER_FAILED");
    expect((await Refund.findById(create.body.refund._id)).status).toBe("failed");
    expect((await Job.findById(job._id)).payment_status).toBe("paid");

    const finance = await seedFinanceUser("fin-pass-2", { role: "admin" });
    const login = await request(adminApp)
      .post("/api/finance/auth/login")
      .send({ email: finance.email, password: "fin-pass-2" });
    const manual = await request(adminApp)
      .post(`/api/finance/refunds/${create.body.refund._id}/approve`)
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ manual_reference: "SKIPCASH-PORTAL-7781" });
    expect(manual.status).toBe(200);
    expect(manual.body.refund.status).toBe("succeeded");
    expect(manual.body.refund.manual_reference).toBe("SKIPCASH-PORTAL-7781");
    expect((await Job.findById(job._id)).payment_status).toBe("refunded");
  });

  test("a refund done in the SkipCash portal (webhook 6, no case) is recorded and alerted", async () => {
    const { job, paymentId } = await cardPaidJob(80);
    const hook = await sendWebhook(techApp, {
      PaymentId: paymentId,
      Amount: "80.00",
      StatusId: 6,
      TransactionId: `tx-${job._id}`,
      Custom1: job._id.toString(),
      VisaId: "visa",
    });
    expect(hook.status).toBe(200);
    const refund = await Refund.findOne({ job_id: job._id });
    expect(refund.status).toBe("succeeded");
    expect(refund.source).toBe("provider");
    expect((await Job.findById(job._id)).payment_status).toBe("refunded");
  });

  test("requestRefund keeps the signature other services call; cash jobs need a manual reference", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 60 });
    await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ payment_method: "cash" });

    const refund = await requestRefund({
      jobId: job._id,
      subscriptionId: undefined,
      amount: 60,
      reason: "Customer cancelled after paying",
      requestedBy: { type: "system" },
      source: "cancellation",
    });
    expect(refund.method).toBe("manual");
    expect(refund.status).toBe("requested");

    const noRef = await request(adminApp)
      .post(`/api/payments/refunds/${refund._id}/approve`)
      .set(asApprover())
      .send();
    expect(noRef.status).toBe(400);
    expect(noRef.body.code).toBe("REFUND_REFERENCE_REQUIRED");

    const ok = await request(adminApp)
      .post(`/api/payments/refunds/${refund._id}/approve`)
      .set(asApprover())
      .send({ manual_reference: "CASH-RETURNED-001" });
    expect(ok.status).toBe(200);
    expect((await Job.findById(job._id)).payment_status).toBe("refunded");

    const reject = await requestRefund({
      jobId: job._id,
      reason: "x",
      requestedBy: { type: "system" },
      source: "cancellation",
    }).catch((err) => err);
    expect(reject.code).toBe("REFUND_NOT_PAID");
  });

  test("refund and ledger lists carry a job summary for the admin / finance screens", async () => {
    const { job, paymentId } = await cardPaidJob(90);
    await Job.updateOne({ _id: job._id }, { $set: { job_reference: "JOB-REF-77" } });
    const create = await request(adminApp)
      .post("/api/payments/refunds")
      .set(asRequester())
      .send({ job_id: job._id.toString(), amount: 10, reason: "Goodwill" });
    expect(create.status).toBe(201);

    const list = await request(adminApp)
      .get("/api/payments/refunds")
      .query({ status: "requested" })
      .set(asApprover());
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.refunds[0].job).toMatchObject({
      _id: job._id.toString(),
      job_reference: "JOB-REF-77",
      clientName: "Test Client",
      payment_status: "paid",
    });

    const one = await request(adminApp)
      .get(`/api/payments/refunds/${create.body.refund._id}`)
      .set(asApprover());
    expect(one.status).toBe(200);
    expect(one.body.refund.job.job_reference).toBe("JOB-REF-77");

    const finance = await seedFinanceUser("fin-pass-3", { role: "operator" });
    const login = await request(adminApp)
      .post("/api/finance/auth/login")
      .send({ email: finance.email, password: "fin-pass-3" });
    const financeList = await request(adminApp)
      .get("/api/finance/refunds")
      .query({ job_id: job._id.toString() })
      .set({ Authorization: `Bearer ${login.body.accessToken}` });
    expect(financeList.status).toBe(200);
    expect(financeList.body.refunds[0].job.job_reference).toBe("JOB-REF-77");

    const ledger = await request(adminApp)
      .get("/api/payments/payment-attempts")
      .query({ job_id: job._id.toString() })
      .set(asApprover());
    expect(ledger.status).toBe(200);
    const attempt = ledger.body.attempts.find((a) => a.provider_payment_id === paymentId);
    expect(attempt.job.job_reference).toBe("JOB-REF-77");

    // A membership refund has no job: the summary is null, not missing.
    await Refund.updateOne({ _id: create.body.refund._id }, { $set: { job_id: null } });
    const noJob = await request(adminApp)
      .get(`/api/payments/refunds/${create.body.refund._id}`)
      .set(asApprover());
    expect(noJob.body.refund.job).toBeNull();
  });

  test("dispatchers cannot touch refunds", async () => {
    const res = await request(adminApp)
      .get("/api/payments/refunds")
      .set(bearer(adminToken("Job Dispatcher")));
    expect(res.status).toBe(403);
  });
});
