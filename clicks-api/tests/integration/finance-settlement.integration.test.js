const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCompletedJob,
  seedFinanceUser,
  seedSource,
  seedTechnician,
} = require("../helpers/seed");
const { Job, TechnicianSettlement } = require("../../clicks-shared/models");

let adminApp;

beforeAll(async () => {
  await connectTestDb();
  await TechnicianSettlement.createIndexes();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

function qatarToday() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function financeAuth({ role = "operator" } = {}) {
  const password = `settle-pass-${role}`;
  const user = await seedFinanceUser(password, { role });
  const res = await request(adminApp)
    .post("/api/finance/auth/login")
    .send({ email: user.email, password });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

async function createSettlement(auth, technician, overrides = {}) {
  const today = qatarToday();
  const res = await request(adminApp)
    .post("/api/finance/settlements")
    .set(auth)
    .send({ technician_id: technician._id, period_from: today, period_to: today, ...overrides });
  expect(res.status).toBe(201);
  return res.body.settlement;
}

describe("Technician settlements", () => {
  test("reproduces the spreadsheet's Cash To Collect for Rawad-309", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    const settlement = await createSettlement(auth, technician, { number: 10 });
    expect(settlement.number).toBe(10);

    // Sheet totals: GP 14936 (tip of 100 included), batteries 4392, Fawran from
    // Salam 12682 of which 3562 bought batteries, Fawran to Salam 25573, petrol 275.
    const saved = await request(adminApp)
      .patch(`/api/finance/settlements/${settlement._id}`)
      .set(auth)
      .send({
        revision: settlement.revision,
        jobs: [
          {
            label: "Sheet jobs",
            payment_method: "cash",
            amount: 14836 + 4392,
            battery_cost: 4392,
            tip: 100,
          },
        ],
        entries: [
          { type: "fawran_from_company", amount: 12682 },
          { type: "battery_restock_fawran", amount: 3562 },
          { type: "fawran_handover", amount: 25573 },
          { type: "petrol", amount: 275 },
        ],
      });
    expect(saved.status).toBe(200);
    const { totals } = saved.body.settlement;
    expect(totals.owed_total).toBe(28448);
    expect(totals.credits_total).toBe(25948);
    expect(totals.cash_to_collect).toBe(2500);
    expect(totals.battery_gap).toBe(830);
    expect(totals.net_after_battery_gap).toBe(1670);

    const closed = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/close`)
      .set(auth)
      .send({ revision: saved.body.settlement.revision, collected_amount: 1460 });
    expect(closed.status).toBe(200);
    expect(closed.body.settlement.status).toBe("closed");
    expect(closed.body.settlement.totals.gap).toBe(-1040);

    const list = await request(adminApp).get("/api/finance/settlements").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.settlements[0]).toMatchObject({
      number: 10,
      status: "closed",
      cash_to_collect: 2500,
      collected_amount: 1460,
      gap: -1040,
    });

    const byName = await request(adminApp)
      .get("/api/finance/settlements")
      .query({ search: "test tech" })
      .set(auth);
    expect(byName.body.total).toBe(1);
    const byNumber = await request(adminApp)
      .get("/api/finance/settlements")
      .query({ search: "#10" })
      .set(auth);
    expect(byNumber.body.total).toBe(1);
    const noMatch = await request(adminApp)
      .get("/api/finance/settlements")
      .query({ search: "nobody" })
      .set(auth);
    expect(noMatch.body.total).toBe(0);
  });

  test("garage share on a Fawran job nets to zero and a Fawran tip is owed to the technician", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    const source = await seedSource();
    const garageJob = await seedCompletedJob({ technician, source, price: 2000 });
    const tipJob = await seedCompletedJob({ technician, source, price: 300 });
    await Job.updateMany({ _id: { $in: [garageJob._id, tipJob._id] } }, { payment_method: "fawran" });

    const settlement = await createSettlement(auth, technician);
    const candidates = await request(adminApp)
      .get(`/api/finance/settlements/${settlement._id}/job-candidates`)
      .set(auth);
    expect(candidates.status).toBe(200);
    expect(candidates.body.jobs).toHaveLength(2);
    expect(candidates.body.jobs.map((job) => job.payment_method)).toEqual(["fawran", "fawran"]);

    const saved = await request(adminApp)
      .patch(`/api/finance/settlements/${settlement._id}`)
      .set(auth)
      .send({
        jobs: [
          { job_id: garageJob._id, payment_method: "fawran", amount: 2000, garage_cost: 1000 },
          { job_id: tipJob._id, payment_method: "fawran", amount: 300, tip: 100 },
        ],
      });
    expect(saved.status).toBe(200);
    const { totals, jobs } = saved.body.settlement;
    expect(totals.garage_non_cash_jobs).toBe(1000);
    expect(totals.customer_fawran).toBe(2400);
    expect(totals.cash_to_collect).toBe(-100);
    // Linked lines carry the job's reference as their label.
    expect(jobs[0].label).toMatch(/^#/);
  });

  test("a job can only be in one settlement", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    const job = await seedCompletedJob({ technician, price: 150 });

    const first = await createSettlement(auth, technician);
    const second = await createSettlement(auth, technician);
    expect(second.number).toBe(first.number + 1);

    const line = { job_id: job._id, payment_method: "cash", amount: 150 };
    const savedFirst = await request(adminApp)
      .patch(`/api/finance/settlements/${first._id}`)
      .set(auth)
      .send({ jobs: [line] });
    expect(savedFirst.status).toBe(200);

    const savedSecond = await request(adminApp)
      .patch(`/api/finance/settlements/${second._id}`)
      .set(auth)
      .send({ jobs: [line] });
    expect(savedSecond.status).toBe(409);
    expect(savedSecond.body.message).toMatch(new RegExp(`settlement #${first.number}`));

    const candidates = await request(adminApp)
      .get(`/api/finance/settlements/${second._id}/job-candidates`)
      .set(auth);
    expect(candidates.body.jobs[0].settlement).toMatchObject({ number: first.number });
  });

  test("the unique index rejects a settled job twice but allows settlements with no jobs", async () => {
    const technician = await seedTechnician();
    const base = { technician_id: technician._id, period_from: "2026-09-01", period_to: "2026-09-30" };
    await TechnicianSettlement.create({ ...base, number: 1 });
    await TechnicianSettlement.create({ ...base, number: 2 });

    const jobId = "65a000000000000000000001";
    await TechnicianSettlement.create({ ...base, number: 3, job_ids: [jobId] });
    await expect(
      TechnicianSettlement.create({ ...base, number: 4, job_ids: [jobId] })
    ).rejects.toMatchObject({ code: 11000 });
  });

  test("the job picker searches the technician's jobs, inside or outside the period", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    const source = await seedSource();
    const recent = await seedCompletedJob({ technician, source, price: 120 });
    const older = await seedCompletedJob({ technician, source, price: 80 });
    await Job.updateOne({ _id: recent._id }, { job_reference: "J-2001", clientName: "Ahmed" });
    await Job.updateOne(
      { _id: older._id },
      { job_reference: "J-1990", clientName: "Sara", completed_at: new Date("2026-08-15T10:00:00Z") }
    );

    const settlement = await createSettlement(auth, technician);
    const url = `/api/finance/settlements/${settlement._id}/job-candidates`;

    const inPeriod = await request(adminApp).get(url).set(auth);
    expect(inPeriod.body.jobs.map((job) => job.label)).toEqual(["J-2001"]);

    const byClient = await request(adminApp)
      .get(url)
      .query({ any_date: "true", search: "sara" })
      .set(auth);
    expect(byClient.status).toBe(200);
    expect(byClient.body.jobs.map((job) => job.label)).toEqual(["J-1990"]);
    expect(byClient.body.jobs[0].amount).toBe(80);

    const anyDate = await request(adminApp)
      .get(url)
      .query({ any_date: "true", limit: 1 })
      .set(auth);
    // Newest first, and the limit is reported.
    expect(anyDate.body.jobs.map((job) => job.label)).toEqual(["J-2001"]);
    expect(anyDate.body.truncated).toBe(true);

    // A job finished outside the period can still be added to the settlement.
    const saved = await request(adminApp)
      .patch(`/api/finance/settlements/${settlement._id}`)
      .set(auth)
      .send({ jobs: [{ job_id: older._id, payment_method: "cash", amount: 80 }] });
    expect(saved.status).toBe(200);
    expect(saved.body.settlement.jobs[0]).toMatchObject({ label: "J-1990", client_name: "Sara" });
  });

  test("rejects jobs that belong to another technician", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    const otherTechnician = await seedTechnician({
      email: `other-tech-${Date.now()}@test.local`,
      phone: "+97455599911",
    });
    const otherJob = await seedCompletedJob({ technician: otherTechnician, price: 100 });

    const settlement = await createSettlement(auth, technician);
    const res = await request(adminApp)
      .patch(`/api/finance/settlements/${settlement._id}`)
      .set(auth)
      .send({ jobs: [{ job_id: otherJob._id, amount: 100 }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not a completed job of this technician/);
  });

  test("closed settlements are locked; only a finance admin can reopen, with a reason", async () => {
    const auth = await financeAuth();
    const adminAuth = await financeAuth({ role: "admin" });
    const technician = await seedTechnician();
    const settlement = await createSettlement(auth, technician);

    const stale = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/close`)
      .set(auth)
      .send({ revision: settlement.revision + 5, collected_amount: 0 });
    expect(stale.status).toBe(409);

    const closed = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/close`)
      .set(auth)
      .send({ revision: settlement.revision, collected_amount: 0 });
    expect(closed.status).toBe(200);

    const edit = await request(adminApp)
      .patch(`/api/finance/settlements/${settlement._id}`)
      .set(auth)
      .send({ notes: "should be blocked" });
    expect(edit.status).toBe(409);
    expect(edit.body.message).toBe("Settlement is closed. Reopen it first.");

    const deleteClosed = await request(adminApp)
      .delete(`/api/finance/settlements/${settlement._id}`)
      .set(auth);
    expect(deleteClosed.status).toBe(409);

    const reopenAsOperator = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/reopen`)
      .set(auth)
      .send({ reason: "Wrong collected amount entered" });
    expect(reopenAsOperator.status).toBe(403);

    const noReason = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/reopen`)
      .set(adminAuth)
      .send({ reason: "short" });
    expect(noReason.status).toBe(400);

    const reopened = await request(adminApp)
      .post(`/api/finance/settlements/${settlement._id}/reopen`)
      .set(adminAuth)
      .send({ reason: "Wrong collected amount entered" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.settlement.status).toBe("draft");
    expect(reopened.body.settlement.history.map((row) => row.action)).toEqual([
      "create",
      "close",
      "reopen",
    ]);

    const deleted = await request(adminApp)
      .delete(`/api/finance/settlements/${settlement._id}`)
      .set(auth);
    expect(deleted.status).toBe(200);
  });

  test("next-settlement defaults continue the numbering and start after the last period", async () => {
    const auth = await financeAuth();
    const technician = await seedTechnician();
    await createSettlement(auth, technician, {
      number: 9,
      period_from: "2026-09-24",
      period_to: "2026-09-25",
    });

    const res = await request(adminApp)
      .get("/api/finance/settlements/next")
      .query({ technician_id: String(technician._id) })
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.number).toBe(10);
    expect(res.body.period_from).toBe("2026-09-26");
  });
});
