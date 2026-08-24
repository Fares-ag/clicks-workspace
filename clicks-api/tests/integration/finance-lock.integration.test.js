const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCompletedJob, seedFinanceUser } = require("../helpers/seed");

const LOCK_MESSAGE = "Job is audited and locked. Reopen it first.";

let adminApp;

beforeAll(async () => {
  await connectTestDb();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

async function financeLogin(email, password) {
  const res = await request(adminApp)
    .post("/api/finance/auth/login")
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

describe("Finance audit lock", () => {
  test("second audit and updateFinance return 409; reopen → audit works", async () => {
    const job = await seedCompletedJob({ price: 300 });
    const financeUser = await seedFinanceUser("secure-finance-pass");
    const token = await financeLogin(financeUser.email, "secure-finance-pass");
    const auth = { Authorization: `Bearer ${token}` };

    const audit1 = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/audit`)
      .set(auth)
      .send({});
    expect(audit1.status).toBe(200);
    expect(audit1.body.job.finance_status).toBe("audited");

    const audit2 = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/audit`)
      .set(auth)
      .send({});
    expect(audit2.status).toBe(409);
    expect(audit2.body.message).toBe(LOCK_MESSAGE);

    const update = await request(adminApp)
      .patch(`/api/finance/jobs/${job._id}/finance`)
      .set(auth)
      .send({ notes: "should be blocked" });
    expect(update.status).toBe(409);
    expect(update.body.message).toBe(LOCK_MESSAGE);

    // Reopening an audited job is restricted to the "admin" finance role.
    const reopenAsOperator = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/reopen`)
      .set(auth)
      .send({});
    expect(reopenAsOperator.status).toBe(403);

    const financeAdmin = await seedFinanceUser("secure-finance-admin", { role: "admin" });
    const adminToken = await financeLogin(financeAdmin.email, "secure-finance-admin");
    const adminAuth = { Authorization: `Bearer ${adminToken}` };

    const reopen = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/reopen`)
      .set(adminAuth)
      .send({});
    expect(reopen.status).toBe(200);
    expect(reopen.body.job.finance_status).toBe("pending");

    const auditAfterReopen = await request(adminApp)
      .post(`/api/finance/jobs/${job._id}/audit`)
      .set(auth)
      .send({ notes: "re-audited" });
    expect(auditAfterReopen.status).toBe(200);
    expect(auditAfterReopen.body.job.finance_status).toBe("audited");
  });
});
