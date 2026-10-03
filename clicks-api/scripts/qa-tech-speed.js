#!/usr/bin/env node
/**
 * Latency benchmark for technician hot paths (production or staging).
 *
 * Usage:
 *   node scripts/qa-tech-speed.js
 *   TECH_URL=https://tech-api.clicks.qa ROUNDS=8 node scripts/qa-tech-speed.js
 */
const TECH_URL = (process.env.TECH_URL || "https://tech-api.clicks.qa").replace(/\/$/, "");
const TECH_PHONE = process.env.TECH_PHONE || "+97411111111";
const TECH_PASSWORD = process.env.TECH_PASSWORD || "Tech123!";
const ROUNDS = Math.max(3, Number(process.env.ROUNDS || 6));
const WARMUP = 2;

const ENDPOINTS = [
  { name: "session", method: "GET", path: "/api/jobs/technician/session" },
  { name: "dashboard", method: "GET", path: "/api/technicians/dashboard" },
  { name: "profile", method: "GET", path: "/api/technicians/profile" },
  { name: "notifications_unread", method: "GET", path: "/api/notifications/technician/unread-count" },
  { name: "jobs_history_p1", method: "GET", path: "/api/jobs?page=1&limit=20" },
];

async function json(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["Content-Type"] = "application/json";
  const t0 = performance.now();
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: res.status, ms, data };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = (q) => sorted[Math.min(n - 1, Math.floor(q * (n - 1)))];
  return {
    n,
    min: sorted[0],
    p50: p(0.5),
    p95: p(0.95),
    max: sorted[n - 1],
    avg: sum / n,
  };
}

async function login() {
  const r = await json("POST", `${TECH_URL}/api/technicians/login`, {
    body: { phone: TECH_PHONE, password: TECH_PASSWORD },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Login failed (${r.status}): ${JSON.stringify(r.data).slice(0, 200)}`);
  }
  return { token: r.data.token, loginMs: r.ms };
}

async function main() {
  console.log(`Tech speed test → ${TECH_URL}`);
  console.log(`Rounds: ${ROUNDS} (+ ${WARMUP} warmup per endpoint)\n`);

  const { token, loginMs } = await login();
  console.log(`login: ${loginMs.toFixed(0)}ms\n`);

  const lat = Object.fromEntries(ENDPOINTS.map((e) => [e.name, []]));

  for (let round = 0; round < WARMUP + ROUNDS; round++) {
    for (const ep of ENDPOINTS) {
      const r = await json(ep.method, `${TECH_URL}${ep.path}`, { token });
      if (round >= WARMUP) {
        if (r.status !== 200) {
          console.warn(`WARN ${ep.name} status=${r.status} ms=${r.ms.toFixed(0)}`);
        }
        lat[ep.name].push(r.ms);
      }
    }
  }

  const lat25 = 25.3269467;
  const lng51 = 51.4883967;
  const locSamples = [];
  for (let i = 0; i < WARMUP + ROUNDS; i++) {
    const r = await json("PATCH", `${TECH_URL}/api/technicians/location`, {
      token,
      body: {
        latitude: lat25 + i * 0.0001,
        longitude: lng51 + i * 0.0001,
        accuracy: 12,
        fix_time: new Date().toISOString(),
      },
    });
    if (i >= WARMUP) {
      if (r.status !== 200) {
        console.warn(`WARN location status=${r.status} ms=${r.ms.toFixed(0)}`);
      }
      locSamples.push(r.ms);
    }
  }

  console.log("Endpoint latency (ms) — measured rounds only:");
  console.log("name                  min    p50    p95    max    avg");
  for (const ep of ENDPOINTS) {
    const s = stats(lat[ep.name]);
    console.log(
      `${ep.name.padEnd(22)} ${fmt(s.min)} ${fmt(s.p50)} ${fmt(s.p95)} ${fmt(s.max)} ${fmt(s.avg)}`
    );
  }
  const ls = stats(locSamples);
  console.log(
    `${"location_patch".padEnd(22)} ${fmt(ls.min)} ${fmt(ls.p50)} ${fmt(ls.p95)} ${fmt(ls.max)} ${fmt(ls.avg)}`
  );

  const slow = [];
  for (const ep of ENDPOINTS) {
    const s = stats(lat[ep.name]);
    if (s.p95 > 800) slow.push(`${ep.name} p95=${fmt(s.p95)}ms`);
  }
  if (ls.p95 > 800) slow.push(`location_patch p95=${fmt(ls.p95)}ms`);

  console.log("");
  if (slow.length) {
    console.log("SLOW (p95 > 800ms):");
    slow.forEach((line) => console.log(`  - ${line}`));
    process.exitCode = 1;
  } else {
    console.log("OK: all endpoints p95 <= 800ms");
  }
}

function fmt(n) {
  return String(Math.round(n)).padStart(6);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
