/**
 * WS-H (scenario 100): a customer's Contact Us request reaches ops, ops can
 * reply, and the customer sees the reply.
 */
const request = require("supertest");

jest.mock("../../clicks-admin-api/src/utils/techApiNotify", () => ({
  postToTechApi: jest.fn(async () => true),
}));
const { postToTechApi } = require("../../clicks-admin-api/src/utils/techApiNotify");

const { ContactUs, Notification, AdminAuditLog } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { seedCustomer, seedAdmin, seedTechnician } = require("../helpers/seed");
const { customerToken, adminToken, technicianToken, bearer } = require("../helpers/tokens");

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
  postToTechApi.mockClear();
});

async function submit(customer, body) {
  return request(techApp)
    .post("/api/contact-us")
    .set(bearer(customerToken(customer._id)))
    .send(body);
}

test("customer submit returns a ticket number, stores a category code and writes the inbox", async () => {
  const customer = await seedCustomer();
  // Older builds send the translated label; Arabic must map to the same code.
  const res = await submit(customer, { issue: "خلاف مع الفني", description: "The technician was rude to me." });
  expect(res.status).toBe(201);
  expect(res.body.ticket_number).toMatch(/^CU-\d{6}$/);
  expect(res.body.contactUs.category).toBe("technician_dispute");

  const second = await submit(customer, { category: "billing", description: "I was charged twice for one job." });
  expect(second.body.ticket_number).not.toBe(res.body.ticket_number);

  const inbox = await Notification.find({ audience: "customer", customer_id: customer._id });
  expect(inbox).toHaveLength(2);
  expect(inbox[0].data.kind).toBe("support_ticket");
  const adminInbox = await Notification.countDocuments({ audience: "admin", type: "support_ticket.new" });
  expect(adminInbox).toBe(2);
});

test("ops can list, filter, read, update and reply; the customer sees the reply", async () => {
  await seedAdmin({ role: "Job Dispatcher" });
  const customer = await seedCustomer();
  const created = await submit(customer, { category: "technical_issue", description: "App froze on payment." });
  await submit(customer, { category: "general_inquiry", description: "Do you cover Al Khor?" });
  const id = created.body.contactUs.id;
  const ops = bearer(adminToken("Job Dispatcher"));

  const list = await request(adminApp).get("/api/contact-us").set(ops);
  expect(list.status).toBe(200);
  expect(list.body.total).toBe(2);
  expect(list.body.tickets[0].customer.phone_number).toBe(customer.phone_number);

  const filtered = await request(adminApp).get("/api/contact-us?category=technical_issue").set(ops);
  expect(filtered.body.tickets).toHaveLength(1);

  const bySearch = await request(adminApp)
    .get(`/api/contact-us?search=${created.body.ticket_number}`)
    .set(ops);
  expect(bySearch.body.tickets).toHaveLength(1);

  const detail = await request(adminApp).get(`/api/contact-us/${id}`).set(ops);
  expect(detail.status).toBe(200);
  expect(detail.body.ticket.description).toBe("App froze on payment.");

  const patch = await request(adminApp)
    .patch(`/api/contact-us/${id}`)
    .set(ops)
    .send({ status: "in_progress", assigned_to: "507f1f77bcf86cd799439011" });
  expect(patch.status).toBe(200);
  expect(patch.body.ticket.status).toBe("in_progress");

  const reply = await request(adminApp)
    .post(`/api/contact-us/${id}/replies`)
    .set(ops)
    .send({ message: "Sorry about that — fixed in the next update.", status: "resolved" });
  expect(reply.status).toBe(201);
  expect(reply.body.ticket.status).toBe("resolved");
  expect(reply.body.ticket.reply_count).toBe(1);

  // Admin API tells the tech API to notify the customer.
  expect(postToTechApi).toHaveBeenCalledWith(
    "/api/contact-us/internal/notify",
    expect.objectContaining({ ticket_id: String(id), kind: "reply" })
  );
  expect(await AdminAuditLog.countDocuments({ action: /^contact_us\./ })).toBe(2);

  const mine = await request(techApp)
    .get("/api/contact-us")
    .set(bearer(customerToken(customer._id)));
  const ticket = mine.body.requests.find((r) => String(r.id) === String(id));
  expect(ticket.status).toBe("resolved");
  expect(ticket.replies[0].message).toMatch(/fixed/);
  expect(ticket.replies[0].author_type).toBe("admin");
});

test("the internal notify writes the customer's inbox", async () => {
  const customer = await seedCustomer();
  const created = await submit(customer, { category: "billing", description: "Refund please, thanks." });
  const res = await request(techApp)
    .post("/api/contact-us/internal/notify")
    .set("x-internal-secret", process.env.INTERNAL_API_SECRET)
    .send({ ticket_id: created.body.contactUs.id, kind: "reply", message: "Refund issued" });
  expect(res.status).toBe(200);
  expect(
    await Notification.countDocuments({ customer_id: customer._id, type: "support_ticket_reply" })
  ).toBe(1);
});

describe("RBAC", () => {
  test("customer and technician tokens cannot use the admin endpoints", async () => {
    const customer = await seedCustomer();
    const tech = await seedTechnician();
    const asCustomer = await request(adminApp)
      .get("/api/contact-us")
      .set(bearer(customerToken(customer._id)));
    expect([401, 403]).toContain(asCustomer.status);
    const asTech = await request(adminApp)
      .get("/api/contact-us")
      .set(bearer(technicianToken(tech._id)));
    expect([401, 403]).toContain(asTech.status);
  });

  test("an admin token cannot read another customer's tickets via the customer API", async () => {
    const owner = await seedCustomer();
    const other = await seedCustomer({ phone_number: "+97455599002", email: "o2@test.local" });
    const created = await submit(owner, { category: "billing", description: "Private complaint text." });
    const res = await request(techApp)
      .get(`/api/contact-us/${created.body.contactUs.id}`)
      .set(bearer(customerToken(other._id)));
    expect(res.status).toBe(404);
  });

  test("invalid status / reply validation", async () => {
    await seedAdmin();
    const customer = await seedCustomer();
    const created = await submit(customer, { category: "billing", description: "Something here." });
    const ops = bearer(adminToken("Super Admin"));
    expect(
      (await request(adminApp).patch(`/api/contact-us/${created.body.contactUs.id}`).set(ops).send({ status: "deleted" })).status
    ).toBe(400);
    expect(
      (await request(adminApp).post(`/api/contact-us/${created.body.contactUs.id}/replies`).set(ops).send({ message: "" })).status
    ).toBe(400);
    expect(await ContactUs.countDocuments({})).toBe(1);
  });
});
