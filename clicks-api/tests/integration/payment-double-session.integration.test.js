const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash, sendWebhook } = require("../helpers/skipcash");
const { Job, PaymentAttempt, Refund, Receipt } = require("../../clicks-shared/models");

let techApp;
let sc;

beforeAll(async () => {
  configureSkipcashEnv();
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  sc = fakeSkipcash();
  techApp.set("skipcashFetch", sc.fetch);
});

async function openSession(customer, job) {
  return request(techApp)
    .post(`/api/jobs/${job._id}/skipcash/session`)
    .set(bearer(customerToken(customer._id)))
    .send();
}

describe("Card checkout: double sessions (scenario 79)", () => {
  test("a double tap / two devices get the same live link — SkipCash is asked once", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });

    const [a, b] = await Promise.all([openSession(customer, job), openSession(customer, job)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.pay_url).toBe(b.body.pay_url);
    expect(sc.calls.create).toBe(1);
    expect(await PaymentAttempt.countDocuments({ job_id: job._id })).toBe(1);

    // "Back" and "Pay" again later: still the same link.
    const again = await openSession(customer, job);
    expect(again.body.pay_url).toBe(a.body.pay_url);
    expect(again.body.reused).toBe(true);
    expect(sc.calls.create).toBe(1);

    const fresh = await Job.findById(job._id);
    expect(fresh.price_locked).toBe(true);
    expect(again.body.pricing.total).toBe(150);
  });

  test("two sessions both paid: one applied, the other duplicate_capture with a refund case", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });

    const first = await openSession(customer, job);
    // The first page expired at SkipCash, so the next checkout opens a new link.
    sc.setStatus(first.body.payment_id, 3);
    const second = await openSession(customer, job);
    expect(second.body.payment_id).not.toBe(first.body.payment_id);
    expect(sc.calls.create).toBe(2);

    // ...but the customer had already paid on the first device, and pays again.
    const hook1 = await sendWebhook(techApp, {
      PaymentId: first.body.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-first",
      Custom1: job._id.toString(),
      VisaId: "visa-1",
    });
    expect(hook1.status).toBe(200);
    expect(hook1.body.outcome).toBe("applied");

    const hook2 = await sendWebhook(techApp, {
      PaymentId: second.body.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-second",
      Custom1: job._id.toString(),
      VisaId: "visa-2",
    });
    expect(hook2.status).toBe(200);
    expect(hook2.body.outcome).toBe("duplicate_capture");

    const attempts = await PaymentAttempt.find({ job_id: job._id }).sort({ createdAt: 1 });
    expect(attempts.map((a) => a.status)).toEqual(["paid", "paid"]);
    expect(attempts.map((a) => a.outcome)).toEqual(["applied", "duplicate_capture"]);
    expect(attempts[1].refund_case_id).toBeTruthy();

    const refund = await Refund.findById(attempts[1].refund_case_id);
    expect(refund.status).toBe("requested");
    expect(refund.amount).toBe(150);
    expect(refund.source).toBe("duplicate_capture");
    expect(String(refund.attempt_id)).toBe(String(attempts[1]._id));

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_status).toBe("paid");
    expect(String(fresh.paid_attempt_id)).toBe(String(attempts[0]._id));
    expect(fresh.payment_flags.duplicate_capture).toBe(true);
    expect(await Receipt.countDocuments({ job_id: job._id })).toBe(1);

    // The same duplicate webhook again: recorded, no second refund case.
    const replay = await sendWebhook(techApp, {
      PaymentId: second.body.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-second",
      Custom1: job._id.toString(),
      VisaId: "visa-2",
    });
    expect(replay.status).toBe(200);
    expect(await Refund.countDocuments({})).toBe(1);
  });

  test("a failed webhook after a paid one never downgrades the attempt (scenario 84)", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    const session = await openSession(customer, job);
    const paid = {
      PaymentId: session.body.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-1",
      Custom1: job._id.toString(),
      VisaId: "v",
    };
    expect((await sendWebhook(techApp, paid)).status).toBe(200);
    const failed = await sendWebhook(techApp, { ...paid, StatusId: 4 });
    expect(failed.status).toBe(200);

    const attempt = await PaymentAttempt.findOne({ provider_payment_id: session.body.payment_id });
    expect(attempt.status).toBe("paid");
    expect(attempt.events.map((e) => e.status_id)).toEqual(expect.arrayContaining([0, 2, 4]));
    expect((await Job.findById(job._id)).payment_status).toBe("paid");
  });
});
