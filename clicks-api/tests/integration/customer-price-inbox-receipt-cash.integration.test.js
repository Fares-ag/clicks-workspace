const request = require("supertest");
const {
  Job,
  Notification,
  Receipt,
} = require("../../clicks-shared/models");
const { createJobRecord } = require("../../clicks-shared/services/createJobRecord");
const { recordCustomerNotification } = require("../../clicks-customer-tech-api/src/services/notificationRecordService");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedCustomer,
  seedCustomerJob,
  seedSource,
  seedTechnician,
} = require("../helpers/seed");
const { customerToken, technicianToken, bearer } = require("../helpers/tokens");

let techApp;

beforeAll(async () => {
  await connectTestDb();
  ({ app: techApp } = require("../../clicks-customer-tech-api/src/createApp").createTechApp());
});

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

describe("optional upfront price", () => {
  test("admin-style create can omit price", async () => {
    const source = await seedSource();
    const { job } = await createJobRecord({
      clientName: "No Price Client",
      clientMobileNumber: "+97455551234",
      location: "25.2854,51.531",
      dateTime: new Date(),
      jobType: "Flat tire",
      source: source._id,
      issue: "Battery jump",
    });
    expect(job.price).toBeUndefined();
  });

  test("technician must set price before complete", async () => {
    const tech = await seedTechnician();
    const source = await seedSource();
    const job = await Job.create({
      clientName: "Test Client",
      clientMobileNumber: "+97450000001",
      issue: "Flat tire",
      location: "25.2854,51.531",
      locationCoordinates: { type: "Point", coordinates: [51.531, 25.2854] },
      dateTime: new Date(),
      jobType: "Flat tire",
      assignedTechnician: tech._id,
      source: source._id,
      job_status: "in_progress",
      payment_status: "paid",
      customerSignatureUrl: "https://test.local/sign.png",
      customerSignedAt: new Date(),
      started_at: new Date(),
    });

    const blocked = await request(techApp)
      .post(`/api/jobs/${job._id}/complete`)
      .set(bearer(technicianToken(tech._id)))
      .send({ job_reference: "QA-PRICE" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toMatch(/price/i);
  });

  test("technician can set a missing price after arrival", async () => {
    const tech = await seedTechnician();
    const source = await seedSource();
    const job = await Job.create({
      clientName: "Test Client",
      clientMobileNumber: "+97450000001",
      issue: "Flat tire",
      location: "25.2854,51.531",
      locationCoordinates: { type: "Point", coordinates: [51.531, 25.2854] },
      dateTime: new Date(),
      jobType: "Flat tire",
      assignedTechnician: tech._id,
      source: source._id,
      job_status: "in_progress",
      payment_status: "unpaid",
    });

    const priced = await request(techApp)
      .patch(`/api/jobs/${job._id}/details`)
      .set(bearer(technicianToken(tech._id)))
      .send({ price: 180 });
    expect(priced.status).toBe(200);
    const fresh = await Job.findById(job._id);
    expect(fresh.price).toBe(180);
  });
});

describe("customer notification inbox", () => {
  test("lists, marks read, and clears customer notifications", async () => {
    const customer = await seedCustomer();
    const other = await seedCustomer({
      phone_number: `+974501${String(Date.now()).slice(-6)}`,
    });
    await recordCustomerNotification({
      customerId: customer._id,
      type: "technician_assigned",
      title: "Technician assigned",
      body: "A technician has been assigned to your request.",
      data: { event: "technicianAssigned" },
    });
    await recordCustomerNotification({
      customerId: other._id,
      type: "job_completed",
      title: "Hidden",
      body: "Other customer",
    });

    const list = await request(techApp)
      .get("/api/notifications/customer")
      .set(bearer(customerToken(customer._id)));
    expect(list.status).toBe(200);
    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.notifications[0].title).toBe("Technician assigned");
    expect(list.body.unreadCount).toBe(1);

    const unread = await request(techApp)
      .get("/api/notifications/customer/unread-count")
      .set(bearer(customerToken(customer._id)));
    expect(unread.body.count).toBe(1);

    const id = list.body.notifications[0]._id;
    const marked = await request(techApp)
      .patch(`/api/notifications/customer/${id}/read`)
      .set(bearer(customerToken(customer._id)))
      .send();
    expect(marked.status).toBe(200);
    expect(marked.body.notification.read).toBe(true);

    await request(techApp)
      .delete("/api/notifications/customer/clear-all")
      .set(bearer(customerToken(customer._id)));
    const empty = await request(techApp)
      .get("/api/notifications/customer")
      .set(bearer(customerToken(customer._id)));
    expect(empty.body.notifications).toHaveLength(0);
    const leftover = await Notification.countDocuments({ customer_id: other._id });
    expect(leftover).toBe(1);
  });
});

describe("Clicks receipt PDF", () => {
  test("customer can download a branded PDF", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({
      customer,
      jobStatus: "completed",
      price: 150,
    });
    job.payment_status = "paid";
    job.payment_method = "cash";
    await job.save();
    const receipt = await Receipt.create({
      job_id: job._id,
      customer_id: customer._id,
      technician_id: job.assignedTechnician,
      total_amount: 150,
      payment_status: "paid",
      items: [{ description: "Flat tire", quantity: 1, price: 150 }],
    });

    const json = await request(techApp)
      .get(`/api/receipts/job/${job._id}`)
      .set(bearer(customerToken(customer._id)));
    expect(json.status).toBe(200);
    expect(json.body.receipt.pdf_url).toBe(`/api/receipts/${receipt._id}/download`);

    const pdf = await request(techApp)
      .get(`/api/receipts/${receipt._id}/download`)
      .set(bearer(customerToken(customer._id)));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/pdf/);
    expect(pdf.body.toString("utf8", 0, 5)).toBe("%PDF-");
    expect(pdf.body.toString("latin1")).toMatch(/Sanadcom/);
    expect(pdf.body.toString("latin1")).toMatch(/Sanad RSA/);
    expect(pdf.body.toString("latin1")).toMatch(/Customer/);

    const byJob = await request(techApp)
      .get(`/api/receipts/job/${job._id}/download`)
      .set(bearer(customerToken(customer._id)));
    expect(byJob.status).toBe(200);
    expect(byJob.body.toString("utf8", 0, 5)).toBe("%PDF-");
  });
});

describe("customer cash payment", () => {
  test("customer can choose cash without marking the job paid", async () => {
    const customer = await seedCustomer();
    const job = await seedCustomerJob({
      customer,
      jobStatus: "in_progress",
      price: 150,
    });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/pay-cash`)
      .set(bearer(customerToken(customer._id)))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.payment_method).toBe("cash");
    expect(res.body.payment_status).toBe("unpaid");

    const fresh = await Job.findById(job._id);
    expect(fresh.payment_method).toBe("cash");
    expect(fresh.payment_status).toBe("unpaid");
  });

  test("rejects cash when price is not set", async () => {
    const customer = await seedCustomer();
    const tech = await seedTechnician();
    const source = await seedSource();
    const job = await Job.create({
      customer_id: customer._id,
      clientName: "Test Client",
      clientMobileNumber: customer.phone_number,
      issue: "Flat tire",
      location: "25.2854,51.531",
      locationCoordinates: { type: "Point", coordinates: [51.531, 25.2854] },
      dateTime: new Date(),
      jobType: "Flat tire",
      assignedTechnician: tech._id,
      source: source._id,
      job_status: "in_progress",
      payment_status: "unpaid",
    });

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/pay-cash`)
      .set(bearer(customerToken(customer._id)))
      .send();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PRICE_NOT_SET");
  });
});
