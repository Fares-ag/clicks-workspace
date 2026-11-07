/**
 * Scenario 63: the app's fee note next to "Cancel" comes from the server's
 * cancel policy (session.cancel_policy, and GET /api/jobs/:id for reloads),
 * derived from the same rule the cancel endpoint enforces.
 */
const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob } = require("../helpers/seed");
const { bearer, customerToken } = require("../helpers/tokens");

let app;

beforeAll(async () => {
  await connectTestDb();
  ({ app } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  delete process.env.CUSTOMER_CANCEL_FEE_QAR;
  await disconnectTestDb();
});

beforeEach(async () => {
  delete process.env.CUSTOMER_CANCEL_FEE_QAR;
  await clearCollections();
});

async function sessionFor(customer) {
  const res = await request(app)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(res.status).toBe(200);
  return res.body;
}

test.each([
  ["pending", "free", true],
  ["assigned", "free", true],
  ["accepted", "free", true],
  ["en_route", "fee", true],
  ["arrived", "fee", true],
  ["on_hold", "contact_support", false],
  ["in_progress", "none", false],
])("live job %s → cancel_policy.kind %s", async (status, kind, allowed) => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: status });
  const session = await sessionFor(customer);
  expect(session.cancel_policy).toMatchObject({
    job_id: String(job._id),
    job_status: status,
    kind,
    allowed,
    fee_amount: null,
    currency: "QAR",
  });
});

test("the fee amount comes from CUSTOMER_CANCEL_FEE_QAR, and only for a fee cancel", async () => {
  process.env.CUSTOMER_CANCEL_FEE_QAR = "25";
  const customer = await seedCustomer();
  await seedCustomerJob({ customer, jobStatus: "en_route" });
  expect((await sessionFor(customer)).cancel_policy.fee_amount).toBe(25);

  const other = await seedCustomer({ phone_number: "+97455507777", email: "x@test.local" });
  await seedCustomerJob({ customer: other, jobStatus: "assigned" });
  expect((await sessionFor(other)).cancel_policy.fee_amount).toBeNull();
});

test("no live job → cancel_policy is null", async () => {
  const customer = await seedCustomer();
  const session = await sessionFor(customer);
  expect(session.cancel_policy).toBeNull();
});

test("GET /api/jobs/:id carries the same policy for the customer", async () => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "assigned" });
  const res = await request(app)
    .get(`/api/jobs/${job._id}`)
    .set(bearer(customerToken(customer._id)));
  expect(res.status).toBe(200);
  expect(res.body.cancel_policy.kind).toBe("free");
  expect(res.body.job.job_status).toBe("assigned");
});
