#!/usr/bin/env node
/**
 * Drives the dispatch + technician side of the demo SOS journey against the
 * PRODUCTION APIs, so the customer app on the emulator can be filmed reacting
 * to real state changes. Every row it writes belongs to the seeded demo
 * customer (+97433333333) and is listed by `node tools/journey.cjs state`
 * so it can be cleaned up afterwards.
 *
 *   node tools/journey.cjs state          — what the demo account looks like now
 *   node tools/journey.cjs claim          — dispatcher claims the newest pending SOS
 *   node tools/journey.cjs job            — create the SOS job, assigned to Omar
 *   node tools/journey.cjs enroute|arrive|start|complete
 */
const https = require("https");
const fs = require("fs");
const path = require("path");

// Both login routes sit behind an auth rate limiter, and this script is invoked
// once per journey step — so cache the tokens on disk instead of re-logging in.
const CACHE = path.join(__dirname, ".tokens.json");
const CACHE_TTL_MS = 20 * 60 * 1000;

const API = "https://clicks-tech-api-production.up.railway.app";
const ADMIN_API = "https://clicks-admin-api-production.up.railway.app";
const CUST = { phone_number: "+97433333333", password: "Customer123!" };
const TECH = { phone: "+97411111111", password: "Tech123!" };
const ADMIN = { email: "admin@clicks.local", password: "Admin123!" };
const CUSTOMER_ID = "6a5ea167a67c3d98fc2e6a16";
const VEHICLE_ID = "6a5ea167a67c3d98fc2e6a1a";
const TECH_ID = "6a5ea3b97c12fea43f51ed4f";
const LAT = 25.3269467, LNG = 51.4883967;

function req(method, url, { token, body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const r = https.request(
      {
        method,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        timeout: 30000,
      },
      (res) => {
        let s = "";
        res.on("data", (d) => (s += d));
        res.on("end", () => {
          let data;
          try { data = JSON.parse(s); } catch { data = s.slice(0, 400); }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (payload) r.write(payload);
    r.end();
  });
}

const tok = {};
async function login(attempt = 0) {
  if (tok.cust) return;
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - c.at < CACHE_TTL_MS && c.cust && c.tech && c.admin) {
      Object.assign(tok, c);
      return;
    }
  } catch {}
  try {
  tok.cust = (await req("POST", `${API}/api/customers/login`, { body: CUST })).data.token;
  tok.tech = (await req("POST", `${API}/api/technicians/login`, { body: TECH })).data.token;
  { const a = (await req("POST", `${ADMIN_API}/api/auth/login`, { body: ADMIN })).data; tok.admin = a.accessToken || a.token; }
    if (!tok.cust || !tok.tech || !tok.admin) throw new Error("login failed");
    fs.writeFileSync(CACHE, JSON.stringify({ ...tok, at: Date.now() }));
  } catch (e) {
    if (attempt >= 3) throw e;
    tok.cust = tok.tech = tok.admin = undefined;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return login(attempt + 1);
  }
}

async function state() {
  await login();
  const sos = await req("GET", `${API}/api/sos`, { token: tok.cust });
  const recent = (sos.data.requests || []).slice(0, 3).map((s) => ({
    id: s._id, status: s.status, job: s.job_id?._id || s.job_id || null, at: s.createdAt,
  }));
  const active = await req("GET", `${API}/api/jobs/customer/active`, { token: tok.cust });
  const sr = await req("GET", `${API}/api/service-requests/active`, { token: tok.cust });
  const sess = await req("GET", `${API}/api/jobs/technician/session`, { token: tok.tech });
  console.log(JSON.stringify({
    sos: recent,
    active_job: active.data.active_job
      ? { id: active.data.active_job._id, status: active.data.active_job.job_status }
      : null,
    active_service_request: sr.data.active_service_request
      ? { id: sr.data.active_service_request.id, status: sr.data.active_service_request.status }
      : null,
    tech_active_jobs: (sess.data.active_jobs || []).map((j) => ({
      id: j._id, status: j.job_status, client: j.clientName,
    })),
  }, null, 1));
}

async function newestSos(statuses) {
  await login();
  const r = await req("GET", `${API}/api/sos`, { token: tok.cust });
  return (r.data.requests || []).find((s) => statuses.includes(s.status)) || null;
}

async function claim() {
  const sos = await newestSos(["pending"]);
  if (!sos) return console.log("no pending SOS");
  const r = await req("POST", `${ADMIN_API}/api/sos/${sos._id}/claim`, { token: tok.admin });
  console.log("claim", sos._id, r.status, JSON.stringify(r.data).slice(0, 200));
}

// `job` links the new job to a live SOS; `trackjob` makes a standalone one for
// re-shooting the tracking screens without burning another SOS broadcast.
async function trackjob() { return job({ standalone: true }); }

async function job({ standalone = false } = {}) {
  await login();
  const sos = standalone ? null : await newestSos(["pending", "in_call"]);
  if (!standalone && !sos) return console.log("no claimable SOS");
  const src = await req("GET", `${ADMIN_API}/api/sources?limit=5`, { token: tok.admin });
  const list = src.data.sources || src.data.data || src.data || [];
  const sourceId = (Array.isArray(list) ? list[0] : null)?._id;
  if (!sourceId) return console.log("no source", JSON.stringify(src.data).slice(0, 200));
  const r = await req("POST", `${ADMIN_API}/api/jobs`, {
    token: tok.admin,
    body: {
      customer_id: CUSTOMER_ID,
      customer_vehicle_id: VEHICLE_ID,
      clientName: "Demo Customer",
      clientMobileNumber: "+97433333333",
      vehicleMake: "Toyota", vehicleModel: "Camry", vehicleYear: 2021,
      licensePlate: "123456",
      issue: "Flat tyre on Al Corniche Street",
      location: `${LAT}, ${LNG}`,
      dateTime: new Date().toISOString(),
      jobType: "Flat Tire",
      assignedTechnician: TECH_ID,
      price: 150,
      source: sourceId,
      ...(sos ? { sos_request_id: sos._id } : {}),
    },
  });
  console.log("job", r.status, r.data?.job?._id || JSON.stringify(r.data).slice(0, 250));
}

// The technician session can lag a freshly written job by a second or two, so
// look in both places and give it a couple of tries before giving up.
async function activeJobId(tries = 4) {
  await login();
  for (let i = 0; i < tries; i++) {
    const s = await req("GET", `${API}/api/jobs/technician/session`, { token: tok.tech });
    const jobs = [
      ...(s.data.active_jobs || []),
      ...(s.data.pending_jobs || []),
      ...(s.data.assigned_jobs || []),
    ];
    const mine = jobs.find((j) => String(j.clientName) === "Demo Customer");
    if (mine?._id) return mine._id;
    const a = await req("GET", `${API}/api/jobs/technician/active`, { token: tok.tech });
    const j = a.data.active_job;
    if (j && String(j.clientName) === "Demo Customer") return j._id;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/** Park the technician a few km from the customer so the tracking map has to
 *  zoom out to hold both markers. Coordinates are real Doha points. */
const TECH_START = { lat: 25.3200, lng: 51.5300 };

async function techloc(lat = TECH_START.lat, lng = TECH_START.lng, jobId) {
  await login();
  const id = jobId || (await activeJobId());
  const r = await req("PATCH", `${API}/api/technicians/location`, {
    token: tok.tech,
    body: { latitude: lat, longitude: lng, ...(id ? { job_id: id } : {}) },
  });
  console.log("techloc", lat, lng, r.status, JSON.stringify(r.data).slice(0, 160));
}

/**
 * Walk the technician from TECH_START to the customer so the tracking map
 * actually shows them closing the distance. `secs` is how long the walk takes;
 * a fix every ~1.2 s matches what a real device sends.
 */
async function techpath(secs = 30) {
  await login();
  const id = await activeJobId();
  const steps = Math.max(2, Math.round(secs / 1.2));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Ease out, so the approach slows as they arrive rather than stopping dead.
    const e = 1 - Math.pow(1 - t, 1.7);
    const lat = TECH_START.lat + (LAT - TECH_START.lat) * e;
    const lng = TECH_START.lng + (LNG - TECH_START.lng) * e;
    await req("PATCH", `${API}/api/technicians/location`, {
      token: tok.tech,
      body: { latitude: lat, longitude: lng, ...(id ? { job_id: id } : {}) },
    });
    console.log(`  techpath ${i}/${steps}  ${lat.toFixed(4)},${lng.toFixed(4)}`);
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log("\ntechpath done");
}

async function step(name) {
  const id = await activeJobId();
  if (!id) return console.log("no active demo job");
  const calls = {
    accept: () => req("POST", `${API}/api/technicians/jobs/${id}/accept`, { token: tok.tech, body: {} }),
    enroute: () => req("PATCH", `${API}/api/jobs/${id}/status`, { token: tok.tech, body: { job_status: "en_route" } }),
    arrive: () => req("POST", `${API}/api/jobs/${id}/arrive`, { token: tok.tech, body: { latitude: LAT, longitude: LNG } }),
    start: () => req("POST", `${API}/api/jobs/${id}/start`, { token: tok.tech, body: { latitude: LAT, longitude: LNG } }),
    cancel: () => req("POST", `${API}/api/jobs/${id}/cancel`, { token: tok.tech, body: { reason: "Demo capture — superseded by the SOS run" } }),
    pay: () => req("POST", `${API}/api/jobs/${id}/payment`, { token: tok.tech, body: { payment_method: "cash", amount: 150 } }),
    complete: () => req("POST", `${API}/api/jobs/${id}/complete`, { token: tok.tech, body: { latitude: LAT, longitude: LNG, job_reference: "CLK-26-0147" } }),
  };
  const r = await calls[name]();
  console.log(name, id, r.status, JSON.stringify(r.data).slice(0, 220));
}

const cmd = process.argv[2];
const extra = process.argv.slice(3).map(Number);
const run = cmd === "techloc"
  ? () => techloc(extra[0], extra[1])
  : cmd === "techpath"
  ? () => techpath(extra[0])
  : { state, claim, job, trackjob }[cmd] || (() => step(cmd));
run().catch((e) => { console.error("ERR", e.message); process.exit(1); });
