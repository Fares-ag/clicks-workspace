#!/usr/bin/env node
/**
 * Smoke-check production tech-api endpoints for multi-job + maps proxy.
 * Usage:
 *   TECH_API_URL=https://clicks-tech-api-production.up.railway.app \
 *   TECH_TOKEN=eyJ... \
 *   node scripts/smoke-tech-production.js
 *
 * Without TECH_TOKEN: only checks /api/health and unauthenticated maps 401.
 */
const base = (process.env.TECH_API_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const token = process.env.TECH_TOKEN || "";

async function get(path, auth = false) {
  const headers = auth && token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${base}${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function ok(label, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

async function main() {
  console.log(`Tech API: ${base}\n`);

  const health = await get("/api/health");
  ok("health", health.status === 200, `status=${health.status}`);

  const mapsNoAuth = await get(
    "/api/maps/directions?origin=25.33,51.49&destination=25.32,51.48&mode=driving"
  );
  ok(
    "maps/directions requires auth",
    mapsNoAuth.status === 401,
    `status=${mapsNoAuth.status}`
  );

  if (!token) {
    console.log("\nSet TECH_TOKEN to verify session, activity-detail, and authenticated maps.");
    process.exit(health.status === 200 && mapsNoAuth.status === 401 ? 0 : 1);
  }

  const session = await get("/api/jobs/technician/session", true);
  const hasQueue = Array.isArray(session.body?.active_jobs);
  ok(
    "technician session active_jobs[]",
    session.status === 200 && hasQueue,
    `status=${session.status} active_jobs=${hasQueue ? session.body.active_jobs.length : "missing"}`
  );

  const maps = await get(
    "/api/maps/geocode?address=Doha&region=qa",
    true
  );
  const mapsOk =
    maps.status === 200 &&
    (maps.body?.status === "OK" || Array.isArray(maps.body?.results));
  const maps503 = maps.status === 503;
  ok(
    "maps/geocode",
    mapsOk || maps503,
    maps503
      ? "503 — set GOOGLE_MAPS_API_KEY on Railway"
      : `status=${maps.status}`
  );

  const jobId =
    session.body?.active_job?._id ||
    session.body?.active_jobs?.[0]?._id ||
    process.env.JOB_ID;
  if (jobId) {
    const detail = await get(`/api/jobs/${jobId}/activity-detail`, true);
    const shape =
      detail.status === 200 &&
      detail.body?.job &&
      Array.isArray(detail.body?.repairs) &&
      detail.body?.pricing;
    ok(
      "activity-detail",
      shape,
      `status=${detail.status} job=${jobId}`
    );
  } else {
    console.log("SKIP activity-detail — no active job (set JOB_ID to test)");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
