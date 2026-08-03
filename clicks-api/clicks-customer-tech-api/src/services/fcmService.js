/**
 * Firebase Cloud Messaging for technician urgent job alerts.
 * Graceful no-op when FIREBASE_SERVICE_ACCOUNT_JSON is unset.
 */
let messaging = null;
let initAttempted = false;
let warnedMissing = false;

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
    console.log("[fcm] firebase-admin initialized");
  } catch (err) {
    console.error("[fcm] init failed:", err.message);
    messaging = null;
  }
  return messaging;
}

/**
 * Data-only high-priority Android push for a newly assigned job.
 * Client owns channel UX (clicks_job_urgent_v2).
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

  const data = {};
  Object.entries(jobPayload || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    data[k] = typeof v === "string" ? v : String(v);
  });
  data.type = data.type || "job_assigned";
  data.channelId = "clicks_job_urgent_v4";

  try {
    await msg.send({
      token,
      data,
      android: {
        priority: "high",
        // Data-only: client displays via flutter_local_notifications
      },
    });
    console.log(`[fcm] job_assigned push sent for job ${data.job_id || "?"}`);
    return true;
  } catch (err) {
    console.error("[fcm] send failed:", err.message);
    // Drop invalid tokens so we stop spamming
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

module.exports = {
  sendJobAssignedPush,
  sendPartnerAccrualPush,
  initFirebase,
};

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
