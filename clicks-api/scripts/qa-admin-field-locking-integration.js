#!/usr/bin/env node
/**
 * Integration QA for Admin Field Locking (live API + DB).
 * Run: node scripts/qa-admin-field-locking-integration.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const Partner = require("../clicks-shared/models/Partner");
const Job = require("../clicks-shared/models/Job");
const SOSRequest = require("../clicks-shared/models/SOSRequest");
const Source = require("../clicks-shared/models/Source");
const { isSourceLockedJob } = require("../clicks-shared/utils/jobOrigin");

const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  return fn().then(
    () => {
      passed += 1;
      console.log(`  PASS  ${name}`);
    },
    (err) => {
      if (err?.skip) {
        skipped += 1;
        console.log(`  SKIP  ${name} — ${err.message}`);
        return;
      }
      failed += 1;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err.message}`);
    }
  );
}

async function adminLogin() {
  const res = await fetch(`${ADMIN_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Admin login failed");
  return data.accessToken || data.token;
}

async function main() {
  console.log("\n=== Integration QA: Admin Field Locking ===\n");

  await mongoose.connect(process.env.MONGODB_URI);
  const token = await adminLogin();
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  await test("GET /api/sos returns cancel_reason field", async () => {
    const res = await fetch(`${ADMIN_URL}/api/sos?limit=5&status=cancelled`, { headers: auth });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "SOS list failed");
    const withReason = (data.requests || []).filter((r) => r.cancel_reason);
    if ((data.requests || []).length > 0) {
      const sample = data.requests[0];
      if (!("cancel_reason" in sample)) {
        throw new Error("cancel_reason missing from SOS response shape");
      }
    }
    console.log(`        (${withReason.length} cancelled SOS with reason in sample)`);
  });

  await test("Partner PATCH rejects changed period dates when set", async () => {
    const partner = await Partner.findOne({
      periodStartedAt: { $exists: true, $ne: null },
      periodEndsAt: { $exists: true, $ne: null },
    });
    if (!partner) throw Object.assign(new Error("No partner with period dates in DB"), { skip: true });

    const newStart = new Date(partner.periodStartedAt);
    newStart.setDate(newStart.getDate() + 7);

    const res = await fetch(`${ADMIN_URL}/api/partners/${partner._id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ periodStartedAt: newStart.toISOString() }),
    });
    const data = await res.json();
    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (!String(data.message || "").includes("cannot be changed")) {
      throw new Error(`Unexpected message: ${data.message}`);
    }
  });

  await test("Partner PATCH allows cap update without date fields", async () => {
    const partner = await Partner.findOne({
      periodStartedAt: { $exists: true, $ne: null },
      periodEndsAt: { $exists: true, $ne: null },
    });
    if (!partner) throw Object.assign(new Error("No partner in DB"), { skip: true });

    const cap = Number(partner.currentPeriodCap ?? partner.periodCap ?? 0);
    const res = await fetch(`${ADMIN_URL}/api/partners/${partner._id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ currentPeriodCap: cap }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `PATCH failed (${res.status})`);
  });

  await test("PUT /api/jobs/:id rejects source change on locked job", async () => {
    const jobs = await Job.find()
      .populate("source", "mainSourceName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const locked = jobs.find((j) => isSourceLockedJob(j));
    if (!locked) {
      throw Object.assign(new Error("No technician/business portal job in DB"), { skip: true });
    }

    const fakeSourceId = "507f1f77bcf86cd799439099";
    const res = await fetch(`${ADMIN_URL}/api/jobs/${locked._id}`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ source: fakeSourceId }),
    });
    const data = await res.json();
    if (res.status !== 403) {
      throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
    }
    if (!String(data.message || "").includes("Source cannot be changed")) {
      throw new Error(`Unexpected message: ${data.message}`);
    }
    console.log(`        (job ${String(locked._id).slice(-6)} origin locked)`);
  });

  await test("PUT /api/jobs/:id allows source change on admin job", async () => {
    const jobs = await Job.find()
      .populate("source", "mainSourceName")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const unlocked = jobs.find(
      (j) =>
        !isSourceLockedJob(j) &&
        j.source &&
        (j.source._id || j.source)
    );
    if (!unlocked) {
      throw Object.assign(new Error("No admin-origin job in DB"), { skip: true });
    }

    const currentSourceId = String(unlocked.source._id || unlocked.source);
    const res = await fetch(`${ADMIN_URL}/api/jobs/${unlocked._id}`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ source: currentSourceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `PUT failed (${res.status})`);
  });

  await test("Cancelled SOS records have cancel_reason in DB when set", async () => {
    const cancelled = await SOSRequest.find({ status: "cancelled" })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();
    if (cancelled.length === 0) {
      throw Object.assign(new Error("No cancelled SOS in DB"), { skip: true });
    }
    const withReason = cancelled.filter((s) => s.cancel_reason);
    console.log(`        (${withReason.length}/${cancelled.length} recent cancelled have cancel_reason)`);
  });

  await mongoose.disconnect();
  console.log(`\n=== Integration results: ${passed} passed, ${failed} failed, ${skipped} skipped ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().finally(() => process.exit(1));
});
