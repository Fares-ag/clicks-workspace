/**
 * Scenario 91 (decision): a customer who owes money on an old job may still
 * raise an SOS. The SOS records the outstanding balance and job ids, and the
 * admin broadcast carries them so dispatch can collect.
 */
const { RepairProcedure, SOSRequest } = require("../../clicks-shared/models");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  connectSocket,
  waitForEvent,
  listenServer,
  closeServer,
  disconnectAll,
} = require("../helpers/socket");
const { seedAdmin, seedCustomer, seedCustomerJob, JOB_LAT, JOB_LNG } = require("../helpers/seed");
const { adminToken, customerToken } = require("../helpers/tokens");
const { assertCustomerCanCreateSos } = require("../../clicks-shared/utils/customerBookingGuard");

let server;
let baseUrl;
const openSockets = [];
const ADMIN_ID = "507f1f77bcf86cd799439051";

beforeAll(async () => {
  await connectTestDb();
  await SOSRequest.init();
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
});

async function connectAndRegister(namespace, token) {
  const socket = await connectSocket({ baseUrl, namespace, token });
  openSockets.push(socket);
  socket.emit("register");
  await new Promise((r) => setTimeout(r, 50));
  return socket;
}

test("unpaid completed job does not block SOS; balance is stamped and broadcast", async () => {
  await seedAdmin({ _id: ADMIN_ID });
  const customer = await seedCustomer();
  const unpaid = await seedCustomerJob({ customer, jobStatus: "completed", price: 120 });
  unpaid.payment_status = "unpaid";
  await unpaid.save();
  await RepairProcedure.create({
    job_id: unpaid._id,
    technician_id: unpaid.assignedTechnician,
    name: "Battery",
    description: "Battery replacement",
    price: 30,
    cost: 10,
    quantity: 1,
  });

  await expect(
    assertCustomerCanCreateSos({ customerId: customer._id, skipVehicle: true })
  ).resolves.toBe(true);

  const customerSocket = await connectAndRegister("/customer", customerToken(customer._id));
  const adminSocket = await connectAndRegister("/admin", adminToken("Super Admin", ADMIN_ID));
  const broadcast = waitForEvent(adminSocket, "newSOSRequest", 10000);

  const ack = await customerSocket.timeout(10000).emitWithAck("createSOS", {
    latitude: JOB_LAT,
    longitude: JOB_LNG,
    skip_vehicle: true,
    client_request_id: "owes-money",
  });
  expect(ack.ok).toBe(true);

  const expected = 150; // price 120 + repair 30
  expect(ack.outstanding_balance).toBe(expected);
  expect(ack.outstanding_job_ids).toEqual([String(unpaid._id)]);

  const sos = await SOSRequest.findById(ack.sos_id).lean();
  expect(sos.outstanding_balance).toBe(expected);
  expect(sos.outstanding_job_ids.map(String)).toEqual([String(unpaid._id)]);

  const fromAdmin = await broadcast;
  expect(fromAdmin.outstanding_balance).toBe(expected);
});
