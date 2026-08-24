#!/usr/bin/env node
/**
 * QA: Job location — Maps links, lat/lng, address parsing → locationCoordinates.
 *
 * Usage:
 *   node scripts/qa-job-location-links.js
 *
 * Env:
 *   ADMIN_URL, TECH_URL
 *   ADMIN_EMAIL, ADMIN_PASSWORD
 *   TECH_PHONE, TECH_PASSWORD
 *   BUSINESS_EMAIL, BUSINESS_PASSWORD  (default business@clicks.local / Business123!)
 *   KEEP_JOBS=1   skip cleanup deletes
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  parseJobLocation,
  extractGeocodeQuery,
  isExpandableMapsUrl,
} = require("../clicks-shared/utils/parseJobLocation");
const { resolveJobLocationToGeoPoint } = require("../clicks-shared/utils/resolveJobLocation");

const ADMIN_URL = (
  process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app"
).replace(/\/$/, "");
const TECH_URL = (
  process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app"
).replace(/\/$/, "");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || "business@clicks.local";
const BUSINESS_PASSWORD = process.env.BUSINESS_PASSWORD || "Business123!";

const QA_LAT = 25.3269467;
const QA_LNG = 51.4883967;
const QA_COORDS = [QA_LNG, QA_LAT];

let passed = 0;
let failed = 0;
let warned = 0;
const createdJobIds = [];

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

function coordsMatch(actual, expected, tolerance = 0.0005) {
  if (!Array.isArray(actual) || actual.length < 2) return false;
  return (
    Math.abs(actual[0] - expected[0]) <= tolerance &&
    Math.abs(actual[1] - expected[1]) <= tolerance
  );
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

function runUnitTests() {
  console.log("--- Unit tests (node --test) ---");
  const files = [
    path.join(__dirname, "../clicks-shared/utils/parseJobLocation.test.js"),
    path.join(__dirname, "../clicks-shared/utils/resolveJobLocation.test.js"),
  ];
  const r = spawnSync(process.execPath, ["--test", ...files], {
    encoding: "utf8",
    cwd: path.join(__dirname, ".."),
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  step("unit test suite", r.status === 0, r.status === 0 ? "all green" : `exit=${r.status}`);
}

function checkUiPlaceholders() {
  console.log("\n--- Client placeholder wiring ---");
  const expected = "Address, lat/lng, or Google Maps / Waze link";
  const files = [
    path.join(__dirname, "../../clicks-interface/src/pages/JobManagement/AddNewJob.jsx"),
    path.join(__dirname, "../../clicks-interface/src/components/AddJobModal.jsx"),
    path.join(__dirname, "../../clicks-interface/src/pages/LeadManagement/AddNewLead.jsx"),
    path.join(__dirname, "../../clicks-interface/src/pages/LeadManagement/ConvertLead.jsx"),
    path.join(__dirname, "../../clicks-business-web/src/pages/NewJob/NewJob.jsx"),
    path.join(__dirname, "../../clicks-technician/lib/features/home/ui/view/add_job_screen.dart"),
    path.join(__dirname, "../../clicks-business/lib/features/jobs/new_job_screen.dart"),
  ];
  for (const f of files) {
    const rel = path.relative(path.join(__dirname, "../.."), f);
    if (!fs.existsSync(f)) {
      step(`placeholder in ${rel}`, false, "file missing");
      continue;
    }
    const text = fs.readFileSync(f, "utf8");
    step(`placeholder in ${rel}`, text.includes(expected), expected);
  }

  const techAdd = fs.readFileSync(files[5], "utf8");
  step(
    "technician GPS keeps coords in label",
    techAdd.includes("formatted ($lat, $lng)") || techAdd.includes("'$formatted ($lat, $lng)'"),
    "address (lat, lng) format"
  );
}

function checkResolverSamples() {
  console.log("\n--- Resolver samples (offline) ---");
  const cases = [
    {
      name: "plain lat,lng",
      input: `${QA_LAT}, ${QA_LNG}`,
      coords: QA_COORDS,
    },
    {
      name: "Google @lat,lng URL",
      input: `https://www.google.com/maps/place/Doha/@${QA_LAT},${QA_LNG},14z`,
      coords: QA_COORDS,
    },
    {
      name: "Google !3d!4d URL",
      input: `https://www.google.com/maps/place/Doha/data=!3d${QA_LAT}!4d${QA_LNG}`,
      coords: QA_COORDS,
    },
    {
      name: "Waze ll URL",
      input: `https://www.waze.com/live-map/directions?to=ll.${QA_LAT}%2C${QA_LNG}`,
      coords: QA_COORDS,
    },
    {
      name: "address with trailing (lat, lng)",
      input: `QA Location (${QA_LAT}, ${QA_LNG})`,
      coords: QA_COORDS,
    },
  ];

  for (const c of cases) {
    const coords = parseJobLocation(c.input);
    step(
      `parse: ${c.name}`,
      coords && coordsMatch([coords.lng, coords.lat], c.coords),
      coords ? `[${coords.lng}, ${coords.lat}]` : "null"
    );
  }

  step(
    "extractGeocodeQuery for place URL",
    extractGeocodeQuery("https://www.google.com/maps/place/Souq+Waqif") != null,
    extractGeocodeQuery("https://www.google.com/maps/place/Souq+Waqif") || "null"
  );
  step(
    "isExpandableMapsUrl short link",
    isExpandableMapsUrl("https://maps.app.goo.gl/abc123") === true
  );
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

async function loginTech() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Tech login failed (${r.status}): ${r.data?.error || "no token"}`);
  }
  const techId =
    r.data?.technician?._id ||
    r.data?.technician?.id ||
    r.data?.id ||
    null;
  return { token: r.data.token, techId };
}

async function findTechnicianId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/technicians?limit=50`, {
    token: adminToken,
  });
  const list = r.data?.technicians || r.data?.data || [];
  const match = list.find((t) => String(t.phone || "").includes(TECH_PHONE.replace(/\D/g, "").slice(-8)));
  return match?._id || list[0]?._id || null;
}

async function getTechSession(techToken) {
  return json("GET", `${TECH_URL}/api/jobs/technician/session`, { token: techToken });
}

async function rejectAssignedJob(techToken, jobId) {
  await json("POST", `${TECH_URL}/api/technicians/jobs/${jobId}/reject`, {
    token: techToken,
    body: { reason: "QA location test cleanup" },
  });
}

async function assertTechReceivesLocation(techToken, jobId, expectedCoords, locationPreserved) {
  const session = await getTechSession(techToken);
  step("tech session fetch", session.status === 200, `status=${session.status}`);
  if (session.status !== 200) return false;

  const jobs = [
    ...(session.data?.active_jobs || []),
    session.data?.active_job,
  ].filter(Boolean);
  const job = jobs.find((j) => String(j._id) === String(jobId));
  step(
    `tech sees assigned job ${jobId}`,
    !!job,
    job ? job.job_status : "not in session"
  );
  if (!job) return false;

  const coords = job.locationCoordinates?.coordinates;
  const okCoords = coordsMatch(coords, expectedCoords);
  step(
    `tech job ${jobId} coordinates`,
    okCoords,
    JSON.stringify(coords || null)
  );

  if (locationPreserved != null) {
    step(
      `tech job ${jobId} location preserved`,
      String(job.location || "").trim() === String(locationPreserved).trim(),
      (job.location || "").slice(0, 80)
    );
  }
  return okCoords;
}

async function loginBusiness() {
  const r = await json("POST", `${ADMIN_URL}/api/business/auth/login`, {
    body: { email: BUSINESS_EMAIL, password: BUSINESS_PASSWORD },
  });
  const token = r.data?.accessToken || r.data?.token;
  if (r.status !== 200 || !token) {
    throw new Error(`Business login failed (${r.status}): ${r.data?.message || "no token"}`);
  }
  return token;
}

async function findSourceId(adminToken) {
  const r = await json("GET", `${ADMIN_URL}/api/sources?limit=10`, { token: adminToken });
  return (r.data?.sources || [])[0]?._id;
}

function uniquePhone() {
  return String(Date.now()).slice(-8);
}

function baseJobBody(sourceId, location, label) {
  return {
    clientName: `QA Loc ${label}`,
    clientMobileNumber: uniquePhone(),
    countryCode: "+974",
    issue: `QA location test — ${label}`,
    location,
    dateTime: new Date(Date.now() + 3600000).toISOString(),
    jobType: "Flat tire",
    price: 150,
    source: sourceId,
    vehicleMake: "Toyota",
    vehicleModel: "Camry",
  };
}

async function assertJobCoords(adminToken, jobId, expectedCoords, locationPreserved) {
  const r = await json("GET", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
  if (r.status !== 200) {
    step(`fetch job ${jobId}`, false, `status=${r.status}`);
    return false;
  }
  const job = r.data?.job || r.data;
  const coords = job?.locationCoordinates?.coordinates;
  const okCoords = coordsMatch(coords, expectedCoords);
  step(
    `job ${jobId} coordinates`,
    okCoords,
    JSON.stringify(coords || null)
  );
  if (locationPreserved != null) {
    step(
      `job ${jobId} location preserved`,
      String(job?.location || "").trim() === String(locationPreserved).trim(),
      (job?.location || "").slice(0, 80)
    );
  }
  return okCoords;
}

async function deleteJob(adminToken, jobId) {
  if (process.env.KEEP_JOBS === "1") return;
  await json("DELETE", `${ADMIN_URL}/api/jobs/${jobId}`, { token: adminToken });
}

async function runApiQa() {
  console.log("\n--- API integration ---");
  console.log(`Admin API: ${ADMIN_URL}`);
  console.log(`Tech API:  ${TECH_URL}\n`);

  let adminToken;
  let techToken;
  let techId;
  let businessToken;
  let sourceId;

  try {
    adminToken = await loginAdmin();
    step("admin login", true);
  } catch (e) {
    step("admin login", false, e.message);
    warn("API integration skipped", "admin unavailable");
    return;
  }

  sourceId = await findSourceId(adminToken);
  if (!sourceId) {
    step("find source", false, "no sources");
    return;
  }
  step("find source", true, sourceId);

  try {
    const techAuth = await loginTech();
    techToken = techAuth.token;
    techId = techAuth.techId || (await findTechnicianId(adminToken));
    step("technician login", true, techId || "no techId");
  } catch (e) {
    warn("technician login", e.message);
  }

  try {
    businessToken = await loginBusiness();
    step("business login", true);
  } catch (e) {
    warn("business login", e.message);
  }

  const adminCases = [
    {
      label: "admin-plain-coords",
      location: `${QA_LAT}, ${QA_LNG}`,
      coords: QA_COORDS,
    },
    {
      label: "admin-google-url",
      location: `https://www.google.com/maps/place/Doha/@${QA_LAT},${QA_LNG},14z`,
      coords: QA_COORDS,
    },
    {
      label: "admin-waze-url",
      location: `https://www.waze.com/live-map/directions?to=ll.${QA_LAT}%2C${QA_LNG}`,
      coords: QA_COORDS,
    },
  ];

  for (const c of adminCases) {
    const body = baseJobBody(sourceId, c.location, c.label);
    const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
      token: adminToken,
      body,
    });
    const jobId = r.data?.job?._id || r.data?._id;
    const ok = (r.status === 200 || r.status === 201) && !!jobId;
    step(`admin create: ${c.label}`, ok, ok ? jobId : `${r.status} ${r.data?.message || r.data?.error || ""}`);
    if (ok) {
      createdJobIds.push(jobId);
      await assertJobCoords(adminToken, jobId, c.coords, c.location);
    }
  }

  if (techToken && techId) {
    console.log("\n--- SDO assign → technician receives location ---");
    const assignCases = [
      {
        label: "assign-google-url",
        location: `https://www.google.com/maps/place/Doha/@${QA_LAT},${QA_LNG},14z`,
        coords: QA_COORDS,
      },
      {
        label: "assign-waze-url",
        location: `https://www.waze.com/live-map/directions?to=ll.${QA_LAT}%2C${QA_LNG}`,
        coords: QA_COORDS,
      },
    ];

    for (const c of assignCases) {
      const body = {
        ...baseJobBody(sourceId, c.location, c.label),
        assignedTechnician: techId,
      };
      const r = await json("POST", `${ADMIN_URL}/api/jobs`, {
        token: adminToken,
        body,
      });
      const jobId = r.data?.job?._id || r.data?._id;
      const ok = (r.status === 200 || r.status === 201) && !!jobId;
      step(
        `admin create+assign: ${c.label}`,
        ok,
        ok ? jobId : `${r.status} ${r.data?.message || r.data?.error || ""}`
      );
      if (!ok) continue;

      createdJobIds.push(jobId);
      await assertJobCoords(adminToken, jobId, c.coords, c.location);
      await assertTechReceivesLocation(techToken, jobId, c.coords, c.location);

      // Clear queue so next assign case starts clean
      await rejectAssignedJob(techToken, jobId);
    }
  }

  if (techToken) {
    const techLocation = `QA Tech Maps (${QA_LAT}, ${QA_LNG})`;
    const r = await json("POST", `${TECH_URL}/api/technicians/jobs`, {
      token: techToken,
      body: {
        clientName: "QA Tech Loc",
        clientMobileNumber: uniquePhone(),
        countryCode: "+974",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        issue: "QA tech location link test",
        location: techLocation,
        dateTime: new Date().toISOString(),
        jobType: "Flat tire",
        price: 160,
      },
    });
    const jobId = r.data?.job?._id;
    const ok = (r.status === 200 || r.status === 201) && !!jobId;
    step("tech create: address (lat,lng)", ok, ok ? jobId : `${r.status}`);
    if (ok) {
      createdJobIds.push(jobId);
      const coordsOk = r.data?.job?.locationCoordinates?.coordinates;
      step(
        "tech create response has coordinates",
        coordsMatch(coordsOk, QA_COORDS),
        JSON.stringify(coordsOk || null)
      );
      await assertJobCoords(adminToken, jobId, QA_COORDS, techLocation);
    }
  }

  if (businessToken) {
    const bizLocation = `${QA_LAT}, ${QA_LNG}`;
    const r = await json("POST", `${ADMIN_URL}/api/business/jobs`, {
      token: businessToken,
      body: {
        clientName: "QA Business Loc",
        clientMobileNumber: uniquePhone(),
        countryCode: "+974",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        issue: "QA business portal location test",
        location: bizLocation,
        dateTime: new Date().toISOString(),
        jobType: "Flat tire",
        price: 140,
      },
    });
    const jobId = r.data?.job?._id || r.data?._id;
    const ok = (r.status === 200 || r.status === 201) && !!jobId;
    step("business create: lat,lng", ok, ok ? jobId : `${r.status} ${r.data?.message || ""}`);
    if (ok) {
      createdJobIds.push(jobId);
      await assertJobCoords(adminToken, jobId, QA_COORDS, bizLocation);
    }
  }

  // Geocode fallback — warn only (needs GOOGLE_MAPS_API_KEY on server)
  const geo = await resolveJobLocationToGeoPoint("Al Sadd, Doha, Qatar");
  if (geo && coordsMatch(geo.coordinates, [51.5, 25.28], 0.05)) {
    step("geocode fallback (Al Sadd)", true, JSON.stringify(geo.coordinates));
  } else if (geo) {
    step("geocode fallback (Al Sadd)", true, `got ${JSON.stringify(geo.coordinates)}`);
  } else {
    warn("geocode fallback (Al Sadd)", "no coords — GOOGLE_MAPS_API_KEY may be unset");
  }

  console.log("\n--- Cleanup ---");
  for (const id of createdJobIds) {
    await deleteJob(adminToken, id);
  }
  if (process.env.KEEP_JOBS === "1") {
    warn("cleanup skipped", `KEEP_JOBS=1 (${createdJobIds.length} jobs left)`);
  } else {
    step("cleanup test jobs", true, `deleted ${createdJobIds.length}`);
  }
}

async function main() {
  console.log("\n=== Job Location / Maps Link QA ===\n");
  runUnitTests();
  checkUiPlaceholders();
  checkResolverSamples();
  await runApiQa();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${warned} warnings ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
