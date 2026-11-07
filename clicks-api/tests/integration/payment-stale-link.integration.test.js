const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
const { customerToken, technicianToken, bearer } = require("../helpers/tokens");
const { configureSkipcashEnv, fakeSkipcash, sendWebhook } = require("../helpers/skipcash");
const { Job, PaymentAttempt, RepairProcedure } = require("../../clicks-shared/models");

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

function addPart(job, body) {
  return request(techApp)
    .post(`/api/jobs/${job._id}/repairs`)
    .set(bearer(technicianToken(job.assignedTechnician)))
    .send(body);
}

describe("Stale payment link after a price change (scenarios 77, 78, 86)", () => {
  test("price is frozen while a checkout is open; the old link still pays and is flagged, never 409", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });

    const session = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();
    expect(session.status).toBe(200);
    expect(session.body.amount).toBe("150.00");

    // Technician tries to add a part while the customer is on the payment page.
    const locked = await addPart(job, { description: "Valve", price: 80, quantity: 1 });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe("PRICE_LOCKED");

    const priceEdit = await request(techApp)
      .patch(`/api/jobs/${job._id}/details`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ price: 200 });
    expect(priceEdit.status).toBe(409);
    expect(priceEdit.body.code).toBe("PRICE_LOCKED");

    // Technician cancels the checkout (live check says not paid), then adds the part.
    const cancel = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/cancel`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send();
    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelled).toBe(1);
    expect(cancel.body.price_locked).toBe(false);

    const added = await addPart(job, { description: "Valve", price: 80, quantity: 1 });
    expect(added.status).toBe(200);

    // The customer pays the OLD link (150) although the job is now 230.
    const hook = await sendWebhook(techApp, {
      PaymentId: session.body.payment_id,
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-stale",
      Custom1: job._id.toString(),
      VisaId: "visa-stale",
    });
    expect(hook.status).toBe(200);
    expect(hook.body.outcome).toBe("amount_mismatch");
    expect(hook.body.payment_status).toBe("paid");

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_status).toBe("paid");
    expect(fresh.payment_method).toBe("card");
    expect(fresh.paid_amount).toBe(150);
    expect(fresh.payment_flags.amount_mismatch).toBe(true);
    const attempt = await PaymentAttempt.findOne({ provider_payment_id: session.body.payment_id });
    expect(attempt.status).toBe("paid");
    expect(attempt.outcome).toBe("amount_mismatch");
    expect(attempt.expected_amount).toBe(230);
  });

  test("cancelling a checkout that was actually paid settles it instead", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    const session = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();
    sc.setStatus(session.body.payment_id, 2);

    const cancel = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/cancel`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send();
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe("CARD_PAYMENT_RECEIVED");
    expect((await Job.findById(job._id)).payment_status).toBe("paid");
  });

  test("repair lines: price > 0, whole quantity >= 1, locked after payment", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });

    expect((await addPart(job, { description: "Discount", price: -20 })).status).toBe(400);
    expect((await addPart(job, { description: "Free", price: 0 })).status).toBe(400);
    expect((await addPart(job, { description: "Half", price: 10, quantity: 0 })).status).toBe(400);
    expect((await addPart(job, { description: "Frac", price: 10, quantity: 1.5 })).status).toBe(400);
    await expect(
      RepairProcedure.create({
        job_id: job._id,
        technician_id: job.assignedTechnician,
        description: "direct",
        price: -5,
      })
    ).rejects.toThrow(/Price must be greater than 0/);

    const okPart = await addPart(job, { description: "Bulb", price: 12.5, quantity: 2 });
    expect(okPart.status).toBe(200);

    const paid = await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ payment_method: "cash" });
    expect(paid.status).toBe(200);
    expect(paid.body.receipt.total_amount).toBe(175);

    const afterPaid = await addPart(job, { description: "Late", price: 30 });
    expect(afterPaid.status).toBe(409);
    expect(afterPaid.body.code).toBe("REPAIRS_LOCKED");
  });

  test("customer payloads carry the server price, 2 decimals, including repairs and member discount", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 100 });
    await Job.updateOne(
      { _id: job._id },
      { $set: { membership: { cover: "discounted", discountPercent: 15, included: false } } }
    );
    await addPart(job, { description: "Wiper", price: 19.99, quantity: 1 });

    const sessionRes = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
    expect(sessionRes.status).toBe(200);
    const pricing = sessionRes.body.active_job.pricing;
    expect(pricing.base).toBe(100);
    expect(pricing.repairs).toHaveLength(1);
    expect(pricing.subtotal).toBe(119.99);
    expect(pricing.total).toBe(101.99);
    expect(pricing.discount).toBe(18);

    const detail = await request(techApp)
      .get(`/api/jobs/${job._id}`)
      .set(bearer(customerToken(customer._id)));
    expect(detail.body.pricing.total).toBe(101.99);

    const active = await request(techApp)
      .get("/api/jobs/customer/active")
      .set(bearer(customerToken(customer._id)));
    expect(active.body.active_job.pricing.total).toBe(101.99);

    const session = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();
    expect(session.body.amount).toBe("101.99");
  });
});
