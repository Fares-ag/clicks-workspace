/**
 * Safe OTP lookup and comparison.  NEW FILE.
 *
 * Closes the unauthenticated account-takeover hole (audit P0-1).
 *
 * The vulnerable pattern this replaces appeared in EIGHT places, not the six
 * originally scoped:
 *
 *     const rec = await OTPVerification.findOne({ phone, otp, purpose });
 *
 * `otp` came straight from req.body. Mongoose does not strip query operators,
 * so `{"otp": {"$gt": ""}}` matched any stored code without the attacker ever
 * seeing the SMS. Centralising it here means a future OTP flow cannot
 * reintroduce the bug by copy-paste.
 *
 * Two rules, both non-negotiable:
 *   1. The user-supplied code NEVER enters the query filter. Look the record
 *      up by phone + purpose, then compare in application code.
 *   2. Compare with timingSafeEqual, so response latency does not leak how
 *      many leading digits were right.
 */

const crypto = require("crypto");

const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

/** Coerce to a primitive string. Objects/arrays become "" instead of surviving
 *  as a query operator. Duplicated from utils/coerce.js so this file has no
 *  internal imports and can be dropped into either API unchanged. */
function toStr(v, maxLength = 12) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.slice(0, maxLength);
  if (typeof v === "number") return String(v);
  return "";
}

function isSixDigit(s) {
  return /^\d{6}$/.test(s);
}

/**
 * Look up and verify an OTP.
 *
 * @param {Model}  OTPVerification  the mongoose model
 * @param {object} opts
 * @param {*}      opts.phone            raw req.body value — coerced here
 * @param {string[]}[opts.phones]        alternative to `phone`: match any of
 *                                       several stored formats. The technician
 *                                       flow needs this because numbers were
 *                                       historically stored as "+97455512345",
 *                                       "97455512345" and "55512345"
 *                                       interchangeably. Every entry is
 *                                       coerced individually.
 * @param {*}      opts.otp              raw req.body value — coerced here
 * @param {string} opts.purpose          "password_reset" | "registration" | "verification"
 * @param {boolean}[opts.requireVerified] true for the final reset step
 *
 * @returns {Promise<{ok: boolean, status?: number, error?: string, record?: object}>}
 *   Callers should return `res.status(r.status).json({error: r.error})` on !ok.
 *   Every failure returns the SAME generic message so the response cannot be
 *   used to distinguish "no such code" from "wrong code".
 */
async function findAndVerifyOtp(OTPVerification, opts) {
  const otp = toStr(opts.otp, 6);
  const purpose = String(opts.purpose || "password_reset");

  // Accept either a single phone or a list of equivalent stored formats.
  // Each element is coerced independently, so an object smuggled into the
  // array cannot survive as an operator.
  const phones = Array.isArray(opts.phones)
    ? [...new Set(opts.phones.map((p) => toStr(p, 24)).filter(Boolean))]
    : [toStr(opts.phone, 24)].filter(Boolean);

  if (!phones.length || !isSixDigit(otp)) {
    return { ok: false, status: 400, error: "Invalid or expired code" };
  }

  // Filter contains ONLY server-controlled shapes plus coerced strings.
  // NOTE: sorted on `created_at`, which is what OTPVerification actually
  // declares — the schema has no `timestamps`, so sorting on `createdAt`
  // would be a silent no-op returning natural order.
  const query = {
    phone: phones.length === 1 ? phones[0] : { $in: phones },
    purpose,
  };
  if (opts.requireVerified) query.verified = true;

  const record = await OTPVerification.findOne(query).sort({ created_at: -1 });

  if (!record) {
    return { ok: false, status: 400, error: "Invalid or expired code" };
  }

  if (record.expiresAt < new Date()) {
    await OTPVerification.deleteOne({ _id: record._id });
    return { ok: false, status: 400, error: "Invalid or expired code" };
  }

  if ((record.attempts || 0) >= MAX_ATTEMPTS) {
    await OTPVerification.deleteOne({ _id: record._id });
    return {
      ok: false,
      status: 429,
      error: "Too many incorrect attempts. Please request a new code.",
    };
  }

  const stored = Buffer.from(String(record.otp || ""));
  const supplied = Buffer.from(otp);
  const match =
    stored.length === supplied.length && crypto.timingSafeEqual(stored, supplied);

  if (!match) {
    // Atomic increment so parallel guesses cannot each read the same count.
    await OTPVerification.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    return { ok: false, status: 400, error: "Invalid or expired code" };
  }

  return { ok: true, record };
}

/** Cryptographically secure 6-digit code. Replaces Math.random(), which is
 *  xorshift128+ — harvest a few codes and you can predict the next. */
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

module.exports = { findAndVerifyOtp, generateOtp, toStr, isSixDigit, MAX_ATTEMPTS };
