#!/usr/bin/env node
/**
 * Read-only Live Map probe. GET requests only (plus one admin login).
 * It never changes a status, a job or a technician.
 *
 * Compares what the admin Live Map is given with what the database holds:
 *
 *   snapshot  GET /api/technicians/live-map         (roster-backed, cached)
 *   database  GET /api/technicians/:id              (reads MongoDB directly)
 *   members   GET /api/technicians?currentStatus=…  (who is Online / On Job)
 *
 * and reports, per technician:
 *   - snapshot heartbeat older than the database's  -> the snapshot is stale
 *   - Online / On Job in the database but absent from the snapshot
 *   - status differing between the two
 *   - how far the snapshot pin is from the stored position
 *   - whether the admin UI would call them "disconnected" (heartbeat >= 60 s)
 *
 * A heartbeat that does not change between rounds is NOT by itself evidence of
 * caching: a phone that has stopped reporting looks the same. Only the
 * comparison with the direct read tells the two apart.
 *
 * Usage (credentials come from the environment, never from argv or this file):
 *   ADMIN_API_URL=https://<admin-api-host> ADMIN_TOKEN=<bearer> node scripts/live-map-probe.js
 *   ADMIN_API_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/live-map-probe.js
 *
 * Optional: PROBE_ROUNDS (default 3), PROBE_GAP_MS (default 45000).
 */
const BASE = String(process.env.ADMIN_API_URL || "").replace(/\/+$/, "");
const ROUNDS = Number(process.env.PROBE_ROUNDS || 3);
const GAP_MS = Number(process.env.PROBE_GAP_MS || 45000);
// Must match LOCATION_STALE_MS in clicks-interface/src/pages/LiveMap/liveMapUtils.js.
const UI_STALE_S = 60;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function getToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;
  if (!email || !password) fail("Set ADMIN_TOKEN, or ADMIN_EMAIL and ADMIN_PASSWORD.");
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`Login failed: HTTP ${res.status}`);
  const body = await res.json();
  const token = body.token || body.accessToken || body.data?.token;
  if (!token) fail("Login succeeded but no token field was found in the response.");
  return token;
}

const ageS = (value, nowMs) =>
  value ? Math.round((nowMs - new Date(value).getTime()) / 1000) : null;

function fmt(seconds) {
  if (seconds == null) return "none";
  if (seconds < 600) return `${seconds}s`;
  if (seconds < 172800) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 86400)}d`;
}

async function main() {
  if (!BASE) fail("Set ADMIN_API_URL.");
  const token = await getToken();
  const get = async (path) => {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return res.json();
  };

  const totals = { behind: new Set(), missing: new Set(), statusDiffers: new Set(), silent: new Set() };

  for (let round = 1; round <= ROUNDS; round++) {
    const snapshot = (await get("/api/technicians/live-map")).technicians || [];
    const [online, onJob] = await Promise.all([
      get("/api/technicians?currentStatus=Online&limit=100"),
      get(`/api/technicians?currentStatus=${encodeURIComponent("On Job")}&limit=100`),
    ]);
    const snapById = new Map(snapshot.map((t) => [String(t._id), t]));
    const ids = new Set([
      ...snapById.keys(),
      ...[...(online.technicians || []), ...(onJob.technicians || [])].map((t) => String(t._id)),
    ]);

    console.log(
      `\n=== round ${round} ${new Date().toISOString()} | snapshot: ${snapshot.length} | ` +
        `database: ${(online.technicians || []).length} Online, ${(onJob.technicians || []).length} On Job`
    );

    for (const id of ids) {
      const { technician: db } = await get(`/api/technicians/${id}`);
      const snap = snapById.get(id);
      const now = Date.now();
      const dbHb = ageS(db.lastHeartbeatAt || db.lastLocationAt, now);
      const name = `${db.firstName || ""} ${db.lastName || ""}`.trim().padEnd(20).slice(0, 20);
      const flags = [];
      let snapText = "absent";

      if (!snap) {
        if (db.isActive === false) flags.push("inactive, filtered out of the map");
        else if (["Online", "On Job"].includes(db.currentStatus)) {
          flags.push("MISSING FROM SNAPSHOT");
          totals.missing.add(id);
        }
      } else {
        const snapHb = ageS(snap.lastHeartbeatAt || snap.lastLocationAt, now);
        const [lng = 0, lat = 0] = db.currentLocation?.coordinates || [];
        const offBy = Math.round(
          Math.hypot(
            (snap.location.latitude - lat) * 111000,
            (snap.location.longitude - lng) * 101000
          )
        );
        snapText = `${String(snap.currentStatus).padEnd(7)} hb=${fmt(snapHb).padEnd(5)} pinOffBy=${offBy}m`;
        if (snap.currentStatus !== db.currentStatus) {
          flags.push("STATUS DIFFERS");
          totals.statusDiffers.add(id);
        }
        if (snapHb != null && dbHb != null && snapHb - dbHb > 30) {
          flags.push(`SNAPSHOT ${snapHb - dbHb}s BEHIND DATABASE`);
          totals.behind.add(id);
        }
      }
      if (dbHb == null || dbHb >= UI_STALE_S) {
        flags.push("phone silent (database heartbeat stale)");
        totals.silent.add(id);
      }

      console.log(
        `  ${id.slice(-6)} ${name} database: ${String(db.currentStatus).padEnd(7)} hb=${fmt(dbHb).padEnd(5)} | ` +
          `snapshot: ${snapText}${flags.length ? `  <-- ${flags.join("; ")}` : ""}`
      );
    }
    if (round < ROUNDS) await new Promise((r) => setTimeout(r, GAP_MS));
  }

  console.log("\nSummary across rounds:");
  console.log(`  snapshot behind the database : ${totals.behind.size} technician(s)`);
  console.log(`  missing from the snapshot    : ${totals.missing.size} technician(s)`);
  console.log(`  status differs               : ${totals.statusDiffers.size} technician(s)`);
  console.log(`  phone genuinely silent       : ${totals.silent.size} technician(s)`);
  if (totals.behind.size || totals.missing.size || totals.statusDiffers.size) {
    console.log(
      "=> The live-map endpoint is not serving current data " +
        "(see adminLookups.TECH_ROSTER_MAX_AGE_MS)."
    );
  }
}

main().catch((err) => fail(`Probe failed: ${err.message}`));
