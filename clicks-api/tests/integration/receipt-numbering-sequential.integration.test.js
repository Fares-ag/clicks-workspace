const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedCustomerJob, seedAdmin } = require("../helpers/seed");
const { technicianToken, adminToken, bearer } = require("../helpers/tokens");
const { Receipt, RepairProcedure } = require("../../clicks-shared/models");
const { qatarYear } = require("../../clicks-shared/services/sequence");
const { receiptNumber } = require("../../clicks-shared/services/receiptPdf");

let techApp;
let adminApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

describe("Receipt numbering and snapshots (scenario 98)", () => {
  test("concurrent payments get unique, gap-free sequential numbers", async () => {
    const customer = await seedCustomer();
    const jobs = [];
    for (let i = 0; i < 6; i += 1) {
      jobs.push(await seedCustomerJob({ customer, jobStatus: "in_progress", price: 100 + i }));
    }
    const results = await Promise.all(
      jobs.map((job) =>
        request(techApp)
          .post(`/api/jobs/${job._id}/payment`)
          .set(bearer(technicianToken(job.assignedTechnician)))
          .send({ payment_method: "cash" })
      )
    );
    results.forEach((res) => expect(res.status).toBe(200));

    const year = qatarYear(new Date());
    const numbers = (await Receipt.find({}).lean()).map((r) => r.receipt_number).sort();
    expect(numbers).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `REC-${year}-${String(n).padStart(6, "0")}`)
    );
    const one = await Receipt.findOne({ job_id: jobs[0]._id });
    expect(one.payment_method).toBe("cash");
    expect(one.snapshot.base_price).toBe(100);
  });

  test("receipts issued before numbering keep their legacy number", () => {
    const legacy = {
      _id: "65a1b2c3d4e5f6a7b8c9d0e1",
      issued_at: new Date("2026-03-10T08:00:00Z"),
    };
    expect(receiptNumber(legacy, {})).toBe("REC-20260310-D0E1");
    expect(receiptNumber({ ...legacy, receipt_number: "REC-2026-000042" }, {})).toBe(
      "REC-2026-000042"
    );
  });

  test("the PDF renders the lines frozen at issue, not repairs edited later", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({ customer, jobStatus: "in_progress", price: 100 });
    await request(techApp)
      .post(`/api/jobs/${job._id}/repairs`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ description: "Fuse", price: 15, quantity: 2 });
    await request(techApp)
      .post(`/api/jobs/${job._id}/payment`)
      .set(bearer(technicianToken(job.assignedTechnician)))
      .send({ payment_method: "cash" });

    // Someone edits the repair row directly afterwards.
    await RepairProcedure.updateMany({ job_id: job._id }, { $set: { price: 999 } });

    const pdf = await request(adminApp)
      .get(`/api/receipts/job/${job._id}/download`)
      .set(bearer(adminToken("Super Admin")));
    expect(pdf.status).toBe(200);
    const text = pdf.body.toString("latin1");
    expect(text).toMatch(/130\.00/);
    expect(text).not.toMatch(/999\.00/);
    expect(text).toMatch(/REC-\d{4}-000001/);
  });
});
