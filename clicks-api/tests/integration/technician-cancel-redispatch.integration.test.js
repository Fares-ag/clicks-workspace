/**
 * Scenario 48: a technician who cancels mid-job hands it back for
 * re-dispatch — the job returns to pending with no technician, the SOS stays
 * linked, admins are alerted and the customer hears "finding another
 * technician".
 */
const request = require("supertest");
const { Job, SOSRequest, Technician } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  connectSocket,
  waitForEvent,
  listenServer,
  closeServer,
  disconnectAll,
} = require("../helpers/socket");
const {
  seedAdmin,
  seedCustomer,
  seedCustomerJob,
  seedTechnician,
  JOB_LAT,
  JOB_LNG,
} = require("../helpers/seed");
const { adminToken, customerToken, technicianToken, bearer } = require("../helpers/tokens");

let app;
let server;
let baseUrl;
const openSockets = [];
const ADMIN_ID = "507f1f77bcf86cd799439031";

beforeAll(async () => {
  await connectTestDb();
  const { createTechAppWithSocket } = require("../../clicks-customer-tech-api/src/createApp");
  ({ app, server } = await createTechAppWithSocket());
  ({ baseUrl } = await listenServer(server));
});

afterAll(async () => {
  disconnectAll(openSockets);
  await closeServer(server);
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
});

async function connectAndRegister(namespace, token) {
  const socket = await connectSocket({ baseUrl, namespace, token });
  openSockets.push(socket);
  socket.emit("register");
  await new Promise((r) => setTimeout(r, 50));
  return socket;
}

test("technician cancel on an SOS job -> pending, SOS linked, customer + admin told", async () => {
  await seedAdmin({ _id: ADMIN_ID });
  const customer = await seedCustomer();
  const technician = await seedTechnician({ currentStatus: "On Job" });
  const job = await seedCustomerJob({ customer, technician, jobStatus: "en_route" });
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "accepted",
    job_id: job._id,
    assigned_technician: technician._id,
  });
  job.sos_request_id = sos._id;
  await job.save();

  const customerSocket = await connectAndRegister("/customer", customerToken(customer._id));
  const adminSocket = await connectAndRegister("/admin", adminToken("Super Admin", ADMIN_ID));
  const customerEvent = waitForEvent(customerSocket, "jobReassigning", 10000);
  const adminEvent = waitForEvent(adminSocket, "jobNeedsRedispatch", 10000);

  const res = await request(app)
    .post(`/api/jobs/${job._id}/cancel`)
    .set(bearer(technicianToken(technician._id)))
    .send({ reason: "Truck broke down" });

  expect(res.status).toBe(200);
  expect(res.body.redispatch).toBe(true);
  expect(res.body.job_status).toBe("pending");

  const stored = await Job.findById(job._id).lean();
  expect(stored.job_status).toBe("pending");
  expect(stored.assignedTechnician).toBeNull();
  expect(stored.reassignment_history.at(-1).reason).toBe("technician_cancelled");
  expect(String(stored.reassignment_history.at(-1).from_technician)).toBe(
    String(technician._id)
  );

  const storedSos = await SOSRequest.findById(sos._id).lean();
  expect(storedSos.status).toBe("accepted");
  expect(String(storedSos.job_id)).toBe(String(job._id));

  const fromCustomer = await customerEvent;
  expect(fromCustomer.job_id).toBe(String(job._id));
  expect(fromCustomer.status).toBe("pending");
  const fromAdmin = await adminEvent;
  expect(fromAdmin.job_id).toBe(String(job._id));

  const tech = await Technician.findById(technician._id).lean();
  expect(tech.currentStatus).toBe("Online");
});

test("the re-dispatched job is visible to the customer as a pending job", async () => {
  const customer = await seedCustomer();
  const technician = await seedTechnician({ currentStatus: "On Job" });
  const job = await seedCustomerJob({ customer, technician, jobStatus: "arrived" });

  await request(app)
    .post(`/api/jobs/${job._id}/cancel`)
    .set(bearer(technicianToken(technician._id)))
    .send({ reason: "Accident on the way" })
    .expect(200);

  const session = await request(app)
    .get("/api/jobs/customer/session")
    .set(bearer(customerToken(customer._id)));
  expect(session.status).toBe(200);
  expect(session.body.session_kind).toBe("pending");
  expect(String(session.body.live_job._id)).toBe(String(job._id));
});

test("a paid job cannot be handed back", async () => {
  const customer = await seedCustomer();
  const technician = await seedTechnician({ currentStatus: "On Job" });
  const job = await seedCustomerJob({ customer, technician, jobStatus: "in_progress" });
  job.payment_status = "paid";
  await job.save();

  const res = await request(app)
    .post(`/api/jobs/${job._id}/cancel`)
    .set(bearer(technicianToken(technician._id)))
    .send({ reason: "nope" });
  expect(res.status).toBe(400);
  expect((await Job.findById(job._id)).job_status).toBe("in_progress");
});
