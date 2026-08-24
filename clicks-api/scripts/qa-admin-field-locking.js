/**
 * QA checks for Admin Field Locking + SOS Cancel Reason.
 * Run: node scripts/qa-admin-field-locking.js
 */
const assert = require("node:assert/strict");
const {
  isBusinessPortalJob,
  isTechnicianCreatedJob,
  isSourceLockedJob,
} = require("../clicks-shared/utils/jobOrigin");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

// --- SOS cancel reason validation (mirrors sosSocketService.js) ---
function validateSosCancelReason(reason) {
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (
    !trimmedReason ||
    trimmedReason === "cancelled_by_customer" ||
    trimmedReason === "other"
  ) {
    return { ok: false, code: "SOS_CANCEL_REASON_REQUIRED" };
  }
  return { ok: true, reason: trimmedReason };
}

// --- Job source change guard (mirrors jobController.js updateJob) ---
function wouldRejectSourceChange(currentJob, body) {
  if (!isSourceLockedJob(currentJob)) return false;
  const sourceTouched = Object.prototype.hasOwnProperty.call(body, "source");
  const subSourceTouched = Object.prototype.hasOwnProperty.call(body, "subSource");
  if (!sourceTouched && !subSourceTouched) return false;
  const currentSourceId = String(currentJob.source?._id || currentJob.source || "");
  const nextSourceId = sourceTouched ? String(body.source || "") : currentSourceId;
  const currentSubSource = currentJob.subSource || "";
  const nextSubSource = subSourceTouched ? String(body.subSource || "") : currentSubSource;
  const sourceChanged = sourceTouched && nextSourceId !== currentSourceId;
  const subSourceChanged = subSourceTouched && nextSubSource !== currentSubSource;
  return sourceChanged || subSourceChanged;
}

// --- Partner date lock (mirrors partnerController.js updatePartner) ---
function sameCalendarDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function wouldRejectPartnerDateChange(partner, body) {
  const hasLockedPeriodDates =
    partner.periodStartedAt &&
    partner.periodEndsAt &&
    !Number.isNaN(new Date(partner.periodStartedAt).getTime()) &&
    !Number.isNaN(new Date(partner.periodEndsAt).getTime());
  if (!hasLockedPeriodDates) return false;

  if (body.periodStartedAt !== undefined) {
    const start = new Date(body.periodStartedAt);
    if (Number.isNaN(start.getTime()) || !sameCalendarDay(start, partner.periodStartedAt)) {
      return true;
    }
  }
  if (body.periodEndsAt !== undefined) {
    const end = new Date(body.periodEndsAt);
    if (Number.isNaN(end.getTime()) || !sameCalendarDay(end, partner.periodEndsAt)) {
      return true;
    }
  }
  return false;
}

// --- Cancel reason labels (mirrors cancelReasonLabels.js) ---
function formatCancelReason(reason) {
  const CANCEL_REASON_LABELS = {
    no_longer_needed: "Issue resolved on my own",
    switching: "Accidentally made the request",
    privacy: "Changed my mind",
    foundanotherserviceprovider: "Found another provider",
    other: "Other",
    cancelled_by_customer: "Cancelled by customer",
  };
  if (!reason || typeof reason !== "string") return "—";
  const trimmed = reason.trim();
  if (!trimmed) return "—";
  return CANCEL_REASON_LABELS[trimmed] || trimmed;
}

console.log("\n=== QA: Admin Field Locking ===\n");

console.log("1. SOS cancel reason validation");
test("accepts preset reason key", () => {
  const r = validateSosCancelReason("no_longer_needed");
  assert.equal(r.ok, true);
  assert.equal(r.reason, "no_longer_needed");
});
test("accepts free-text reason", () => {
  const r = validateSosCancelReason("  Customer changed plans  ");
  assert.equal(r.ok, true);
  assert.equal(r.reason, "Customer changed plans");
});
test("rejects empty reason", () => {
  assert.equal(validateSosCancelReason("").ok, false);
  assert.equal(validateSosCancelReason("   ").ok, false);
  assert.equal(validateSosCancelReason(undefined).ok, false);
});
test("rejects fallback cancelled_by_customer", () => {
  assert.equal(validateSosCancelReason("cancelled_by_customer").ok, false);
});
test("rejects bare other key without text", () => {
  assert.equal(validateSosCancelReason("other").ok, false);
});

console.log("\n2. Cancel reason labels");
test("maps known keys", () => {
  assert.equal(formatCancelReason("privacy"), "Changed my mind");
});
test("passes through free text", () => {
  assert.equal(formatCancelReason("Had to leave urgently"), "Had to leave urgently");
});
test("empty -> em dash", () => {
  assert.equal(formatCancelReason(""), "—");
});

console.log("\n3. Job source locking");
const techJob = {
  created_by_technician: "507f1f77bcf86cd799439011",
  source: { _id: "aaa", mainSourceName: "Technician App" },
  subSource: "Mobile App",
};
const businessJob = {
  business_id: "507f1f77bcf86cd799439012",
  businessName: "Acme Garage",
  source: { _id: "bbb", mainSourceName: "Business Portal" },
  subSource: "Mobile App",
};
const adminJob = {
  source: { _id: "ccc", mainSourceName: "Direct" },
  subSource: "",
};

test("detects technician job", () => assert.equal(isSourceLockedJob(techJob), true));
test("detects business portal job", () => assert.equal(isSourceLockedJob(businessJob), true));
test("admin job not locked", () => assert.equal(isSourceLockedJob(adminJob), false));
test("rejects source change on tech job", () => {
  assert.equal(
    wouldRejectSourceChange(techJob, { source: "new-source-id" }),
    true
  );
});
test("rejects subSource change on business job", () => {
  assert.equal(
    wouldRejectSourceChange(businessJob, { subSource: "Web" }),
    true
  );
});
test("allows non-source update on tech job", () => {
  assert.equal(wouldRejectSourceChange(techJob, { price: 500 }), false);
});
test("allows source change on admin job", () => {
  assert.equal(
    wouldRejectSourceChange(adminJob, { source: "new-source-id" }),
    false
  );
});
test("detects tech job by source name only", () => {
  const byName = { source: { mainSourceName: "Technician App" } };
  assert.equal(isTechnicianCreatedJob(byName), true);
  assert.equal(isSourceLockedJob(byName), true);
});

console.log("\n4. Partner period date locking");
const partner = {
  periodStartedAt: new Date("2026-01-01T00:00:00.000Z"),
  periodEndsAt: new Date("2026-03-01T23:59:59.000Z"),
};

test("rejects changed start date", () => {
  assert.equal(
    wouldRejectPartnerDateChange(partner, {
      periodStartedAt: "2026-02-01T00:00:00.000Z",
    }),
    true
  );
});
test("rejects changed end date", () => {
  assert.equal(
    wouldRejectPartnerDateChange(partner, {
      periodEndsAt: "2026-04-01T23:59:59.000Z",
    }),
    true
  );
});
test("allows same start date (no-op patch)", () => {
  assert.equal(
    wouldRejectPartnerDateChange(partner, {
      periodStartedAt: partner.periodStartedAt.toISOString(),
    }),
    false
  );
});
test("allows cap-only update when dates locked", () => {
  assert.equal(
    wouldRejectPartnerDateChange(partner, { currentPeriodCap: 5000 }),
    false
  );
});
test("unlocked partner allows date change", () => {
  assert.equal(
    wouldRejectPartnerDateChange(
      { periodStartedAt: null, periodEndsAt: null },
      { periodStartedAt: "2026-01-01T00:00:00.000Z" }
    ),
    false
  );
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
