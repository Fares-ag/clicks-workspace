const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
const { customerToken, technicianToken, bearer } = require("../helpers/tokens");
const { signWebhookPayload } = require("../../clicks-shared/utils/skipcash");

const SECRET = "skipcash-integration-secret";
const KEY_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "skipcash-client-id";

let techApp;

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function skipcashCreateResult(overrides = {}) {
  return {
    resultObj: {
      id: "e4ed9c3e-2964-4eec-a990-b45ac9415617",
      statusId: 0,
      created: "2026-10-26T12:00:00Z",
      payUrl: "https://skipcashtest.azurewebsites.net/pay/e4ed9c3e-2964-4eec-a990-b45ac9415617",
      amount: "150.00",
      currency: "QAR",
      transactionId: "tx-integration-1",
      status: "new",
      ...overrides,
    },
    returnCode: 200,
    errorCode: 0,
    hasError: false,
    hasValidationError: false,
  };
}

beforeAll(async () => {
  process.env.SKIPCASH_KEY_ID = KEY_ID;
  process.env.SKIPCASH_KEY_SECRET = SECRET;
  process.env.SKIPCASH_CLIENT_ID = CLIENT_ID;
  process.env.SKIPCASH_ENV = "sandbox";
  process.env.SKIPCASH_RETURN_URL = "https://clicks.qa/app/skipcash-return";
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  techApp.set("skipcashFetch", async () => jsonResponse(skipcashCreateResult()));
});

describe("SkipCash customer payments", () => {
  test("creates a payUrl for the customer's unpaid completed job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed", price: 150 });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();

    expect(res.status).toBe(200);
    expect(res.body.already_paid).toBe(false);
    expect(res.body.pay_url).toMatch(/^https:\/\/skipcashtest\.azurewebsites\.net\/pay\//);
    expect(res.body.amount).toBe("150.00");
    expect(res.body.return_url).toBe("https://clicks.qa/app/skipcash-return");
  });

  test("rejects another customer's job", async () => {
    const owner = await seedCustomer();
    const other = await seedCustomer({
      phone_number: `+974501${String(Date.now()).slice(-6)}`,
      email: `other-${Date.now()}@test.local`,
    });
    const job = await seedCustomerJob({ customer: owner, jobStatus: "completed" });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(other._id)))
      .send();

    expect(res.status).toBe(403);
  });

  test("creates a payUrl for an in_progress unpaid job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();

    expect(res.status).toBe(200);
    expect(res.body.already_paid).toBe(false);
    expect(res.body.pay_url).toMatch(/^https:\/\/skipcashtest\.azurewebsites\.net\/pay\//);
    expect(res.body.amount).toBe("150.00");
  });

  test("rejects a job that is not yet payable", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "en_route" });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/skipcash/session`)
      .set(bearer(customerToken(customer._id)))
      .send();

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SKIPCASH_NOT_PAYABLE");
  });

  test("webhook with a valid signature marks the job paid", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed", price: 150 });
    job.skipcash = {
      payment_id: "c0168532-8e71-4623-b73a-c06db5cbd865",
      amount: "150.00",
    };
    await job.save();

    const payload = {
      PaymentId: "c0168532-8e71-4623-b73a-c06db5cbd865",
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-1",
      Custom1: job._id.toString(),
      VisaId: "visa-1",
    };

    const res = await request(techApp)
      .post("/api/webhooks/skipcash")
      .set("Authorization", signWebhookPayload(payload, SECRET))
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe("paid");

    const fresh = await require("../../clicks-shared/models").Job.findById(job._id);
    expect(fresh.payment_status).toBe("paid");
    expect(fresh.payment_method).toBe("card");
  });

  test("webhook with a bad signature is rejected", async () => {
    const res = await request(techApp)
      .post("/api/webhooks/skipcash")
      .set("Authorization", "not-a-real-signature")
      .send({
        PaymentId: "x",
        Amount: "1.00",
        StatusId: 2,
      });
    expect(res.status).toBe(401);
  });

  test("unblocks technician complete after SkipCash webhook on an in_progress job", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 150 });
    job.skipcash = {
      payment_id: "in-progress-pay",
      amount: "150.00",
    };
    job.customerSignatureUrl = "https://test.local/signature.png";
    job.customerSignedAt = new Date();
    await job.save();

    const blocked = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ job_reference: "SKIP-1" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/Payment must be collected/i);

    const payload = {
      PaymentId: "in-progress-pay",
      Amount: "150.00",
      StatusId: 2,
      TransactionId: "tx-in-progress",
      Custom1: job._id.toString(),
      VisaId: "visa-2",
    };
    const paid = await request(techApp)
      .post("/api/webhooks/skipcash")
      .set("Authorization", signWebhookPayload(payload, SECRET))
      .send(payload);
    expect(paid.status).toBe(200);
    expect(paid.body.payment_status).toBe("paid");

    const completed = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ job_reference: "SKIP-1" });
    expect(completed.status).toBe(200);
    expect(completed.body.job_status).toBe("completed");
  });

  test("status sync marks the job paid after SkipCash reports statusId 2", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "completed", price: 150 });
    job.skipcash = {
      payment_id: "paid-payment-id",
      amount: "150.00",
    };
    await job.save();

    techApp.set("skipcashFetch", async () =>
      jsonResponse(
        skipcashCreateResult({
          id: "paid-payment-id",
          statusId: 2,
          status: "paid",
          amount: "150.00",
        })
      )
    );

    const res = await request(techApp)
      .get(`/api/jobs/${job._id}/skipcash/status`)
      .set(bearer(customerToken(customer._id)));

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe("paid");
  });
});
