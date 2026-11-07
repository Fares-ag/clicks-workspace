const request = require("supertest");
const { connectTestDb, disconnectTestDb, clearCollections } = require("../helpers/db");
const {
  seedTechnician,
  seedAdmin,
  seedCustomer,
  seedCustomerJob,
} = require("../helpers/seed");
const { technicianToken, adminToken, customerToken, bearer } = require("../helpers/tokens");

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
  await seedAdmin();
});

describe("Job garage phase", () => {
  test("technician can send a live job to the garage", async () => {
    const tech = await seedTechnician();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({
      customer,
      technician: tech,
      jobStatus: "in_progress",
    });
    const token = technicianToken(tech._id);

    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/garage`)
      .set(bearer(token))
      .send({
        reason: "Needs gearbox",
        garage_name: "Clicks Doha",
        expected_ready_at: "2026-10-28T10:00:00.000Z",
      });

    expect(res.status).toBe(200);
    expect(res.body.job.job_status).toBe("on_hold");
    expect(res.body.job.garage.phase).toBe("at_garage");
    expect(res.body.job.garage.name).toBe("Clicks Doha");
    expect(res.body.job.hold_reason).toBe("Needs gearbox");
  });

  test("technician POST /hold is still unavailable", async () => {
    const tech = await seedTechnician();
    const job = await seedCustomerJob({ technician: tech, jobStatus: "accepted" });
    const res = await request(techApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(technicianToken(tech._id)))
      .send({ reason: "Nope" });
    expect(res.status).toBe(404);
  });

  test("admin garage ready returns accepted, not in_progress", async () => {
    const tech = await seedTechnician();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({
      customer,
      technician: tech,
      jobStatus: "in_progress",
    });

    const send = await request(adminApp)
      .post(`/api/jobs/${job._id}/garage`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Workshop", garage_name: "Clicks" });
    expect(send.status).toBe(200);
    expect(send.body.job.garage.phase).toBe("at_garage");

    const ready = await request(adminApp)
      .post(`/api/jobs/${job._id}/garage/ready`)
      .set(bearer(adminToken("Super Admin")))
      .send({});
    expect(ready.status).toBe(200);
    expect(ready.body.job.job_status).toBe("accepted");
    expect(ready.body.job.garage.phase).toBe("returning");
  });

  test("generic resume is blocked while at garage", async () => {
    const tech = await seedTechnician();
    const job = await seedCustomerJob({ technician: tech, jobStatus: "arrived" });
    await request(adminApp)
      .post(`/api/jobs/${job._id}/garage`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Parts" });

    const resume = await request(adminApp)
      .post(`/api/jobs/${job._id}/resume`)
      .set(bearer(adminToken("Super Admin")))
      .send({});
    expect(resume.status).toBe(400);
    expect(resume.body.message).toMatch(/garage ready/i);
  });

  test("generic hold and resume still work without a garage phase", async () => {
    const tech = await seedTechnician();
    const job = await seedCustomerJob({ technician: tech, jobStatus: "accepted" });

    const hold = await request(adminApp)
      .post(`/api/jobs/${job._id}/hold`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Waiting on customer" });
    expect(hold.status).toBe(200);
    expect(hold.body.job.job_status).toBe("on_hold");
    expect(hold.body.job.garage?.phase == null || hold.body.job.garage?.phase === undefined).toBe(true);

    const resume = await request(adminApp)
      .post(`/api/jobs/${job._id}/resume`)
      .set(bearer(adminToken("Super Admin")))
      .send({});
    expect(resume.status).toBe(200);
    expect(resume.body.job.job_status).toBe("accepted");
  });

  test("customer session is at_garage and booking stays blocked", async () => {
    const tech = await seedTechnician();
    const customer = await seedCustomer();
    const job = await seedCustomerJob({
      customer,
      technician: tech,
      jobStatus: "en_route",
    });

    await request(adminApp)
      .post(`/api/jobs/${job._id}/garage`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Taken to workshop" });

    const session = await request(techApp)
      .get("/api/jobs/customer/session")
      .set(bearer(customerToken(customer._id)));
    expect(session.status).toBe(200);
    expect(session.body.session_kind).toBe("at_garage");
    expect(session.body.can_book_sos).toBe(true);
    expect(session.body.live_job.garage.phase).toBe("at_garage");

    const booking = await request(techApp)
      .post("/api/service-requests")
      .set(bearer(customerToken(customer._id)))
      .send({
        service_type: "Battery Change",
        timing: "immediate",
        latitude: 25.2854,
        longitude: 51.531,
        skip_vehicle: true,
      });
    expect(booking.status).toBe(409);
    expect(booking.body.code).toBe("LIVE_JOB_ACTIVE");
  });

  test("admin list filters garage=at_garage", async () => {
    const tech = await seedTechnician();
    const garageJob = await seedCustomerJob({ technician: tech, jobStatus: "in_progress" });
    const holdJob = await seedCustomerJob({ jobStatus: "accepted" });

    await request(adminApp)
      .post(`/api/jobs/${garageJob._id}/garage`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Workshop" });
    await request(adminApp)
      .post(`/api/jobs/${holdJob._id}/hold`)
      .set(bearer(adminToken("Super Admin")))
      .send({ reason: "Weather" });

    const list = await request(adminApp)
      .get("/api/jobs?garage=at_garage&limit=20")
      .set(bearer(adminToken("Super Admin")));
    expect(list.status).toBe(200);
    const ids = (list.body.jobs || []).map((j) => String(j._id));
    expect(ids).toContain(String(garageJob._id));
    expect(ids).not.toContain(String(holdJob._id));
  });
});
