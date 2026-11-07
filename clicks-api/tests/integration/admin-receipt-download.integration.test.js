const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { adminToken, bearer } = require("../helpers/tokens");
const { seedAdmin, seedCustomerJob } = require("../helpers/seed");
const Receipt = require("../../clicks-shared/models/Receipt");

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
  await seedAdmin();
});

describe("Admin receipt download", () => {
  test("streams a PDF for a completed job with no receipt row", async () => {
    const job = await seedCustomerJob({
      jobStatus: "completed",
      price: 1150,
    });
    job.completed_at = new Date("2026-11-07T07:00:00.000Z");
    job.payment_status = "unpaid";
    job.job_reference = "CLK-26-0147";
    await job.save();

    const existing = await Receipt.countDocuments({ job_id: job._id });
    expect(existing).toBe(0);

    const pdf = await request(adminApp)
      .get(`/api/receipts/job/${job._id}/download`)
      .set(bearer(adminToken("Super Admin")));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    expect(pdf.headers["content-disposition"]).toMatch(/sanadcom-receipt-CLK-26-0147\.pdf/);
    expect(pdf.body.toString("utf8", 0, 5)).toBe("%PDF-");
    expect(pdf.body.toString("latin1")).toMatch(/Sanadcom/);
    expect(pdf.body.toString("latin1")).toMatch(/1150\.00/);
    // The PDF prints the payment state in capitals ("UNPAID | ...").
    expect(pdf.body.toString("latin1")).toMatch(/UNPAID/);
  });

  test("rejects download for an incomplete job without a receipt", async () => {
    const job = await seedCustomerJob({
      jobStatus: "in_progress",
      price: 150,
    });
    const res = await request(adminApp)
      .get(`/api/receipts/job/${job._id}/download`)
      .set(bearer(adminToken("Super Admin")));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/completed jobs/i);
  });

  test("returns pdf_url on the JSON receipt endpoint", async () => {
    const job = await seedCustomerJob({
      jobStatus: "completed",
      price: 150,
    });
    job.payment_status = "paid";
    await job.save();
    const receipt = await Receipt.create({
      job_id: job._id,
      customer_id: job.customer_id,
      technician_id: job.assignedTechnician,
      total_amount: 150,
      payment_status: "paid",
      items: [{ description: "Flat tire", quantity: 1, price: 150 }],
    });

    const json = await request(adminApp)
      .get(`/api/receipts/job/${job._id}`)
      .set(bearer(adminToken("Super Admin")));
    expect(json.status).toBe(200);
    expect(json.body.pdf_url).toBe(`/api/receipts/job/${job._id}/download`);
    expect(json.body.receipt.pdf_url).toBe(`/api/receipts/${receipt._id}/download`);

    const byId = await request(adminApp)
      .get(`/api/receipts/${receipt._id}/download`)
      .set(bearer(adminToken("Super Admin")));
    expect(byId.status).toBe(200);
    expect(byId.body.toString("utf8", 0, 5)).toBe("%PDF-");
  });
});
