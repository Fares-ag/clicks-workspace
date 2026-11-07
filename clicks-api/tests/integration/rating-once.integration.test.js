/**
 * Scenario 76: one rating per job, editable for 24 hours, paid jobs only;
 * the app's "rate your service" prompt on resume is shown once
 * (session.rating_prompt_job + POST /:id/rating-prompted).
 */
const request = require("supertest");
const { Job } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob, seedTechnician } = require("../helpers/seed");
const { bearer, customerToken } = require("../helpers/tokens");

let app;

beforeAll(async () => {
  await connectTestDb();
  ({ app } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

async function completedJob(customer, { paid = true } = {}) {
  const technician = await seedTechnician();
  const job = await seedCustomerJob({ customer, technician, jobStatus: "completed" });
  job.completed_at = new Date();
  if (paid) {
    job.payment_status = "paid";
    job.payment_method = "cash";
    job.paid_at = new Date();
  }
  await job.save();
  return job;
}

function rate(customer, job, body) {
  return request(app)
    .post(`/api/jobs/${job._id}/rate`)
    .set(bearer(customerToken(customer._id)))
    .send(body);
}

test("an unpaid completed job cannot be rated", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer, { paid: false });
  const res = await rate(customer, job, { rating: 5 });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("RATING_JOB_UNPAID");
  expect((await Job.findById(job._id)).rating).toBeUndefined();
});

test("a job that is not completed cannot be rated", async () => {
  const customer = await seedCustomer();
  const job = await seedCustomerJob({ customer, jobStatus: "in_progress" });
  const res = await rate(customer, job, { rating: 4 });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("RATING_JOB_NOT_COMPLETED");
});

test("first rating is stored with rated_at; an edit within 24 h is allowed", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer);

  const first = await rate(customer, job, { rating: 3, rating_description: "Late" });
  expect(first.status).toBe(200);
  expect(first.body.rating).toBe(3);
  expect(first.body.editable_until).toBeTruthy();

  const edit = await rate(customer, job, { rating: 5, rating_description: "Sorted it" });
  expect(edit.status).toBe(200);
  expect(edit.body.message).toMatch(/updated/i);

  const stored = await Job.findById(job._id).lean();
  expect(stored.rating).toBe(5);
  expect(stored.rating_description).toBe("Sorted it");
  expect(stored.rated_at).toBeTruthy();
  expect(stored.rating_edited_at).toBeTruthy();
});

test("after 24 hours the rating is locked", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer);
  await rate(customer, job, { rating: 2 }).expect(200);
  await Job.updateOne(
    { _id: job._id },
    { $set: { rated_at: new Date(Date.now() - 25 * 60 * 60 * 1000) } }
  );
  const late = await rate(customer, job, { rating: 5 });
  expect(late.status).toBe(409);
  expect(late.body.code).toBe("RATING_LOCKED");
  expect((await Job.findById(job._id)).rating).toBe(2);
});

test("a legacy rating with no rated_at cannot be overwritten", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer);
  await Job.updateOne({ _id: job._id }, { $set: { rating: 1 } });
  const res = await rate(customer, job, { rating: 5 });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe("RATING_LOCKED");
});

test("a double submit rates once", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer);
  const [a, b] = await Promise.all([
    rate(customer, job, { rating: 4 }),
    rate(customer, job, { rating: 4 }),
  ]);
  expect([a.status, b.status]).toEqual([200, 200]);
  const stored = await Job.findById(job._id).lean();
  expect(stored.rating).toBe(4);
});

test("another customer cannot rate the job; invalid ratings are refused", async () => {
  const customer = await seedCustomer();
  const job = await completedJob(customer);
  const other = await seedCustomer({ phone_number: "+97455501234", email: "o@test.local" });
  expect((await rate(other, job, { rating: 5 })).status).toBe(403);
  expect((await rate(customer, job, { rating: 7 })).status).toBe(400);
  expect((await rate(customer, job, { rating: 2.5 })).status).toBe(400);
});

describe("rating prompt on resume", () => {
  function session(customer) {
    return request(app)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
  }

  test("session offers the paid, unrated job once; recording the prompt removes it", async () => {
    const customer = await seedCustomer();
    const job = await completedJob(customer);

    const before = await session(customer);
    expect(before.status).toBe(200);
    expect(String(before.body.rating_prompt_job?._id)).toBe(String(job._id));

    const prompted = await request(app)
      .post(`/api/jobs/${job._id}/rating-prompted`)
      .set(bearer(customerToken(customer._id)));
    expect(prompted.status).toBe(200);
    expect(prompted.body.already_prompted).toBe(false);

    const again = await request(app)
      .post(`/api/jobs/${job._id}/rating-prompted`)
      .set(bearer(customerToken(customer._id)));
    expect(again.body.already_prompted).toBe(true);

    const after = await session(customer);
    expect(after.body.rating_prompt_job).toBeNull();
  });

  test("unpaid and already-rated jobs are not offered", async () => {
    const customer = await seedCustomer();
    await completedJob(customer, { paid: false });
    const rated = await completedJob(customer);
    await rate(customer, rated, { rating: 5 }).expect(200);
    const res = await session(customer);
    expect(res.body.rating_prompt_job).toBeNull();
  });
});
