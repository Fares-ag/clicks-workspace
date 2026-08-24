/**
 * Input coercion + field allow-listing.  NEW FILE.
 *
 * Fixes P0-1 (NoSQL injection) at the handler, and P1 mass assignment.
 *
 * Rule of thumb for this codebase: a value that ends up inside a Mongoose
 * query filter must pass through `str()` / `num()` / `objectId()` first.
 * A value that ends up in an update document must pass through `pick()`.
 *
 * Usage:
 *   const { str, num, objectId, pick, isSixDigit } = require("clicks-shared/utils/coerce");
 *
 *   const otp = str(req.body.otp);
 *   if (!isSixDigit(otp)) return res.status(400).json({ error: "Invalid OTP" });
 *
 *   const update = pick(req.body, ["firstName", "lastName", "email"]);
 */

/**
 * NO IMPORTS ON PURPOSE.
 *
 * ObjectId validation uses a 24-character hex check — no mongoose import needed.
 * Host APIs and clicks-shared both declare mongoose ^8.3.5 (deduped per package tree).
 */

/**
 * Force a value to a primitive string.  Objects/arrays become "" rather than
 * surviving as a query operator.  This is the single most important function
 * in this file — it is what closes the `{"$gt": ""}` hole.
 */
function str(v, { maxLength = 512 } = {}) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.slice(0, maxLength);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return ""; // object, array, function -> refuse
}

/** Force a finite number, or null. Rejects NaN, Infinity, and numeric strings with junk. */
function num(v, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (typeof v === "boolean" || v === null || v === undefined || v === "") return null;
  if (typeof v === "object") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (integer && !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * Return a valid ObjectId string, or null. Use before any findById.
 *
 * Stricter than `mongoose.Types.ObjectId.isValid`, deliberately: that function
 * returns true for any 12-character string (it reinterprets the bytes), so
 * `isValid("customer_id!")` is true and casts to a garbage id. Requiring
 * 24 hex characters is what callers actually mean.
 */
function objectId(v) {
  const s = str(v, { maxLength: 24 });
  return OBJECT_ID_RE.test(s) ? s : null;
}

function isSixDigit(s) {
  return /^\d{6}$/.test(s);
}

/** Qatar E.164 normalisation. Accepts 55512345, 97455512345, +974 5551 2345. */
function normalisePhone(v) {
  const digits = str(v).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("974")) return `+${digits}`;
  if (digits.length === 8) return `+974${digits}`;
  return `+${digits}`;
}

function normaliseEmail(v) {
  return str(v, { maxLength: 254 }).trim().toLowerCase();
}

/**
 * Field allow-list. The ONLY safe way to build an update from req.body.
 *
 * Replaces every `const update = { ...req.body }` in the codebase.
 * Silently drops anything not named — including `role`, `isActive`,
 * `payment_status`, `price`, `client_id`, and `password`.
 */
function pick(source, allowedFields) {
  const out = {};
  if (!source || typeof source !== "object") return out;
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      out[field] = source[field];
    }
  }
  return out;
}

/**
 * Same as pick(), but reports what it dropped. Use during the migration so you
 * can see whether a client is relying on a field you just started ignoring.
 */
function pickVerbose(source, allowedFields, context = "") {
  const out = pick(source, allowedFields);
  const dropped = Object.keys(source || {}).filter((k) => !allowedFields.includes(k));
  if (dropped.length) {
    console.warn(
      JSON.stringify({ level: "warn", event: "fields_dropped", context, dropped })
    );
  }
  return out;
}

module.exports = {
  str,
  num,
  objectId,
  isSixDigit,
  normalisePhone,
  normaliseEmail,
  pick,
  pickVerbose,
};
