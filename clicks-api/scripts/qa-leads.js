#!/usr/bin/env node
/**
 * Lead → Job pipeline QA (admin-api + optional customer SR auto-lead).
 *
 * Usage:
 *   node scripts/qa-leads.js
 *
 * Env:
 *   ADMIN_URL         default http://localhost:5000
 *   TECH_URL          default http://localhost:5001
 *   ADMIN_EMAIL       default admin@clicks.local
 *   ADMIN_PASSWORD    default Admin123!
 *   CUSTOMER_EMAIL    default customer@clicks.local
 *   CUSTOMER_PASSWORD default Customer123!
 */
const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const TECH_URL = (process.env.TECH_URL || "http://localhost:5001").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const CUSTOMER_EMAIL = process.env.CUSTOMER_EMAIL || "customer@clicks.local";
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || "Customer123!";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;

let passed = 0;
let failed = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}

async function json(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function loginAdmin() {
  const r = await json("POST", `${ADMIN_URL}/api/auth/login`, {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) {
    throw new Error(`Admin login failed (${r.status})`);
  }
  return token;
}

async function loginCustomer() {
  const r = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
  });
  const token = r.data?.token || r.data?.accessToken;
  if (r.status !== 200 || !token) {
    throw new Error(`Customer login failed (${r.status}): ${JSON.stringify(r.data).slice(0, 120)}`);
  }
  return token;
}

async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  const list = r.data?.sources || [];
  return list[0]?._id;
}

async function main() {
  console.log(`ADMIN_URL=${ADMIN_URL}`);
  console.log(`TECH_URL=${TECH_URL}\n`);

  let adminToken;
  try {
    adminToken = await loginAdmin();
    step("admin login", true);
  } catch (e) {
    step("admin login", false, e.message);
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  const unauth = await json("GET", `${ADMIN_URL}/api/leads`);
  step("unauthenticated leads → 401", unauth.status === 401, `status=${unauth.status}`);

  const sourceId = await findSourceId(adminToken);
  if (!sourceId) {
    step("find source", false, "no sources — run seed-demo-data.js");
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  step("find source", true, sourceId);

  const phoneSuffix = String(Date.now()).slice(-7);
  const createR = await json("POST", `${ADMIN_URL}/api/leads`, {
    token: adminToken,
    body: {
      clientName: "QA Lead Customer",
      clientMobileNumber: `555${phoneSuffix}`,
      inquiry: "QA tire inquiry — needs quote",
      source: sourceId,
      subSource: "phone",
    },
  });
  const leadId = createR.data?.lead?.lead_id || createR.data?.lead?._id;
  step(
    "create lead",
    createR.status === 201 && createR.data?.lead?.status === "new",
    `id=${leadId}`
  );

  const listR = await json("GET", `${ADMIN_URL}/api/leads?status=new&search=QA Lead`, {
    token: adminToken,
  });
  const found = (listR.data?.leads || []).some(
    (l) => (l.lead_id || l._id) === leadId
  );
  step("list leads filter", listR.status === 200 && found, `count=${listR.data?.leads?.length}`);

  const patchR = await json("PATCH", `${ADMIN_URL}/api/leads/${leadId}`, {
    token: adminToken,
    body: { status: "contacted" },
  });
  step("patch contacted", patchR.status === 200 && patchR.data?.lead?.status === "contacted");

  await json("PATCH", `${ADMIN_URL}/api/leads/${leadId}`, {
    token: adminToken,
    body: { status: "qualified" },
  });

  const badConvert = await json("POST", `${ADMIN_URL}/api/leads/${leadId}/convert`, {
    token: adminToken,
    body: { issue: "missing fields" },
  });
  step("reject convert missing fields", badConvert.status === 400, `status=${badConvert.status}`);

  const now = new Date();
  now.setHours(now.getHours() + 2);
  const location = `LatLng(${JOB_LAT}, ${JOB_LNG})`;
  const convertR = await json("POST", `${ADMIN_URL}/api/leads/${leadId}/convert`, {
    token: adminToken,
    body: {
      location,
      dateTime: now.toISOString(),
      jobType: "Tires",
      price: 200,
      issue: "QA converted job from lead",
    },
  });
  const jobId = convertR.data?.job?._id;
  const leadConverted = convertR.data?.lead?.status === "converted";
  step(
    "convert lead → job",
    convertR.status === 201 && jobId && leadConverted,
    `job=${jobId}`
  );

  const jobR = await json("GET", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
  const hasLeadId = jobR.data?.job?.lead_id != null;
  step("job has lead_id", jobR.status === 200 && hasLeadId);

  const doubleConvert = await json("POST", `${ADMIN_URL}/api/leads/${leadId}/convert`, {
    token: adminToken,
    body: {
      location,
      dateTime: now.toISOString(),
      jobType: "Tires",
      price: 200,
      issue: "should fail",
    },
  });
  step("reject double convert", doubleConvert.status === 400, `status=${doubleConvert.status}`);

  const lostLeadR = await json("POST", `${ADMIN_URL}/api/leads`, {
    token: adminToken,
    body: {
      clientName: "QA Lost Lead",
      clientMobileNumber: `556${phoneSuffix}`,
      inquiry: "Will be marked lost",
      source: sourceId,
    },
  });
  const lostLeadId = lostLeadR.data?.lead?.lead_id || lostLeadR.data?.lead?._id;
  step(
    "create second lead for lost test",
    lostLeadR.status === 201 && lostLeadId,
    `status=${lostLeadR.status}`
  );

  if (!lostLeadId) {
    console.log("\nResults: aborted — could not create second lead");
    process.exit(1);
  }

  const lostR = await json("POST", `${ADMIN_URL}/api/leads/${lostLeadId}/lost`, {
    token: adminToken,
    body: { lost_reason: "no answer" },
  });
  step("mark lost", lostR.status === 200 && lostR.data?.lead?.status === "lost", lostR.status !== 200 ? `status=${lostR.status}` : "");

  const convertLost = await json("POST", `${ADMIN_URL}/api/leads/${lostLeadId}/convert`, {
    token: adminToken,
    body: {
      location,
      dateTime: now.toISOString(),
      jobType: "Tires",
      price: 100,
      issue: "should fail",
    },
  });
  step("reject convert lost lead", convertLost.status === 400, `status=${convertLost.status}`);

  const openR = await json("GET", `${ADMIN_URL}/api/leads?open=1`, { token: adminToken });
  const openHasConverted = (openR.data?.leads || []).some(
    (l) => (l.lead_id || l._id) === leadId
  );
  step(
    "open list excludes converted",
    openR.status === 200 && !openHasConverted,
    `openCount=${openR.data?.openCount}`
  );

  // Service request → auto lead (if customer login works)
  try {
    const customerToken = await loginCustomer();
    step("customer login", true);

    const srR = await json("POST", `${TECH_URL}/api/service-requests`, {
      token: customerToken,
      body: {
        latitude: JOB_LAT,
        longitude: JOB_LNG,
        service_type: "Flat tire",
        timing: "immediate",
        skip_vehicle: true,
      },
    });
    const srId =
      srR.data?.service_request?.id ||
      srR.data?.service_request?._id ||
      srR.data?.service_request?.service_request_id;
    step("create service request", srR.status === 201 && srId, `sr=${srId}`);

    if (srId) {
      await new Promise((r) => setTimeout(r, 500));
      const leadBySr = await json(
        "GET",
        `${ADMIN_URL}/api/leads/by-service-request/${srId}`,
        { token: adminToken }
      );
      const srLeadId = leadBySr.data?.lead?.lead_id || leadBySr.data?.lead?._id;
      step(
        "SR auto-created lead",
        leadBySr.status === 200 && srLeadId,
        `lead=${srLeadId}`
      );

      if (srLeadId) {
        const srConvert = await json("POST", `${ADMIN_URL}/api/leads/${srLeadId}/convert`, {
          token: adminToken,
          body: {
            location,
            dateTime: now.toISOString(),
            jobType: "Tires",
            price: 175,
            issue: "SR flat tire conversion QA",
          },
        });
        const srJobId = srConvert.data?.job?._id;
        step(
          "convert SR lead → job",
          srConvert.status === 201 && srJobId,
          `job=${srJobId}`
        );

        const srCheck = await json("GET", `${ADMIN_URL}/api/service-requests/${srId}`, {
          token: adminToken,
        });
        step(
          "SR assigned after convert",
          srCheck.data?.request?.status === "assigned" &&
            srCheck.data?.request?.job_id != null,
          `status=${srCheck.data?.request?.status}`
        );
      }
    }
  } catch (e) {
    step("customer/SR path", false, e.message);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
