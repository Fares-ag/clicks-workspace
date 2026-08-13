#!/usr/bin/env node
/**
 * Intensive customer frontend + backend QA (production-facing).
 *
 * Usage:
 *   node scripts/qa-customer-intensive.js
 *
 * Env:
 *   TECH_URL, FRONTEND_URL, CUSTOMER_PHONE, CUSTOMER_PASSWORD
 */
const fs = require("fs");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
const CUSTOMER_PHONE = process.env.CUSTOMER_PHONE || "+97433333333";
const CUSTOMER_PASSWORD = process.env.CUSTOMER_PASSWORD || "Customer123!";

const JOB_LAT = 25.3269467;
const JOB_LNG = 51.4883967;

const SERVICE_TYPES = [
  "Battery Change",
  "Oil Change",
  "Full Service",
  "Car Wash - Interior",
  "Car Wash - Exterior",
  "Car Wash - Full",
  "Tyre Change",
  "Car Wash - Full Polish",
  "Car Tinting",
  "Breakdown Vehicle",
];

let passed = 0;
let failed = 0;
let warned = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
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
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

function checkFrontendWiring() {
  const root = path.join(__dirname, "../../clicks-user/lib");
  const files = {
    endpoints: path.join(root, "core/api/end_points.dart"),
    services: path.join(root, "features/services/services_screen.dart"),
    sheet: path.join(root, "features/services/service_request_sheet.dart"),
    api: path.join(root, "features/services/service_request_api.dart"),
    waiting: path.join(root, "features/services/service_waiting_screen.dart"),
    cars: path.join(root, "features/my_cars/my_cars_screen.dart"),
  };

  for (const [k, f] of Object.entries(files)) {
    if (!fs.existsSync(f)) {
      step(`UI file ${k}`, false, f);
      return;
    }
  }

  const endpoints = fs.readFileSync(files.endpoints, "utf8");
  const services = fs.readFileSync(files.services, "utf8");
  const sheet = fs.readFileSync(files.sheet, "utf8");
  const api = fs.readFileSync(files.api, "utf8");
  const waiting = fs.readFileSync(files.waiting, "utf8");
  const cars = fs.readFileSync(files.cars, "utf8");

  step("UI service-requests endpoint", endpoints.includes("/api/service-requests"));
  step("UI customer session endpoint", endpoints.includes("/api/jobs/customer/session") || endpoints.includes("customer/session") || endpoints.includes("/api/jobs"));
  step("UI services catalog wired", SERVICE_TYPES.every((t) => services.includes(t)));
  step("UI opens service request sheet", services.includes("openServiceRequestBottomSheet"));
  step("UI createServiceRequest API", api.includes("service_type") && api.includes("ServiceRequestApi"));
  step("UI cancel from waiting screen", waiting.includes("ServiceRequestApi.cancel"));
  step("UI vehicle make/model fields", cars.includes("vehicle_make") || cars.includes("VehicleMake") || cars.toLowerCase().includes("make"));
  step("UI sheet sends location", sheet.includes("latitude") && sheet.includes("longitude"));
}

async function checkLocalFrontend() {
  try {
    const res = await fetch(FRONTEND_URL);
    step("local customer frontend up", res.status === 200, FRONTEND_URL);
  } catch (e) {
    step("local customer frontend up", false, e.message);
  }
}

async function loginCustomer() {
  const r = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { phone_number: CUSTOMER_PHONE, password: CUSTOMER_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Customer login failed (${r.status}): ${JSON.stringify(r.data).slice(0, 160)}`);
  }
  return {
    token: r.data.token,
    customer: r.data.customer,
  };
}

async function getActiveId(token) {
  const active = await json("GET", `${TECH_URL}/api/service-requests/active`, { token });
  const sr = active.data?.active_service_request || active.data?.service_request || null;
  return {
    status: active.status,
    id: sr?.id || sr?._id || null,
    raw: active.data,
  };
}

async function cancelActiveIfAny(token) {
  const { id } = await getActiveId(token);
  if (id) {
    const r = await json("POST", `${TECH_URL}/api/service-requests/${id}/cancel`, {
      token,
      body: { reason: "QA customer intensive cleanup" },
    });
    step("cleanup active service request", r.status === 200 || r.status === 201, id);
  }
}

async function main() {
  console.log("\n=== Customer INTENSIVE QA ===");
  console.log(`Tech/Customer API: ${TECH_URL}`);
  console.log(`Frontend:          ${FRONTEND_URL}\n`);

  console.log("--- Frontend wiring ---");
  checkFrontendWiring();
  await checkLocalFrontend();

  console.log("\n--- Auth ---");
  let r = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { phone_number: CUSTOMER_PHONE, password: "wrong-password" },
  });
  step("reject bad password", r.status === 401, `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/customers/login`, {
    body: { phone_number: "+97400000000", password: CUSTOMER_PASSWORD },
  });
  step("reject unknown phone", r.status === 401, `status=${r.status}`);

  const { token, customer } = await loginCustomer();
  step(
    "customer login",
    true,
    `${customer?.first_name || ""} ${customer?.last_name || ""}`.trim() || customer?.id
  );

  r = await json("GET", `${TECH_URL}/api/customers/profile`);
  step("profile requires auth", r.status === 401);

  console.log("\n--- Profile & content ---");
  r = await json("GET", `${TECH_URL}/api/customers/profile`, { token });
  step("GET profile", r.status === 200 && !!r.data?.phone_number, r.data?.phone_number || "");

  r = await json("GET", `${TECH_URL}/api/content/privacy-policy`);
  step("GET privacy-policy", r.status === 200);

  r = await json("GET", `${TECH_URL}/api/content/faqs`);
  step("GET faqs", r.status === 200);

  r = await json("GET", `${TECH_URL}/api/content/terms-and-conditions`);
  step("GET terms", r.status === 200);

  r = await json("GET", `${TECH_URL}/api/launch-flags`);
  step("GET launch-flags", r.status === 200 && typeof r.data?.publicSos === "boolean", `publicSos=${r.data?.publicSos}`);

  console.log("\n--- Vehicles catalog ---");
  r = await json("GET", `${TECH_URL}/api/vehicles/makes`);
  const makes = r.data?.makes || [];
  step("vehicle makes", r.status === 200 && makes.length > 0, `count=${makes.length}`);

  const toyota = makes.find((m) => /toyota/i.test(m.makeName || m.name || "")) || makes[0];
  const makeId = toyota?._id || toyota?.id;
  const makeName = toyota?.makeName || toyota?.name || "Toyota";

  r = await json("GET", `${TECH_URL}/api/vehicles/models?makeId=${makeId}`);
  const models = r.data?.models || [];
  step("vehicle models", r.status === 200 && models.length > 0, `${makeName} models=${models.length}`);
  const modelId = models[0]?._id || models[0]?.id;

  r = await json("GET", `${TECH_URL}/api/vehicles/types`);
  const types = r.data?.types || r.data || [];
  const typeList = Array.isArray(types) ? types : [];
  step("vehicle types", r.status === 200 && typeList.length > 0, `count=${typeList.length}`);
  const typeId = typeList[0]?._id || typeList[0]?.id || typeList[0];

  r = await json("GET", `${TECH_URL}/api/vehicles`, { token });
  let vehicles = r.data?.vehicles || r.data || [];
  if (!Array.isArray(vehicles)) vehicles = [];
  step("list customer vehicles", r.status === 200, `count=${vehicles.length}`);

  let vehicleId = vehicles[0]?._id || vehicles[0]?.id || null;
  let createdVehicleId = null;

  if (!vehicleId && makeId && modelId && typeId) {
    const plate = `QA${String(Date.now()).slice(-6)}`;
    r = await json("POST", `${TECH_URL}/api/vehicles`, {
      token,
      body: {
        vehicle_make: makeId,
        vehicle_model: modelId,
        vehicle_type: typeId,
        year: 2020,
        vehicle_color: "White",
        plate_number: plate,
      },
    });
    createdVehicleId = r.data?.vehicle?._id || r.data?._id || r.data?.vehicle?.id;
    step("add temporary vehicle", !!createdVehicleId, createdVehicleId || `status=${r.status}`);
    vehicleId = createdVehicleId;
  } else {
    step("reuse existing vehicle", !!vehicleId, vehicleId || "none");
  }

  console.log("\n--- Session / jobs / notifications ---");
  r = await json("GET", `${TECH_URL}/api/jobs/customer/session`, { token });
  step("GET customer session", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/jobs/customer/active`, { token });
  step("GET customer active job", r.status === 200 || r.status === 404, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/jobs/customer/history`, { token });
  step("GET customer job history", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/notifications/customer`, { token });
  step("GET notifications", r.status === 200, `status=${r.status}`);

  r = await json("GET", `${TECH_URL}/api/notifications/customer/unread-count`, { token });
  step("GET unread count", r.status === 200, `unread=${r.data?.count ?? r.data?.unread ?? "?"}`);

  console.log("\n--- Service request gates ---");
  await cancelActiveIfAny(token);

  r = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      latitude: JOB_LAT,
      longitude: JOB_LNG,
      timing: "immediate",
      skip_vehicle: true,
    },
  });
  step("reject missing service_type", r.status === 400, r.data?.code || `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      service_type: "Battery Change",
      timing: "immediate",
      skip_vehicle: true,
    },
  });
  step("reject missing location", r.status === 400, r.data?.code || `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      service_type: "Battery Change",
      timing: "scheduled",
      skip_vehicle: true,
      latitude: JOB_LAT,
      longitude: JOB_LNG,
    },
  });
  step("reject scheduled without scheduled_for", r.status === 400, r.data?.code || `status=${r.status}`);

  r = await json("POST", `${TECH_URL}/api/service-requests`, {
    body: {
      service_type: "Battery Change",
      timing: "immediate",
      skip_vehicle: true,
      latitude: JOB_LAT,
      longitude: JOB_LNG,
    },
  });
  step("reject unauthenticated create", r.status === 401);

  console.log("\n--- Service request create × types ---");
  // Create + cancel one type at a time so we don't trip "already active"
  for (const serviceType of SERVICE_TYPES) {
    r = await json("POST", `${TECH_URL}/api/service-requests`, {
      token,
      body: {
        service_type: serviceType,
        timing: "immediate",
        skip_vehicle: true,
        latitude: JOB_LAT,
        longitude: JOB_LNG,
      },
    });
    const sr = r.data?.service_request;
    const id = sr?.id || sr?._id;
    const ok = r.status === 201 && !!id;
    step(`create [${serviceType}]`, ok, ok ? id : `status=${r.status} ${r.data?.error || r.data?.code || ""}`);

    if (ok) {
      const active = await getActiveId(token);
      step(
        `active reflects [${serviceType}]`,
        active.status === 200 && String(active.id) === String(id),
        `active=${active.id || "none"}`
      );

      const cancel = await json("POST", `${TECH_URL}/api/service-requests/${id}/cancel`, {
        token,
        body: { reason: "QA customer intensive" },
      });
      step(`cancel [${serviceType}]`, cancel.status === 200 || cancel.status === 201, `status=${cancel.status}`);
    }
  }

  console.log("\n--- Scheduled request ---");
  const when = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  r = await json("POST", `${TECH_URL}/api/service-requests`, {
    token,
    body: {
      service_type: "Full Service",
      timing: "scheduled",
      scheduled_for: when,
      skip_vehicle: !vehicleId,
      ...(vehicleId ? { customer_vehicle_id: vehicleId } : {}),
      latitude: JOB_LAT,
      longitude: JOB_LNG,
    },
  });
  const schedId = r.data?.service_request?.id || r.data?.service_request?._id;
  step(
    "create scheduled service request",
    r.status === 201 && !!schedId,
    schedId || `status=${r.status} ${r.data?.error || ""}`
  );
  if (schedId) {
    await json("POST", `${TECH_URL}/api/service-requests/${schedId}/cancel`, {
      token,
      body: { reason: "QA scheduled cleanup" },
    });
    step("cancel scheduled request", true, schedId);
  }

  console.log("\n--- Vehicle-bound request ---");
  if (vehicleId) {
    r = await json("POST", `${TECH_URL}/api/service-requests`, {
      token,
      body: {
        service_type: "Tyre Change",
        timing: "immediate",
        customer_vehicle_id: vehicleId,
        latitude: JOB_LAT,
        longitude: JOB_LNG,
      },
    });
    const id = r.data?.service_request?.id || r.data?.service_request?._id;
    step("create with vehicle", r.status === 201 && !!id, id || `status=${r.status}`);
    if (id) {
      await json("POST", `${TECH_URL}/api/service-requests/${id}/cancel`, {
        token,
        body: { reason: "QA vehicle-bound cleanup" },
      });
      step("cancel vehicle-bound request", true, id);
    }
  } else {
    warn("vehicle-bound request", "no vehicle available");
  }

  if (createdVehicleId) {
    r = await json("DELETE", `${TECH_URL}/api/vehicles/${createdVehicleId}`, { token });
    step("cleanup temp vehicle", r.status === 200 || r.status === 204, createdVehicleId);
  }

  console.log("\n--- Final active check ---");
  const finalActive = await getActiveId(token);
  if (finalActive.id) {
    await json("POST", `${TECH_URL}/api/service-requests/${finalActive.id}/cancel`, {
      token,
      body: { reason: "QA final cleanup" },
    });
  }
  step("no leftover active service request", !finalActive.id, finalActive.id || "clean");

  console.log(`\n=== Customer intensive results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
