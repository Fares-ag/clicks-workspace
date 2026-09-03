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

/** Events that warrant a customer push (skip high-frequency locationUpdate). */
const CUSTOMER_PUSH_EVENTS = new Set([
  "technicianAssigned",
  "technicianAccepted",
  "technicianEnRoute",
  "technicianArrived",
  "jobStarted",
  "jobCompleted",
  "jobCancelled",
  "paymentConfirmed",
  "sosInCall",
]);

const CUSTOMER_PUSH_COPY = {
  technicianAssigned: {
    title: "Technician assigned",
    body: "A technician has been assigned to your request.",
  },
  technicianAccepted: {
    title: "Technician confirmed",
    body: "Your technician accepted the job.",
  },
  technicianEnRoute: {
    title: "On the way",
    body: "Your technician is heading to your location.",
  },
  technicianArrived: {
    title: "Technician arrived",
    body: "Your technician has arrived at your location.",
  },
  jobStarted: {
    title: "Service started",
    body: "Your technician has started working on your vehicle.",
  },
  jobCompleted: {
    title: "Service complete",
    body: "Your service has been completed. Thank you for using Clicks!",
  },
  jobCancelled: {
    title: "Job cancelled",
    body: "Your service request was cancelled.",
  },
  paymentConfirmed: {
    title: "Payment received",
    body: "Payment confirmed. Thank you!",
  },
  sosInCall: {
    title: "Clicks support",
    body: "An operator is reviewing your request and will call you shortly.",
  },
};

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
  const base = CUSTOMER_PUSH_COPY[event] || {
    title: "Clicks",
    body: "You have a new update on your request.",
  };
  const technicianName =
    data.technician?.name ||
    data.technician_name ||
    (typeof data.technician === "object" && data.technician
      ? `${data.technician.firstName || ""} ${data.technician.lastName || ""}`.trim()
      : "");
  if (technicianName && event === "technicianAssigned") {
    return {
      title: base.title,
      body: `${technicianName} has been assigned to your request.`,
    };
  }
  if (technicianName && event === "technicianAccepted") {
    return {
      title: base.title,
      body: `${technicianName} accepted your job.`,
    };
  }
  return base;
}

async function invalidateCustomerToken(customerId) {
  if (!customerId) return;
  try {
    const { Customer } = require("../../../clicks-shared/models");
    await Customer.findByIdAndUpdate(customerId, { fcm_token: null });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Data-only high-priority Android push for customer job/SOS events.
 * Client owns channel UX (clicks_customer_channel).
 */
async function sendCustomerPush(customer, payload) {
  const msg = initCustomerFirebase();
  if (!msg) return false;

  const event = payload?.event || payload?.type || "";
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

  const copy = customerPushCopyForEvent(event, payload?.data || payload || {});
  const data = buildPushData({
    ...(payload?.data || {}),
    ...payload,
    type: payload?.type || event,
    event,
    title: payload?.title || copy.title,
    body: payload?.body || copy.body,
    channelId: "clicks_customer_channel",
  });
  delete data.data;

  try {
    await msg.send({
      token,
      data,
      android: {
        priority: "high",
      },
    });
    console.log(
      `[fcm] customer push sent (${event || data.type}) job=${data.job_id || "?"}`
    );
    return true;
  } catch (err) {
    console.error("[fcm] customer send failed:", err.message);
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      await invalidateCustomerToken(customerId);
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

module.exports = {
  sendJobAssignedPush,
  sendPartnerAccrualPush,
  sendCustomerPush,
  sendAdminDispatchPush,
  customerPushCopyForEvent,
  initFirebase,
  initCustomerFirebase,
  CUSTOMER_PUSH_EVENTS,
};
