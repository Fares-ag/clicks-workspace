#!/usr/bin/env node
/**
 * Extended staging smoke (optional credentials).
 *
 * Usage:
 *   ADMIN_URL=... TECH_URL=... \
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *   TECH_PHONE=... TECH_PASSWORD=... \
 *   INTERNAL_API_SECRET=... \
 *   node scripts/smoke-staging.js
 *
 * Without credentials, runs the same checks as smoke-auth.js plus socketAdapter memory check.
 */
const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const TECH_URL = (process.env.TECH_URL || "http://localhost:5001").replace(/\/$/, "");

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function expectStatus(url, opts, expected) {
  const res = await fetch(url, opts);
  if (res.status !== expected) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} expected ${expected}, got ${res.status} ${body.slice(0, 120)}`);
  }
  return res;
}

(async () => {
  await check("admin health", async () => {
    const res = await expectStatus(`${ADMIN_URL}/api/health`, {}, 200);
    const body = await res.json();
    if (body.status !== "ok") throw new Error("bad health body");
  });

  await check("tech health + memory adapter", async () => {
    const res = await expectStatus(`${TECH_URL}/api/health`, {}, 200);
    const body = await res.json();
    if (body.status !== "ok") throw new Error("bad health body");
    if (body.socketAdapter && body.socketAdapter !== "memory") {
      throw new Error(
        `expected socketAdapter=memory for soft launch, got ${body.socketAdapter}`
      );
    }
  });

  await check("launch-flags", async () => {
    const res = await expectStatus(`${TECH_URL}/api/launch-flags`, {}, 200);
    const body = await res.json();
    if (typeof body.publicSos !== "boolean") throw new Error("missing publicSos");
  });

  await check("admin jobs unauth → 401", async () => {
    await expectStatus(`${ADMIN_URL}/api/jobs`, {}, 401);
  });

  await check("admin live-map unauth → 401", async () => {
    await expectStatus(`${ADMIN_URL}/api/technicians/live-map`, {}, 401);
  });

  await check("notify-technician without secret → 401", async () => {
    await expectStatus(
      `${TECH_URL}/api/sos/notify-technician`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: "000000000000000000000000" }),
      },
      401
    );
  });

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    let adminToken;
    await check("admin login", async () => {
      const res = await fetch(`${ADMIN_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      if (res.status !== 200) throw new Error(`login status ${res.status}`);
      const body = await res.json();
      adminToken = body.accessToken || body.token;
      if (!adminToken) throw new Error("no accessToken in login response");
    });

    await check("live-map with JWT → 200", async () => {
      await expectStatus(
        `${ADMIN_URL}/api/technicians/live-map`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
        200
      );
    });
  } else {
    console.log("SKIP  admin login / live-map (set ADMIN_EMAIL + ADMIN_PASSWORD)");
  }

  const techPhone = process.env.TECH_PHONE;
  const techPassword = process.env.TECH_PASSWORD;
  if (techPhone && techPassword) {
    await check("technician login", async () => {
      const res = await fetch(`${TECH_URL}/api/technicians/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: techPhone, password: techPassword }),
      });
      if (res.status !== 200) throw new Error(`tech login status ${res.status}`);
      const body = await res.json();
      if (!body.token) throw new Error("no tech token");
    });
  } else {
    console.log("SKIP  technician login (set TECH_PHONE + TECH_PASSWORD)");
  }

  const internal = process.env.INTERNAL_API_SECRET;
  if (internal) {
    await check("notify with secret (job may 404/500 but not 401)", async () => {
      const res = await fetch(`${TECH_URL}/api/sos/notify-technician`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": internal,
        },
        body: JSON.stringify({ job_id: "000000000000000000000000" }),
      });
      if (res.status === 401) throw new Error("still 401 with secret — header/name mismatch?");
    });
  } else {
    console.log("SKIP  notify with secret (set INTERNAL_API_SECRET)");
  }

  if (process.exitCode) {
    console.error("\nStaging smoke failed");
    process.exit(1);
  }
  console.log("\nStaging smoke checks passed");
})();
