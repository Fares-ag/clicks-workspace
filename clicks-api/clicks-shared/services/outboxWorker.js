const axios = require("axios");
const OutboxEvent = require("../models/OutboxEvent");
const { captureException } = require("../middleware/sentry");

const OUTBOX_TYPES = {
  ADMIN_BUSINESS_JOB_NOTIFY: "admin_business_job_notify",
  PARTNER_ACCRUAL: "partner_accrual",
  TECHNICIAN_CREDIT: "technician_credit",
  /** Admin API → tech API internal call (`notify-technician`, `notify-claim`, ...). */
  TECH_API_NOTIFY: "tech_api_notify",
  /** Deliver an already-written customer inbox row (socket + push) via the tech API. */
  CUSTOMER_NOTIFY: "customer_notify",
};

/** Cross-API notify calls fail fast; the outbox retries them (scenario 68). */
function techApiNotifyTimeoutMs() {
  const n = Number(process.env.TECH_API_NOTIFY_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

async function postInternal(path, body, { outboxEventId } = {}) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error(`INTERNAL_API_SECRET missing — cannot call ${path}`);
  }
  const base = process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
  const headers = { "x-internal-secret": secret };
  if (outboxEventId) headers["x-outbox-event-id"] = String(outboxEventId);
  const res = await axios.post(`${base}${path}`, body, {
    headers,
    timeout: techApiNotifyTimeoutMs(),
    validateStatus: () => true,
  });
  const status = Number(res?.status) || 0;
  if (status < 200 || status >= 300) {
    throw new Error(`${path} returned ${status}: ${JSON.stringify(res?.data ?? null).slice(0, 300)}`);
  }
  return res;
}

const MAX_ATTEMPTS = 8;
const CLAIM_STALE_MS = 5 * 60 * 1000;
const BACKOFF_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
  60 * 60 * 1000,
  60 * 60 * 1000,
  60 * 60 * 1000,
  60 * 60 * 1000,
];

async function enqueueOutboxEvent(type, payload, { session = null } = {}) {
  const doc = {
    type,
    payload,
    status: "pending",
    attempts: 0,
    next_attempt_at: new Date(),
  };
  if (session) {
    const [created] = await OutboxEvent.create([doc], { session });
    return created;
  }
  return OutboxEvent.create(doc);
}

async function claimNextEvent(types) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  return OutboxEvent.findOneAndUpdate(
    {
      type: { $in: types },
      status: "pending",
      next_attempt_at: { $lte: now },
      $or: [{ claimed_at: null }, { claimed_at: { $lt: staleBefore } }],
    },
    { $set: { claimed_at: now } },
    { new: true, sort: { next_attempt_at: 1 } }
  );
}

async function markSent(event) {
  await OutboxEvent.updateOne(
    { _id: event._id },
    { $set: { status: "sent", sent_at: new Date() }, $unset: { claimed_at: 1 } }
  );
}

async function markFailedOrRetry(event, err) {
  const message = err?.message || String(err);

  const updated = await OutboxEvent.findOneAndUpdate(
    { _id: event._id },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!updated) return;

  const attempts = updated.attempts;

  if (attempts >= MAX_ATTEMPTS) {
    await OutboxEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          status: "failed",
          last_error: message,
        },
        $unset: { claimed_at: 1 },
      }
    );
    console.error(
      `[outbox] event ${event._id} type=${event.type} exhausted after ${attempts} attempts: ${message}`
    );
    captureException(err, {
      outboxEventId: event._id.toString(),
      outboxType: event.type,
      outboxAttempts: attempts,
    });
    return;
  }

  const delay =
    BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS.at(-1);
  await OutboxEvent.updateOne(
    { _id: event._id },
    {
      $set: {
        last_error: message,
        next_attempt_at: new Date(Date.now() + delay),
        claimed_at: null,
      },
    }
  );
}

async function dispatchAdminBusinessJobNotify(payload) {
  const targetPath = payload?.targetPath;
  const body = payload?.body;
  if (!targetPath || !body) {
    throw new Error("admin_business_job_notify payload missing targetPath or body");
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error("INTERNAL_API_SECRET missing — cannot notify admins of business lead");
  }

  const customerTechApiUrl =
    process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
  const notifyRes = await axios.post(`${customerTechApiUrl}${targetPath}`, body, {
    headers: { "x-internal-secret": secret },
    timeout: 8000,
    validateStatus: () => true,
  });

  if (notifyRes.status < 200 || notifyRes.status >= 300) {
    throw new Error(
      `Notify returned ${notifyRes.status}: ${JSON.stringify(notifyRes.data)}`
    );
  }
}

async function dispatchPartnerAccrual(payload) {
  const jobId = payload?.job_id;
  if (!jobId) {
    throw new Error("partner_accrual payload missing job_id");
  }

  const Job = require("../models/Job");
  const { accruePartnerFromCompletedJob } = require("./partnerService");
  const job = await Job.findById(jobId).populate("source", "mainSourceName");
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  await accruePartnerFromCompletedJob(job);
}

async function dispatchTechnicianCredit(payload) {
  const jobId = payload?.job_id;
  if (!jobId) {
    throw new Error("technician_credit payload missing job_id");
  }

  const Job = require("../models/Job");
  const { creditTechnicianForJob } = require("./technicianCredit");
  const job = await Job.findById(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  await creditTechnicianForJob(job);
}

async function dispatchTechApiNotify(payload, event) {
  const path = payload?.path;
  if (!path || typeof path !== "string" || !path.startsWith("/api/")) {
    throw new Error("tech_api_notify payload missing a /api/ path");
  }
  await postInternal(path, payload.body || {}, { outboxEventId: event?._id });
}

async function dispatchCustomerNotify(payload, event) {
  if (!payload?.customer_id || !payload?.event) {
    throw new Error("customer_notify payload missing customer_id or event");
  }
  await postInternal("/api/notifications/internal/deliver", payload, {
    outboxEventId: event?._id,
  });
}

async function dispatchEvent(event) {
  switch (event.type) {
    case OUTBOX_TYPES.TECH_API_NOTIFY:
      await dispatchTechApiNotify(event.payload, event);
      break;
    case OUTBOX_TYPES.CUSTOMER_NOTIFY:
      await dispatchCustomerNotify(event.payload, event);
      break;
    case OUTBOX_TYPES.ADMIN_BUSINESS_JOB_NOTIFY:
      await dispatchAdminBusinessJobNotify(event.payload);
      break;
    case OUTBOX_TYPES.PARTNER_ACCRUAL:
      await dispatchPartnerAccrual(event.payload);
      break;
    case OUTBOX_TYPES.TECHNICIAN_CREDIT:
      await dispatchTechnicianCredit(event.payload);
      break;
    default:
      throw new Error(`Unknown outbox event type: ${event.type}`);
  }
}

/**
 * Try one just-enqueued event right away (after its transaction committed), so
 * the common case is synchronous. If it fails it stays pending with backoff and
 * the worker retries it; the claim stops the worker and this call both running it.
 * @returns {Promise<boolean>} true when delivered
 */
async function runOutboxEventNow(eventId) {
  if (!eventId) return false;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const event = await OutboxEvent.findOneAndUpdate(
    {
      _id: eventId,
      status: "pending",
      $or: [{ claimed_at: null }, { claimed_at: { $lt: staleBefore } }],
    },
    { $set: { claimed_at: now } },
    { new: true }
  );
  if (!event) return false;
  try {
    await dispatchEvent(event);
    await markSent(event);
    return true;
  } catch (err) {
    await markFailedOrRetry(event, err);
    return false;
  }
}

/** Admin view: events that exhausted their retries. */
async function listFailedOutboxEvents({ page = 1, limit = 50, type } = {}) {
  const filter = { status: "failed" };
  if (type) filter.type = String(type);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const [events, total] = await Promise.all([
    OutboxEvent.find(filter)
      .sort({ created_at: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    OutboxEvent.countDocuments(filter),
  ]);
  return { events, total, page: safePage, limit: safeLimit };
}

/**
 * Put a failed event back in the queue with a fresh retry budget. Handlers are
 * idempotent (credit ledger, partner earning rows), so a replay never double-pays.
 * @param {{ runNow?: boolean }} options — also attempt delivery immediately
 */
async function replayOutboxEvent(eventId, { runNow = true } = {}) {
  const event = await OutboxEvent.findOneAndUpdate(
    { _id: eventId, status: "failed" },
    {
      $set: {
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date(),
        claimed_at: null,
      },
    },
    { new: true }
  );
  if (!event) return { replayed: false, event: await OutboxEvent.findById(eventId).lean() };
  let delivered = false;
  if (runNow) delivered = await runOutboxEventNow(event._id);
  return {
    replayed: true,
    delivered,
    event: await OutboxEvent.findById(event._id).lean(),
  };
}

/**
 * Poll and dispatch due outbox events. Each API starts this with only the types it handles.
 * @param {number} intervalMs
 * @param {{ types: string[] }} options
 * @returns {{ interval: NodeJS.Timeout, stopped: boolean, ticking: boolean, inFlightTick: Promise<void>|null }}
 */
function startOutboxWorker(intervalMs = 30000, { types }) {
  if (!Array.isArray(types) || types.length === 0) {
    throw new Error("startOutboxWorker requires a non-empty types array");
  }

  const handle = {
    interval: null,
    stopped: false,
    ticking: false,
    inFlightTick: null,
  };

  const tick = async () => {
    if (handle.ticking || handle.stopped) return;
    handle.ticking = true;
    handle.inFlightTick = (async () => {
      try {
        let event = await claimNextEvent(types);
        while (event) {
          try {
            await dispatchEvent(event);
            await markSent(event);
          } catch (err) {
            await markFailedOrRetry(event, err);
          }
          event = await claimNextEvent(types);
        }
      } catch (err) {
        console.error("[outbox] worker tick error:", err.message);
        captureException(err, { outboxWorker: "tick" });
      } finally {
        handle.ticking = false;
      }
    })();
    await handle.inFlightTick;
    handle.inFlightTick = null;
  };

  tick();
  handle.interval = setInterval(tick, intervalMs);
  handle.interval.unref?.();

  return handle;
}

/**
 * Stop polling and wait for the in-flight tick to finish (sent or retry-scheduled).
 * @param {{ interval?: NodeJS.Timeout, stopped?: boolean, ticking?: boolean, inFlightTick?: Promise<void>|null }} handle
 */
async function stopOutboxWorker(handle) {
  if (!handle) return;

  handle.stopped = true;
  if (handle.interval) {
    clearInterval(handle.interval);
    handle.interval = null;
  }

  if (handle.inFlightTick) {
    await handle.inFlightTick;
  }

  while (handle.ticking) {
    if (handle.inFlightTick) {
      await handle.inFlightTick;
    } else {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

module.exports = {
  OUTBOX_TYPES,
  enqueueOutboxEvent,
  runOutboxEventNow,
  listFailedOutboxEvents,
  replayOutboxEvent,
  startOutboxWorker,
  stopOutboxWorker,
  dispatchTechnicianCredit,
  techApiNotifyTimeoutMs,
};
