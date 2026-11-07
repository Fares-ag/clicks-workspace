/**
 * Scenario 43: the customer cancels at the same moment the dispatcher
 * creates the job. Whichever lands second must fail, and the final state
 * must be consistent: either (SOS cancelled, no job) or (SOS accepted with
 * exactly one job, cancel refused with SOS_JOB_CREATED).
 */
const request = require("supertest");
const { Job, SOSRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const { connectSocket, listenServer, closeServer, disconnectAll } = require("../helpers/socket");
const { seedAdmin, seedCustomer, seedSource, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, customerToken, bearer } = require("../helpers/tokens");

let adminApp;
let server;
let baseUrl;
const openSockets = [];
const ADMIN_ID = "507f1f77bcf86cd799439071";

beforeAll(async () => {
  await connectTestDb();
  await SOSRequest.init();
  adminApp = require("../../clicks-admin-api/src/createApp").createAdminApp();
  const { createTechAppWithSocket } = require("../../clicks-customer-tech-api/src/createApp");
  ({ server } = await createTechAppWithSocket());
  ({ baseUrl } = await listenServer(server));
});

afterAll(async () => {
  disconnectAll(openSockets);
  await closeServer(server);
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearCollections();
  await seedAdmin({ _id: ADMIN_ID, role: "Job Dispatcher" });
});

async function race(customer, source) {
  const sos = await SOSRequest.create({
    customer_id: customer._id,
    location: { type: "Point", coordinates: [JOB_LNG, JOB_LAT] },
    status: "in_call",
    claimed_by: ADMIN_ID,
    claimed_at: new Date(),
  });
  const sock = await connectSocket({
    baseUrl,
    namespace: "/customer",
    token: customerToken(customer._id),
  });
  openSockets.push(sock);

  const [createRes, cancelAck] = await Promise.all([
    request(adminApp)
      .post("/api/jobs")
      .set(bearer(adminToken("Job Dispatcher", ADMIN_ID)))
      .send({
        customer_id: String(customer._id),
        clientName: "Race",
        clientMobileNumber: customer.phone_number,
        issue: "Flat tyre",
        location: "typed",
        dateTime: new Date().toISOString(),
        jobType: "Flat tire",
        source: String(source._id),
        sos_request_id: String(sos._id),
      }),
    sock.timeout(10000).emitWithAck("cancelSOS", {
      sos_id: String(sos._id),
      reason: "no_longer_needed",
    }),
  ]);
  sock.disconnect();
  return { sos, createRes, cancelAck };
}

test("racing cancel and job creation always end consistent", async () => {
  const source = await seedSource();
  const outcomes = new Set();

  for (let i = 0; i < 6; i += 1) {
    const customer = await seedCustomer({
      phone_number: `+9745007${String(i).padStart(4, "0")}`,
      email: `race-${i}-${Date.now()}@test.local`,
    });
    const { sos, createRes, cancelAck } = await race(customer, source);
    const stored = await SOSRequest.findById(sos._id).lean();
    const jobs = await Job.find({ sos_request_id: sos._id }).lean();

    if (stored.status === "cancelled") {
      outcomes.add("cancel-won");
      expect(cancelAck.ok).toBe(true);
      expect(createRes.status).toBe(409);
      expect(jobs).toHaveLength(0);
      expect(stored.job_id).toBeFalsy();
    } else {
      outcomes.add("create-won");
      expect(stored.status).toBe("accepted");
      expect(createRes.status).toBe(201);
      expect(jobs).toHaveLength(1);
      expect(String(stored.job_id)).toBe(String(jobs[0]._id));
      expect(cancelAck.ok).toBe(false);
      expect(cancelAck.code).toBe("SOS_JOB_CREATED");
    }
  }
  expect(outcomes.size).toBeGreaterThanOrEqual(1);
});
