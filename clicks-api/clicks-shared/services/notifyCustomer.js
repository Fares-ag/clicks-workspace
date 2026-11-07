/**
 * The one customer notifier (scenarios 46, 49, 52, 71, 73, 74, 76).
 *
 * Every customer-facing transition calls `notifyCustomer()`, from either API:
 *   1. the inbox row is written and AWAITED (so the inbox always shows what
 *      was pushed, and a dispute has a record of what the customer was told);
 *   2. the event is emitted to the customer's socket room;
 *   3. the push is sent.
 *
 * Steps 2–3 need the tech API's Socket.IO server and customer FCM app. The
 * tech API registers them as the "local transport" at socket bootstrap. In a
 * process without it (the admin API), delivery goes through the outbox
 * (CUSTOMER_NOTIFY → POST /api/notifications/internal/deliver on the tech API)
 * with a 5 s timeout and retries (scenario 68).
 *
 * `dedupeKey` makes a transition notify exactly once: the REST and socket
 * paths of the same transition, and an outbox retry of a cross-API notify,
 * resolve to the same key and the second call is a no-op.
 */
const Notification = require("../models/Notification");
const { captureException } = require("../middleware/sentry");
const {
  customerEventSpec,
  REALTIME_ONLY_EVENTS,
} = require("../constants/customerEvents");

let transport = null;

/**
 * @param {{ emit: (customerId: string, event: string, payload: object) => void,
 *           push?: (customerId: string, push: object) => Promise<unknown> } | null} t
 */
function setCustomerNotifyTransport(t) {
  transport = t && typeof t.emit === "function" ? t : null;
}

function hasLocalCustomerTransport() {
  return transport != null;
}

/** The registered transport (tests swap it out to exercise the outbox path). */
function getCustomerNotifyTransport() {
  return transport;
}

function idString(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function atKey(at) {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? String(at) : String(d.getTime());
}

/**
 * Dedupe key for a job transition. `at` is the transition's own timestamp
 * (en_route_at, on_hold_at, ...) so a repeat of the same kind of transition
 * later (a second hold) still notifies, while the same transition reported
 * twice does not.
 */
function jobEventKey(event, jobId, at) {
  const id = idString(jobId);
  if (!event || !id) return undefined;
  const suffix = atKey(at);
  return suffix ? `${event}:${id}:${suffix}` : `${event}:${id}`;
}

/**
 * Which payload timestamp identifies each transition. `null` = the event can
 * happen once per job/SOS. Events not listed are never deduped.
 */
const DEDUPE_AT_FIELD = {
  technicianAssigned: "assigned_at",
  technicianAccepted: "accepted_at",
  jobReassigning: "released_at",
  technicianEnRoute: "en_route_at",
  technicianArrived: "arrived_at",
  jobStarted: "started_at",
  jobOnHold: "on_hold_at",
  jobResumed: "resumed_at",
  jobAtGarage: "garage_sent_at",
  jobGarageReady: "garage_ready_at",
  paymentConfirmed: "paid_at",
  sosInCall: "claimed_at",
  jobCompleted: null,
  jobCancelled: null,
  sosScheduled: null,
  sosClosed: null,
  sosExpired: null,
  sosStillConnecting: null,
};

/** Default dedupe key derived from the payload (see DEDUPE_AT_FIELD). */
function defaultDedupeKey(event, payload = {}) {
  if (event === "refundProcessed" && payload.refund_id) {
    return `refundProcessed:${payload.refund_id}`;
  }
  if (!Object.prototype.hasOwnProperty.call(DEDUPE_AT_FIELD, event)) return undefined;
  const subject = payload.job_id || (event.startsWith("sos") ? payload.sos_id : "");
  if (!subject) return undefined;
  const field = DEDUPE_AT_FIELD[event];
  if (field === null) return `${event}:${subject}`;
  if (!payload[field]) return undefined;
  return jobEventKey(event, subject, payload[field]);
}

function normalizePayload(data = {}) {
  const out = { ...(data || {}) };
  for (const key of ["job_id", "sos_id", "service_request_id", "ticket_id", "refund_id"]) {
    if (out[key] != null && out[key] !== "") out[key] = idString(out[key]);
  }
  if (!out.job_id && out.jobId) out.job_id = idString(out.jobId);
  return out;
}

async function writeInboxRow(customerId, event, spec, copy, payload, dedupeKey) {
  const doc = {
    audience: "customer",
    customer_id: customerId,
    type: spec.type,
    event,
    title: copy.title,
    body: copy.body || "",
    data: {
      event,
      job_id: payload.job_id || "",
      sos_id: payload.sos_id || "",
      ...(payload.service_request_id ? { service_request_id: payload.service_request_id } : {}),
      ...(payload.ticket_id ? { ticket_id: payload.ticket_id, kind: "support_ticket" } : {}),
      ...(payload.ticket_number ? { ticket_number: payload.ticket_number } : {}),
      ...(payload.refund_id ? { refund_id: payload.refund_id } : {}),
      ...(payload.status ? { status: String(payload.status) } : {}),
      ...(copy.title_ar ? { title_ar: copy.title_ar, body_ar: copy.body_ar || "" } : {}),
    },
    read: false,
    read_by: [],
  };
  if (!dedupeKey) {
    const created = await Notification.create(doc);
    return { row: created, duplicate: false };
  }
  try {
    const res = await Notification.updateOne(
      { dedupe_key: dedupeKey },
      { $setOnInsert: { ...doc, dedupe_key: dedupeKey } },
      { upsert: true }
    );
    if (res.upsertedCount === 1 || res.upsertedId) {
      return { row: { _id: res.upsertedId?._id || res.upsertedId }, duplicate: false };
    }
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  const existing = await Notification.findOne({ dedupe_key: dedupeKey }).select("_id").lean();
  return { row: existing, duplicate: true };
}

function pushMessageFor(event, copy, payload, notificationId) {
  return {
    event,
    type: event,
    title: copy.title,
    body: copy.body || "",
    title_ar: copy.title_ar || "",
    body_ar: copy.body_ar || "",
    job_id: payload.job_id || "",
    sos_id: payload.sos_id || "",
    notification_id: notificationId || "",
    data: payload,
  };
}

async function deliverLocally(customerId, event, payload, { push = true, pushMessage } = {}) {
  try {
    transport.emit(customerId, event, payload);
  } catch (err) {
    console.error(`[notifyCustomer] emit ${event} failed:`, err.message);
    captureException(err, { component: "notifyCustomer", event });
  }
  if (push && pushMessage && typeof transport.push === "function") {
    try {
      await transport.push(customerId, pushMessage);
    } catch (err) {
      console.error(`[notifyCustomer] push ${event} failed:`, err.message);
      captureException(err, { component: "notifyCustomer", event });
    }
  }
}

/**
 * @param {string|object} customerId
 * @param {string} event   a CUSTOMER_EVENTS name, or a realtime-only event
 * @param {object} [data]  socket payload (job_id / sos_id expected)
 * @param {{ dedupeKey?: string|null, push?: boolean }} [opts]
 *   dedupeKey: explicit key; omitted → derived from the payload's transition
 *   timestamp (DEDUPE_AT_FIELD); null → never dedupe.
 * @returns {Promise<{ notificationId?: string, duplicate?: boolean, delivered?: boolean, queued?: boolean, realtimeOnly?: boolean }>}
 */
async function notifyCustomer(customerId, event, data = {}, opts = {}) {
  const cid = idString(customerId);
  const name = String(event || "").trim();
  if (!cid || !name) return { skipped: true };
  const payload = normalizePayload(data);
  const spec = customerEventSpec(name);

  if (!spec || REALTIME_ONLY_EVENTS.has(name)) {
    if (!transport) return { realtimeOnly: true, delivered: false };
    await deliverLocally(cid, name, payload, { push: false });
    return { realtimeOnly: true, delivered: true };
  }

  const copy = spec.copy(payload);
  let notificationId = null;
  try {
    const dedupeKey =
      opts.dedupeKey === null
        ? undefined
        : opts.dedupeKey || defaultDedupeKey(name, payload);
    const { row, duplicate } = await writeInboxRow(cid, name, spec, copy, payload, dedupeKey);
    notificationId = row?._id ? String(row._id) : null;
    if (duplicate) return { duplicate: true, notificationId };
  } catch (err) {
    // The customer must still hear about it; the inbox gap is reported.
    console.error(`[notifyCustomer] inbox write for ${name} failed:`, err.message);
    captureException(err, { component: "notifyCustomer", event: name });
  }

  const out = {
    ...payload,
    event: name,
    notification_id: notificationId,
    title: copy.title,
    body: copy.body || "",
  };
  const push = opts.push !== false;
  const pushMessage = pushMessageFor(name, copy, payload, notificationId);

  if (transport) {
    await deliverLocally(cid, name, out, { push, pushMessage });
    if (notificationId) {
      await Notification.updateOne(
        { _id: notificationId },
        { $set: { delivered_at: new Date() } }
      ).catch(() => {});
    }
    return { notificationId, delivered: true };
  }

  // No socket server in this process (admin API): hand delivery to the tech
  // API through the outbox. The inbox row already exists.
  const { OUTBOX_TYPES, enqueueOutboxEvent, runOutboxEventNow } = require("./outboxWorker");
  try {
    const evt = await enqueueOutboxEvent(OUTBOX_TYPES.CUSTOMER_NOTIFY, {
      customer_id: cid,
      event: name,
      payload: out,
      push,
      push_message: pushMessage,
      notification_id: notificationId,
    });
    const delivered = await runOutboxEventNow(evt._id);
    return { notificationId, queued: true, delivered };
  } catch (err) {
    console.error(`[notifyCustomer] outbox ${name} failed:`, err.message);
    captureException(err, { component: "notifyCustomer", event: name });
    return { notificationId, queued: false, delivered: false };
  }
}

/**
 * Same as notifyCustomer but never throws and returns a boolean — for call
 * sites where the state change already happened (and as the `notify`
 * callback the payment services take).
 */
async function notifyCustomerSafe(customerId, event, data = {}, opts = {}) {
  try {
    const result = await notifyCustomer(customerId, event, data, opts);
    return !result?.skipped;
  } catch (err) {
    console.error(`[notifyCustomer] ${event} failed:`, err.message);
    captureException(err, { component: "notifyCustomer", event });
    return false;
  }
}

/**
 * Tech-API side of a CUSTOMER_NOTIFY outbox event: emit + push an inbox row
 * that the admin API already wrote. Idempotent on `notification_id`, so an
 * outbox retry after a timed-out-but-delivered first attempt is a no-op.
 */
async function deliverCustomerNotification({
  customer_id,
  event,
  payload,
  push = true,
  push_message,
  notification_id,
} = {}) {
  if (!transport) {
    const err = new Error("Customer notify transport not initialised");
    err.status = 503;
    throw err;
  }
  const cid = idString(customer_id);
  if (!cid || !event) {
    const err = new Error("customer_id and event are required");
    err.status = 400;
    throw err;
  }
  if (notification_id) {
    const res = await Notification.updateOne(
      { _id: notification_id, delivered_at: null },
      { $set: { delivered_at: new Date() } }
    );
    if (!res.modifiedCount && !res.nModified) {
      return { alreadyDelivered: true };
    }
  }
  await deliverLocally(cid, String(event), payload || {}, {
    push: push !== false,
    pushMessage: push_message,
  });
  return { delivered: true };
}

module.exports = {
  notifyCustomer,
  notifyCustomerSafe,
  deliverCustomerNotification,
  setCustomerNotifyTransport,
  getCustomerNotifyTransport,
  hasLocalCustomerTransport,
  jobEventKey,
  defaultDedupeKey,
};
