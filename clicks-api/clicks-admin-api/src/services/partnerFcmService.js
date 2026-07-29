/**
 * Partner accrual push via FCM.
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
        "[partner-fcm] FIREBASE_SERVICE_ACCOUNT_JSON not set — partner push disabled"
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
  } catch (err) {
    console.error("[partner-fcm] init failed:", err.message);
    messaging = null;
  }
  return messaging;
}

/**
 * Notify partner that QAR was credited from an attributed job.
 * Uses notification+data so the OS can show a banner when backgrounded.
 */
async function sendPartnerAccrualPush(partner, amountQar) {
  const msg = initFirebase();
  if (!msg) return false;

  const token = partner?.fcm_token;
  if (!token) {
    console.log("[partner-fcm] no fcm_token — skip push");
    return false;
  }

  const amount = Math.round(Number(amountQar) || 0);
  const titleEn = "Clicks Partner";
  const bodyEn = `+QAR ${amount} credited`;
  const titleAr = "كليكس بارتنر";
  const bodyAr = `+${amount} ر.ق تم إضافتها`;

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
        title_ar: titleAr,
        body_ar: bodyAr,
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
    console.log(`[partner-fcm] accrual push sent (+QAR ${amount})`);
    return true;
  } catch (err) {
    console.error("[partner-fcm] send failed:", err.message);
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

module.exports = { sendPartnerAccrualPush, initFirebase };
