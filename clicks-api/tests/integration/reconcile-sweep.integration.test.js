const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
const { customerToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash } = require("../helpers/skipcash");
const { Job, PaymentAttempt } = require("../../clicks-shared/models");
const {
  reconcilePendingAttempts,
  startPaymentReconciler,
  stopPaymentReconciler,
  findStalePendingAttempts,
  SWEEP_LEASE,
} = require("../../clicks-shared/services/paymentReconciler");
const { acquireLease } = require("../../clicks-shared/services/opsLease");

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

async function pendingCheckout() {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
  const res = await request(techApp)
    .post(`/api/jobs/${job._id}/skipcash/session`)
    .set(bearer(customerToken(customer._id)))
    .send();
  expect(res.status).toBe(200);
  return { customer, job, paymentId: res.body.payment_id };
}

describe("Payment reconciliation sweep (scenario 82)", () => {
  test("a paid checkout whose webhook was lost is settled by the sweep", async () => {
    const { job, paymentId } = await pendingCheckout();
    sc.setStatus(paymentId, 2);

    const notified = [];
    const summary = await reconcilePendingAttempts({
      fetchImpl: sc.fetch,
      notify: async (...args) => notified.push(args),
    });
    expect(summary).toMatchObject({ checked: 1, paid: 1, errors: 0 });

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_status).toBe("paid");
    expect(fresh.payment_method).toBe("card");
    expect(notified[0][1]).toBe("paymentConfirmed");
    const attempt = await PaymentAttempt.findOne({ provider_payment_id: paymentId });
    expect(attempt.events.some((e) => e.source === "sweep" && e.status_id === 2)).toBe(true);

    // Nothing left to check on the next pass.
    expect((await reconcilePendingAttempts({ fetchImpl: sc.fetch })).checked).toBe(0);
  });

  test("still-pending and failed attempts are recorded; failures unlock the price", async () => {
    const one = await pendingCheckout();
    const two = await pendingCheckout();
    sc.setStatus(two.paymentId, 4);

    const summary = await reconcilePendingAttempts({ fetchImpl: sc.fetch });
    expect(summary).toMatchObject({ checked: 2, pending: 1, failed: 1 });
    expect((await PaymentAttempt.findOne({ provider_payment_id: one.paymentId })).status).toBe("pending");
    expect((await PaymentAttempt.findOne({ provider_payment_id: two.paymentId })).status).toBe("failed");
    expect((await Job.findById(two.job._id)).price_locked).toBe(false);
    expect((await Job.findById(one.job._id)).price_locked).toBe(true);
  });

  test("attempts older than 48h are left to the stale report", async () => {
    const { paymentId } = await pendingCheckout();
    sc.setStatus(paymentId, 2);
    await PaymentAttempt.collection.updateOne(
      { provider_payment_id: paymentId },
      { $set: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) } }
    );
    expect((await reconcilePendingAttempts({ fetchImpl: sc.fetch })).checked).toBe(0);
    const stale = await findStalePendingAttempts();
    expect(stale.map((a) => a.provider_payment_id)).toEqual([paymentId]);
  });

  test("lookup errors are counted and retried next pass", async () => {
    await pendingCheckout();
    sc.failLookups(true);
    const summary = await reconcilePendingAttempts({ fetchImpl: sc.fetch });
    expect(summary).toMatchObject({ checked: 1, errors: 1 });
  });

  test("only the lease holder sweeps", async () => {
    const { job, paymentId } = await pendingCheckout();
    sc.setStatus(paymentId, 2);

    // Another instance holds the sweep lease.
    const other = await acquireLease(SWEEP_LEASE, 60000, { holder: "other-instance" });
    expect(other).toBeTruthy();
    const blocked = startPaymentReconciler({ intervalMs: 60000, fetchImpl: sc.fetch, runImmediately: false });
    await blocked.tick();
    await stopPaymentReconciler(blocked);
    expect((await Job.findById(job._id)).payment_status).toBe("unpaid");

    await other.release();
    const handle = startPaymentReconciler({ intervalMs: 60000, fetchImpl: sc.fetch, runImmediately: false });
    await handle.tick();
    await stopPaymentReconciler(handle);
    expect((await Job.findById(job._id)).payment_status).toBe("paid");

    // The holder keeps the lease for the interval: a second instance cannot take it.
    expect(await acquireLease(SWEEP_LEASE, 60000, { holder: "third-instance" })).toBeNull();
  });
});
