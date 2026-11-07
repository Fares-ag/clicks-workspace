/**
 * Firebase Cloud Messaging — technician urgent jobs + customer job/SOS updates.
 * Graceful no-op when service account JSON env vars are unset.
 */
const CUSTOMER_APP = "customer-fcm";

let messaging = null;
let customerMessaging = null;
let initAttempted = false;
let customerInitAttempted = false;
let warnedMissing = false;
let warnedCustomerMissing = false;

const {
  CUSTOMER_EVENT_NAMES,
  customerCopyForEvent,
} = require("../../../clicks-shared/constants/customerEvents");

/** Events that warrant a customer push (every inbox event; never locationUpdate). */
const CUSTOMER_PUSH_EVENTS = new Set(CUSTOMER_EVENT_NAMES);

/** Must match clicks-user `FCMNotificationService` channel id. */
const CUSTOMER_CHANNEL_ID = "clicks_customer_channel";

function initFirebase() {
  if (initAttempted) return messaging;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set — technician push disabled"
      );
    }
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    const admin = require("firebase-admin");
    const cred = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(cred),
      });
    }
    messaging = admin.messaging();
    console.log("[fcm] firebase-admin initialized (technician)");
  } catch (err) {
    console.error("[fcm] init failed:", err.message);
    messaging = null;
  }
  return messaging;
}

function initCustomerFirebase() {
  if (customerInitAttempted) return customerMessaging;
  customerInitAttempted = true;

  const raw = process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) {
    if (!warnedCustomerMissing) {
      warnedCustomerMissing = true;
      console.warn(
        "[fcm] FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON not set — customer push disabled"
      );
    }
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    const admin = require("firebase-admin");
    const cred = JSON.parse(raw);
    let app;
    try {
      app = admin.app(CUSTOMER_APP);
    } catch (_) {
      app = admin.initializeApp(
        { credential: admin.credential.cert(cred) },
        CUSTOMER_APP
      );
    }
    customerMessaging = app.messaging();
    console.log("[fcm] firebase-admin initialized (customer)");
  } catch (err) {
    console.error("[fcm] customer init failed:", err.message);
    customerMessaging = null;
  }
  return customerMessaging;
}

function stringifyPushValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildPushData(payload) {
  const data = {};
  Object.entries(payload || {}).forEach(([k, v]) => {
    const s = stringifyPushValue(v);
    if (s !== null) data[k] = s;
  });
  return data;
}

function customerPushCopyForEvent(event, data = {}) {
  const copy = customerCopyForEvent(event, data);
  return { title: copy.title, body: copy.body };
}

/** FCM data values must be strings and the whole message under 4 KB. */
function scalarPushData(payload = {}) {
  const out = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v == null) continue;
    if (typeof v === "object") continue;
    out[k] = String(v).slice(0, 500);
  }
  return out;
}

/**
 * One job's (or SOS's) notifications share a tray entry and an iOS thread:
 * Android replaces by `tag`, iOS groups by `thread-id` and replaces by
 * `apns-collapse-id` (scenario 73: 6–8 tray entries per job became one).
 */
function customerPushGroupKey(push = {}) {
  const jobId = push.job_id || push.data?.job_id;
  if (jobId) return `job_${jobId}`;
  const sosId = push.sos_id || push.data?.sos_id;
  if (sosId) return `sos_${sosId}`;
  const ticketId = push.data?.ticket_id;
  if (ticketId) return `ticket_${ticketId}`;
  return "clicks";
}

/**
 * The customer push (scenario 69): `notification` + `apns` alert blocks so
 * iOS shows it while the app is backgrounded or closed, an Android
 * notification on the customer channel with a per-job tag, and the data block
 * the app routes on. Pure — exported for the payload-shape test.
 */
function buildCustomerPushMessage(token, push = {}) {
  const event = push.event || push.type || "";
  const fallback = customerPushCopyForEvent(event, push.data || {});
  const title = String(push.title || fallback.title || "Clicks").slice(0, 120);
  const body = String(push.body || fallback.body || "").slice(0, 400);
  const group = customerPushGroupKey(push);
  const data = {
    ...scalarPushData(push.data),
    type: String(push.type || event),
    event: String(event),
    title,
    body,
    title_ar: String(push.title_ar || ""),
    body_ar: String(push.body_ar || ""),
    job_id: String(push.job_id || push.data?.job_id || ""),
    sos_id: String(push.sos_id || push.data?.sos_id || ""),
    notification_id: String(push.notification_id || ""),
    channelId: CUSTOMER_CHANNEL_ID,
    group,
  };
  return {
    token,
    notification: { title, body },
    data,
    android: {
      priority: "high",
      collapseKey: group,
      notification: {
        channelId: CUSTOMER_CHANNEL_ID,
        tag: group,
        sound: "default",
        priority: "high",
        defaultVibrateTimings: true,
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-collapse-id": group.slice(0, 64),
      },
      payload: {
        aps: {
          alert: { title, body },
          sound: "default",
          "content-available": 1,
          "thread-id": group,
        },
      },
    },
  };
}

async function invalidateCustomerToken(customerId, failedToken) {
  if (!customerId || !failedToken) return;
  try {
    const { Customer } = require("../../../clicks-shared/models");
    // Conditional (scenario 70): a late "not-registered" for a token that has
    // since rotated must not wipe the customer's NEW, valid token.
    await Customer.updateOne(
      { _id: customerId, fcm_token: failedToken },
      { $unset: { fcm_token: 1 } }
    );
  } catch (_) {
    /* ignore */
  }
}

/**
 * Customer push for a job/SOS/support event. Called by notifyCustomer()
 * after the inbox row is written. `push` is { event, title, body, title_ar,
 * body_ar, job_id, sos_id, notification_id, data }.
 */
async function sendCustomerPush(customer, push = {}) {
  const msg = initCustomerFirebase();
  if (!msg) return false;

  const event = push?.event || push?.type || "";
  if (event && !CUSTOMER_PUSH_EVENTS.has(event)) {
    return false;
  }

  let token =
    typeof customer === "string" && customer.length > 80
      ? customer
      : null;
  let customerId =
    typeof customer === "object" && customer?._id
      ? customer._id
      : typeof customer === "string" && customer.length <= 24
        ? customer
        : null;

  if (!token) {
    if (typeof customer === "object") {
      token = customer.fcm_token || customer.fcmToken;
      customerId = customerId || customer._id;
    } else if (customerId) {
      try {
        const { Customer } = require("../../../clicks-shared/models");
        const doc = await Customer.findById(customerId).select("fcm_token").lean();
        token = doc?.fcm_token;
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (!token) {
    console.log("[fcm] no fcm_token for customer — skip push");
    return false;
  }

  const message = buildCustomerPushMessage(token, push);
  try {
    await msg.send(message);
    console.log(
      `[fcm] customer push sent (${event || message.data.type}) job=${message.data.job_id || "?"}`
    );
    return true;
  } catch (err) {
    console.error("[fcm] customer send failed:", err.message);
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      await invalidateCustomerToken(customerId, token);
    }
    return false;
  }
}

/** Must match clicks-technician `kJobUrgentChannelId`. */
const TECH_JOB_URGENT_CHANNEL = "clicks_job_urgent_v4";

function formatJobAssignedLocation(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch (_) {
      return "";
    }
  }
  let location = String(raw).trim();
  if (location.startsWith("LatLng(") && location.endsWith(")")) {
    location = location.slice(7, -1).trim();
  }
  return location;
}

function buildJobAssignedNotificationCopy(jobPayload = {}) {
  const issue = String(jobPayload.issue || "New job").trim() || "New job";
  const location = formatJobAssignedLocation(jobPayload.location);
  const body = location ? `${issue} — ${location}` : issue;
  return {
    title: "New job assigned",
    title_ar: "مهمة جديدة",
    body: body.slice(0, 240),
  };
}

/**
 * Hybrid notification+data push for a newly assigned job.
 * OS shows the tray/heads-up alert when the app is backgrounded or killed;
 * data payload still hydrates Accept / session when the app opens.
 * Foreground UX remains client-owned (insistent local channel + alarm).
 */
async function sendJobAssignedPush(technician, jobPayload) {
  const msg = initFirebase();
  if (!msg) return false;

  const token =
    typeof technician === "string"
      ? technician
      : technician?.fcm_token || technician?.fcmToken;
  if (!token) {
    console.log("[fcm] no fcm_token for technician — skip push");
    return false;
  }

  const copy = buildJobAssignedNotificationCopy(jobPayload);
  const data = buildPushData({
    ...(jobPayload || {}),
    type: (jobPayload && jobPayload.type) || "job_assigned",
    channelId: TECH_JOB_URGENT_CHANNEL,
    title: copy.title,
    body: copy.body,
    title_ar: copy.title_ar,
  });
  const jobId = data.job_id || "";

  const androidNotification = {
    channelId: TECH_JOB_URGENT_CHANNEL,
    sound: "job_urgent",
    priority: "max",
    visibility: "public",
    defaultVibrateTimings: true,
  };
  if (jobId) {
    androidNotification.tag = jobId;
  }

  try {
    await msg.send({
      token,
      notification: {
        title: copy.title,
        body: copy.body,
      },
      data,
      android: {
        priority: "high",
        notification: androidNotification,
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: {
              title: copy.title,
              body: copy.body,
            },
            sound: "default",
            "content-available": 1,
          },
        },
      },
    });
    console.log(`[fcm] job_assigned push sent for job ${jobId || "?"}`);
    return true;
  } catch (err) {
    console.error("[fcm] send failed:", err.message);
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      try {
        const { Technician } = require("../../../clicks-shared/models");
        const id =
          typeof technician === "object" && technician?._id
            ? technician._id
            : null;
        if (id) {
          await Technician.findByIdAndUpdate(id, { fcm_token: null });
        }
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  }
}

/**
 * Partner accrual credit push (+QAR credited).
 */
async function sendPartnerAccrualPush(partner, amountQar) {
  const msg = initFirebase();
  if (!msg) return false;

  const token = partner?.fcm_token;
  if (!token) {
    console.log("[fcm] no fcm_token for partner — skip push");
    return false;
  }

  const amount = Math.round(Number(amountQar) || 0);
  const titleEn = "Clicks Partner";
  const bodyEn = `+QAR ${amount} credited`;

  try {
    await msg.send({
      token,
      notification: {
        title: titleEn,
        body: bodyEn,
      },
      data: {
        type: "partner_accrual",
        amount: String(amount),
        title_en: titleEn,
        body_en: bodyEn,
        title_ar: "كليكس بارتنر",
        body_ar: `+${amount} ر.ق تم إضافتها`,
        channelId: "clicks_partner_accrual",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "clicks_partner_accrual",
          sound: "default",
        },
      },
    });
    console.log(`[fcm] partner accrual push sent (+QAR ${amount})`);
    return true;
  } catch (err) {
    console.error("[fcm] partner send failed:", err.message);
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      try {
        const Partner = require("../../../clicks-shared/models/Partner");
        if (partner?._id) {
          await Partner.findByIdAndUpdate(partner._id, { fcm_token: null });
        }
      } catch (_) {
        /* ignore */
      }
    }
    return false;
  }
}

/** Ops admin roles that receive dispatch push alerts. */
const ADMIN_OPS_ROLES = [
  "Super Admin",
  "Admin",
  "Job Dispatcher",
  "Coordinator",
  "Call Center Agent",
];

const ADMIN_DISPATCH_CHANNEL = "clicks_admin_dispatch_v1";

const ADMIN_DISPATCH_COPY = {
  admin_sos: {
    title: "New SOS request",
    body: "A customer needs immediate assistance.",
  },
  admin_service_request: {
    title: "New service request",
    body: "A customer submitted a service request.",
  },
};

/**
 * Push dispatch alerts to all active ops admins with registered FCM tokens.
 * Fire-and-forget — socket remains the primary realtime path.
 */
async function sendAdminDispatchPush(type, payload = {}) {
  const msg = initFirebase();
  if (!msg) return false;

  const copy = ADMIN_DISPATCH_COPY[type] || {
    title: "Clicks Admin",
    body: "You have a new dispatch alert.",
  };

  let admins;
  try {
    const { Admin } = require("../../../clicks-shared/models");
    admins = await Admin.find({
      isActive: true,
      role: { $in: ADMIN_OPS_ROLES },
      fcm_token: { $exists: true, $nin: [null, ""] },
    })
      .select("_id fcm_token role")
      .lean();
  } catch (err) {
    console.error("[fcm] admin dispatch query failed:", err.message);
    return false;
  }

  if (!admins.length) {
    console.log("[fcm] no admin fcm_token — skip dispatch push");
    return false;
  }

  const data = buildPushData({
    ...(payload || {}),
    type,
    channelId: ADMIN_DISPATCH_CHANNEL,
    title: copy.title,
    body: copy.body,
  });

  let sent = 0;
  await Promise.all(
    admins.map(async (admin) => {
      try {
        await msg.send({
          token: admin.fcm_token,
          notification: {
            title: copy.title,
            body: copy.body,
          },
          data,
          android: {
            priority: "high",
            notification: {
              channelId: ADMIN_DISPATCH_CHANNEL,
              sound: "default",
              priority: "high",
            },
          },
        });
        sent += 1;
      } catch (err) {
        console.error("[fcm] admin dispatch send failed:", err.message);
        if (
          err.code === "messaging/registration-token-not-registered" ||
          err.code === "messaging/invalid-registration-token"
        ) {
          try {
            const { Admin } = require("../../../clicks-shared/models");
            await Admin.findByIdAndUpdate(admin._id, { fcm_token: null });
          } catch (_) {
            /* ignore */
          }
        }
      }
    })
  );

  if (sent > 0) {
    console.log(`[fcm] admin dispatch push sent (${type}) to ${sent} device(s)`);
  }
  return sent > 0;
}

async function sendJobReassignedPush(technician, { job_id, reason }) {
  const msg = initFirebase();
  if (!msg) return false;

  const token =
    typeof technician === "string"
      ? technician
      : technician?.fcm_token || technician?.fcmToken;
  if (!token) return false;

  const title = "Job reassigned";
  const body = "This job was moved to another technician.";
  const data = buildPushData({
    type: "job_reassigned",
    job_id: job_id || "",
    reason: reason || "",
    title,
    body,
  });

  try {
    await msg.send({
      token,
      notification: { title, body },
      data,
      android: { priority: "high" },
    });
    return true;
  } catch (err) {
    console.error("[fcm] job_reassigned send failed:", err.message);
    return false;
  }
}

module.exports = {
  sendJobAssignedPush,
  sendJobReassignedPush,
  sendPartnerAccrualPush,
  sendCustomerPush,
  sendAdminDispatchPush,
  customerPushCopyForEvent,
  buildCustomerPushMessage,
  customerPushGroupKey,
  CUSTOMER_CHANNEL_ID,
  initFirebase,
  initCustomerFirebase,
  CUSTOMER_PUSH_EVENTS,
};
