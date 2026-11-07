/**
 * SOS escalation ladder (scenarios 38, 39, 40).
 *
 * Nothing used to watch the clock: an SOS nobody picked up sat "pending"
 * forever, and a dispatcher who claimed one and walked away locked it. This
 * sweeper runs every 30 s from the customer/tech API:
 *
 *   pending >= 2 min  -> level 1: re-push every dispatcher + admin socket alert
 *   pending >= 5 min  -> level 2: SMS the on-call manager(s); with none
 *                        configured, push + socket-alert all admins
 *   pending >= 8 min  -> level 3: tell the customer "still connecting you —
 *                        tap to call" with the support number
 *   in_call, no job, claimed >= 5 min -> claim released back to pending,
 *                        dispatchers re-alerted, audit-logged
 *
 * Every step is a conditional update on escalation_level (or on the claim),
 * so a restart or a second instance cannot send the same step twice. A Mongo
 * lease (`ops_leases`) keeps a second instance from even running the sweep
 * concurrently.
 */
const crypto = require("crypto");
const SOSRequest = require("../models/SOSRequest");
const AdminAuditLog = require("../models/AdminAuditLog");
const { durationEnv } = require("../utils/durationEnv");

const LEASE_NAME = "sos-escalation";
const BATCH_LIMIT = 100;

function escalationConfig() {
  return {
    repushMs: durationEnv("SOS_ESCALATE_REPUSH_MS", 2 * 60 * 1000),
    oncallMs: durationEnv("SOS_ESCALATE_ONCALL_MS", 5 * 60 * 1000),
    customerMs: durationEnv("SOS_ESCALATE_CUSTOMER_MS", 8 * 60 * 1000),
    claimReleaseMs: durationEnv("SOS_CLAIM_RELEASE_MS", 5 * 60 * 1000),
    intervalMs: durationEnv("SOS_ESCALATION_SWEEP_MS", 30 * 1000),
  };
}

// ---------------------------------------------------------------------------
// Lease: the shared ops lease (clicks-shared/services/opsLease.js), with this
// sweeper's owner string as the lease holder.
// ---------------------------------------------------------------------------

const { acquireLease: acquireOpsLease } = require("./opsLease");
const OpsLease = require("../models/OpsLease");

/** Take or renew the named lease. True when this owner holds it afterwards. */
async function acquireLease(name, owner, ttlMs, now = new Date()) {
  return Boolean(await acquireOpsLease(name, ttlMs, { holder: owner, now }));
}

async function releaseLease(name, owner) {
  try {
    await OpsLease.deleteOne({ _id: name, holder: owner });
  } catch (err) {
    console.error("[sos-escalation] lease release failed:", err.message);
  }
}

// ---------------------------------------------------------------------------

async function safe(fn, ...args) {
  if (typeof fn !== "function") return undefined;
  try {
    return await fn(...args);
  } catch (err) {
    console.error("[sos-escalation] notifier failed:", err.message);
    return undefined;
  }
}

function ageSeconds(sos, now) {
  return Math.max(
    0,
    Math.round((now.getTime() - new Date(sos.createdAt).getTime()) / 1000)
  );
}

async function customerSummary(sos) {
  try {
    const Customer = require("../models/Customer");
    const c = await Customer.findById(sos.customer_id)
      .select("first_name last_name phone_number")
      .lean();
    if (!c) return { name: "", phone: "" };
    return {
      name: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
      phone: c.phone_number || "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

/** Rows written before the field existed have no escalation_level at all. */
function belowLevel(level) {
  return {
    $or: [{ escalation_level: { $lt: level } }, { escalation_level: null }],
  };
}

/** CAS one ladder step. True only for the caller that moved the level. */
async function claimLevel(sosId, level, now) {
  const res = await SOSRequest.updateOne(
    { _id: sosId, status: "pending", ...belowLevel(level) },
    { $set: { escalation_level: level, last_escalated_at: now } }
  );
  return (res.modifiedCount ?? res.nModified ?? 0) === 1;
}

function alertPayload(sos, level, now, extra = {}) {
  return {
    sos_id: String(sos._id),
    customer_id: String(sos.customer_id),
    escalation_level: level,
    age_seconds: ageSeconds(sos, now),
    outstanding_balance: sos.outstanding_balance || 0,
    ...extra,
  };
}

async function stepRepush(sos, now, notifier) {
  const payload = alertPayload(sos, 1, now);
  await safe(notifier.adminAlert, "sosEscalated", payload);
  await safe(notifier.adminPush, "admin_sos", {
    sos_id: payload.sos_id,
    customer_id: payload.customer_id,
    escalation_level: "1",
  });
  await safe(notifier.recordAdminNotification, {
    type: "sos.escalated",
    title: "SOS still waiting",
    body: "An SOS has been pending for over 2 minutes with no dispatcher.",
    data: { sos_id: payload.sos_id, escalation_level: "1" },
  });
}

async function stepOncall(sos, now, notifier) {
  const { getOncallPhones } = require("./opsSettings");
  const phones = await getOncallPhones().catch(() => []);
  const customer = await customerSummary(sos);
  const minutes = Math.floor(ageSeconds(sos, now) / 60);
  const payload = alertPayload(sos, 2, now, {
    oncall_paged: phones.length,
    audience: phones.length ? "oncall" : "all_admins",
  });

  if (phones.length) {
    const message =
      `Clicks SOS ESCALATION: ${customer.name || "a customer"}` +
      `${customer.phone ? ` (${customer.phone})` : ""} has waited ${minutes} min ` +
      `with no dispatcher. SOS ${payload.sos_id}. Open the admin SOS screen now.`;
    for (const phone of phones) {
      await safe(notifier.sendSms, phone, message);
    }
  } else {
    // No on-call configured: every admin hears about it instead.
    await safe(notifier.adminPush, "admin_sos", {
      sos_id: payload.sos_id,
      customer_id: payload.customer_id,
      escalation_level: "2",
    });
  }
  await safe(notifier.adminAlert, "sosEscalated", payload);
  await safe(notifier.recordAdminNotification, {
    type: "sos.escalated",
    title: "SOS escalated to on-call",
    body: `An SOS has been pending for ${minutes} minutes.`,
    data: { sos_id: payload.sos_id, escalation_level: "2" },
  });
  return phones;
}

async function stepCustomer(sos, now, notifier) {
  const { getSupportPhone } = require("./opsSettings");
  const supportPhone = await getSupportPhone().catch(() => null);
  const payload = {
    sos_id: String(sos._id),
    status: "pending",
    escalation_level: 3,
    support_phone: supportPhone || null,
    message: "Still connecting you. Tap to call us now.",
  };
  await safe(notifier.customerEvent, String(sos.customer_id), "sosStillConnecting", payload);
  await safe(notifier.adminAlert, "sosEscalated", alertPayload(sos, 3, now));
}

async function releaseStaleClaims(now, cfg, notifier) {
  const cutoff = new Date(now.getTime() - cfg.claimReleaseMs);
  const stale = await SOSRequest.find({
    status: "in_call",
    job_id: null,
    $or: [
      { claimed_at: { $lte: cutoff } },
      { claimed_at: null, in_call_at: { $lte: cutoff } },
    ],
  })
    .select("_id customer_id claimed_by claimed_at in_call_at createdAt outstanding_balance")
    .limit(BATCH_LIMIT)
    .lean();

  const released = [];
  for (const sos of stale) {
    const res = await SOSRequest.updateOne(
      {
        _id: sos._id,
        status: "in_call",
        job_id: null,
        claimed_by: sos.claimed_by || null,
        claimed_at: sos.claimed_at || null,
      },
      {
        // $unset, not null: the socket claim path stamps claimed_at/in_call_at
        // with $min, and $min keeps an existing null (null sorts below dates),
        // which would make a re-claimed SOS look stale and release instantly.
        $set: { status: "pending", claim_released_at: now },
        $unset: { claimed_by: "", claimed_at: "", in_call_at: "" },
        $inc: { claim_release_count: 1 },
      }
    );
    if ((res.modifiedCount ?? res.nModified ?? 0) !== 1) continue;
    released.push(String(sos._id));

    if (sos.claimed_by) {
      await AdminAuditLog.create({
        admin_id: sos.claimed_by,
        admin_role: "system",
        action: "sos.claim_auto_release",
        entity_type: "sos",
        entity_id: sos._id,
        changes: {
          status: { from: "in_call", to: "pending" },
          claimed_by: { from: String(sos.claimed_by), to: null },
          claimed_at: {
            from: sos.claimed_at ? new Date(sos.claimed_at).toISOString() : null,
            to: null,
          },
          reason: `No job ${Math.round(cfg.claimReleaseMs / 60000)} min after claim`,
        },
      }).catch((err) => {
        console.error("[sos-escalation] audit write failed:", err.message);
      });
    }

    const payload = {
      sos_id: String(sos._id),
      customer_id: String(sos.customer_id),
      previous_admin_id: sos.claimed_by ? String(sos.claimed_by) : null,
      status: "pending",
      age_seconds: ageSeconds(sos, now),
    };
    await safe(notifier.adminAlert, "sosClaimReleased", payload);
    await safe(notifier.adminPush, "admin_sos", {
      sos_id: payload.sos_id,
      customer_id: payload.customer_id,
      claim_released: "1",
    });
    await safe(notifier.recordAdminNotification, {
      type: "sos.claim_released",
      title: "SOS claim released",
      body: "A claimed SOS had no job after 5 minutes and is back in the queue.",
      data: { sos_id: payload.sos_id },
    });
  }
  return released;
}

async function runLadderStep(level, thresholdMs, now, step, notifier) {
  const cutoff = new Date(now.getTime() - thresholdMs);
  const due = await SOSRequest.find({
    status: "pending",
    ...belowLevel(level),
    createdAt: { $lte: cutoff },
  })
    .sort({ createdAt: 1 })
    .limit(BATCH_LIMIT)
    .lean();
  const fired = [];
  for (const sos of due) {
    if (!(await claimLevel(sos._id, level, now))) continue;
    fired.push(String(sos._id));
    await step(sos, now, notifier);
  }
  return fired;
}

/**
 * One pass of the ladder. Safe to call concurrently and repeatedly.
 * @param {{ now?: Date, notifier?: object, owner?: string, config?: object }} [opts]
 */
async function runEscalationSweep({
  now = new Date(),
  notifier = {},
  owner = "manual",
  config,
} = {}) {
  const cfg = { ...escalationConfig(), ...(config || {}) };
  const leaseTtl = Math.max(cfg.intervalMs * 3, 30_000);
  if (!(await acquireLease(LEASE_NAME, owner, leaseTtl, now))) {
    return { skipped: true, reason: "lease_held" };
  }

  const released = await releaseStaleClaims(now, cfg, notifier);
  const repushed = await runLadderStep(1, cfg.repushMs, now, stepRepush, notifier);
  const oncall = await runLadderStep(2, cfg.oncallMs, now, stepOncall, notifier);
  const customer = await runLadderStep(3, cfg.customerMs, now, stepCustomer, notifier);

  return { skipped: false, released, repushed, oncall, customer };
}

/**
 * Start the periodic sweeper (customer/tech API only). The timer is unref'd;
 * stop it on SIGTERM with stopSosEscalationSweeper.
 */
function startSosEscalationSweeper({ notifier = {}, intervalMs } = {}) {
  const cfg = escalationConfig();
  const every = intervalMs || cfg.intervalMs;
  const handle = {
    owner: `${process.env.RAILWAY_REPLICA_ID || process.pid}-${crypto
      .randomBytes(4)
      .toString("hex")}`,
    running: false,
    stopped: false,
    timer: null,
  };

  const tick = async () => {
    if (handle.running || handle.stopped) return;
    handle.running = true;
    try {
      await runEscalationSweep({ notifier, owner: handle.owner });
    } catch (err) {
      console.error("[sos-escalation] sweep failed:", err.message);
      try {
        const { captureException } = require("../middleware/sentry");
        captureException(err, { source: "sos-escalation" });
      } catch {
        /* ignore */
      }
    } finally {
      handle.running = false;
    }
  };

  handle.timer = setInterval(tick, every);
  handle.timer.unref?.();
  return handle;
}

async function stopSosEscalationSweeper(handle) {
  if (!handle) return;
  handle.stopped = true;
  if (handle.timer) clearInterval(handle.timer);
  await releaseLease(LEASE_NAME, handle.owner);
}

module.exports = {
  escalationConfig,
  runEscalationSweep,
  startSosEscalationSweeper,
  stopSosEscalationSweeper,
  LEASE_NAME,
};
