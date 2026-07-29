#!/usr/bin/env node
/**
 * Auth / secret smoke tests for staging or local.
 * Usage: ADMIN_URL=http://localhost:5000 TECH_URL=http://localhost:5001 node scripts/smoke-auth.js
 */
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:5000";
const TECH_URL = process.env.TECH_URL || "http://localhost:5001";

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
    throw new Error(`${url} expected ${expected}, got ${res.status}`);
  }
  return res;
}

(async () => {
  await check("admin health", async () => {
    const res = await expectStatus(`${ADMIN_URL}/api/health`, {}, 200);
    const body = await res.json();
    if (body.status !== "ok") throw new Error("bad health body");
  });

  await check("tech health", async () => {
    await expectStatus(`${TECH_URL}/api/health`, {}, 200);
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

  await check("launch-flags endpoint", async () => {
    const res = await expectStatus(`${TECH_URL}/api/launch-flags`, {}, 200);
    const body = await res.json();
    if (typeof body.publicSos !== "boolean") throw new Error("missing publicSos");
  });

  if (process.exitCode) {
    console.error("\nSmoke tests failed");
    process.exit(1);
  }
  console.log("\nAll smoke checks passed");
})();
