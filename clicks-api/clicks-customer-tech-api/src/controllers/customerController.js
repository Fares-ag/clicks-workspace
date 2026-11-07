const bcrypt = require("bcryptjs");
const {
  Customer,
  OTPVerification,
  CustomerSubscription,
} = require("../../../clicks-shared/models");
const { sendSMS } = require("../services/smsService");
const { str, pick } = require("../../../clicks-shared/utils/coerce");
const {
  findAndVerifyOtp,
  generateOtp,
} = require("../../../clicks-shared/utils/otpVerify");
const {
  normalizePhoneE164,
  findCustomerByPhone,
  phoneLookupValues,
  isOtpAllowedPhone,
} = require("../../../clicks-shared/utils/phone");
const { reserveOtpSend } = require("../../../clicks-shared/utils/otpSendGuard");
const {
  normalizeName,
  validateNames,
} = require("../../../clicks-shared/utils/customerName");
// Read-only guard helpers; the booking rules themselves live in that file.
const {
  findUnpaidJob,
  findLiveJob,
  findActiveSos,
  findActiveServiceRequest,
  upcomingBookingsForCustomer,
} = require("../../../clicks-shared/utils/customerBookingGuard");
const { captureException } = require("../../../clicks-shared/middleware/sentry");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const {
  signCustomerToken,
  verifyForRefresh,
  needsRefresh,
  tokenVersionOf,
  claimVersion,
} = require("../utils/customerToken");

// Phone numbers: every write stores E.164 (normalizePhoneE164). Lookups go
// through findCustomerByPhone, which prefers the exact E.164 row and only
// falls back to legacy stored formats for unambiguous Qatar numbers. Legacy
// duplicates are merged by scripts/dedupe-customer-phones.js.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(raw) {
  return str(raw, { maxLength: 254 }).trim().toLowerCase();
}

/**
 * Email owner regardless of case. Rows written before emails were
 * lower-cased ("Ali@x.com") must still count as taken until
 * scripts/dedupe-customer-emails.js has normalised them (scenario 8).
 */
function findEmailOwner(email, excludeId) {
  const filter = { email: new RegExp(`^${escapeRegex(email)}$`, "i") };
  if (excludeId) filter._id = { $ne: excludeId };
  return Customer.findOne(filter).select("_id").lean();
}

function fail(res, status, code, error, extra = {}) {
  return res.status(status).json({ error, code, ...extra });
}

/** E11000 on a unique field → 409 with a stable code; never leak err.message. */
function duplicateKeyResponse(res, err) {
  const fields = Object.keys(err?.keyPattern || err?.keyValue || {});
  if (fields.includes("email")) {
    return fail(res, 409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
  }
  return fail(
    res,
    409,
    "PHONE_ALREADY_REGISTERED",
    "This phone number is already registered"
  );
}

function isDuplicateKey(err) {
  return err?.code === 11000 || err?.code === 11001;
}

function publicCustomer(customer) {
  return {
    id: customer._id,
    phone_number: customer.phone_number,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
  };
}

async function sendOtpSms(phone, purposeLabel, otp) {
  await sendSMS(
    phone,
    `Your Clicks ${purposeLabel} code is: ${otp}. Valid for 10 minutes.`
  );
}

function smsFailed(res, err, source) {
  console.error(`${source}: SMS send failed:`, err.message);
  captureException(err, { source });
  return fail(
    res,
    502,
    "SMS_SEND_FAILED",
    "We couldn't send the code right now. Please try again or contact support."
  );
}

const register = async (req, res) => {
  try {
    const phone_number = normalizePhoneE164(str(req.body.phone_number, { maxLength: 24 }));
    const first_name = normalizeName(str(req.body.first_name, { maxLength: 80 }));
    const last_name = normalizeName(str(req.body.last_name, { maxLength: 80 }));
    const email = normalizeEmail(req.body.email);
    const password = str(req.body.password, { maxLength: 200 });
    if (!phone_number || !first_name || !last_name || !email || !password) {
      return fail(res, 400, "REGISTRATION_FIELDS_REQUIRED", "All fields are required");
    }
    const nameError = validateNames({ first_name, last_name });
    if (nameError) {
      return fail(res, 400, nameError, "Names must be 1–50 letters (spaces, ' and - allowed)");
    }
    if (!EMAIL_RE.test(email)) {
      return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address");
    }
    if (password.length < 8) {
      return fail(res, 400, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters long");
    }

    // The app verifies the code via /otp/verify and then sends the SAME code
    // here; the record must be verified and the code must still match.
    const otpResult = await findAndVerifyOtp(OTPVerification, {
      phones: phoneLookupValues(phone_number),
      otp: req.body.otp,
      purpose: "registration",
      requireVerified: true,
    });
    if (!otpResult.ok) {
      return fail(res, otpResult.status, "REGISTRATION_OTP_REQUIRED", otpResult.error);
    }

    const existing = await findCustomerByPhone(Customer, phone_number);
    const clearOtps = () =>
      OTPVerification.deleteMany({
        phone: { $in: phoneLookupValues(phone_number) },
        purpose: "registration",
      });

    // Deleted but not yet anonymised: re-registering with an OTP-verified
    // phone restores the account (scenario 3). After anonymisation the phone
    // is a tombstone, no row matches, and a fresh account is created below.
    if (existing?.deleted_at && !existing.anonymized_at) {
      const unpaid = await findUnpaidJob(existing._id);
      if (unpaid) {
        return fail(
          res,
          409,
          "UNPAID_JOB_HOLD",
          "This number has unpaid jobs and cannot re-register"
        );
      }
      const emailOwner = await findEmailOwner(email, existing._id);
      if (emailOwner) {
        return fail(res, 409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
      }
      existing.status = "Active";
      existing.deleted_at = null;
      existing.deleted_reason = "";
      existing.phone_number = phone_number;
      existing.first_name = first_name;
      existing.last_name = last_name;
      existing.email = email;
      existing.password = await bcrypt.hash(password, 10);
      existing.token_version = tokenVersionOf(existing) + 1;
      await existing.save();
      await clearOtps();
      return res.status(201).json({
        message: "Account restored",
        code: "ACCOUNT_RESTORED",
        restored: true,
      });
    }
    if (existing) {
      return fail(res, 409, "PHONE_ALREADY_REGISTERED", "This phone number is already registered");
    }
    const existingEmail = await findEmailOwner(email);
    if (existingEmail) {
      return fail(res, 409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
    }

    const customer = new Customer({
      phone_number,
      first_name,
      last_name,
      email,
      password: await bcrypt.hash(password, 10),
    });
    await customer.save();
    await clearOtps();
    res.status(201).json({ message: "Registration successful", restored: false });
  } catch (err) {
    // Double-tap on "Create account": both requests pass the existence
    // check and the unique index rejects the second (scenario 2).
    if (isDuplicateKey(err)) return duplicateKeyResponse(res, err);
    console.error("register failed:", err.message);
    fail(res, 500, "REGISTRATION_FAILED", "Registration failed");
  }
};

const login = async (req, res) => {
  try {
    // Coerced: an object here (e.g. {"$ne":null}) would otherwise reach the
    // filter and match an arbitrary customer record.
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    const password = str(req.body.password, { maxLength: 200 });
    if (!phone_number || !password) {
      return fail(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }
    const customer = await findCustomerByPhone(
      Customer,
      phone_number,
      {},
      "+password +deleted_at +status +token_version"
    );
    if (!customer) {
      return fail(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }
    const valid = await bcrypt.compare(password, customer.password);
    if (!valid) {
      return fail(res, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }
    if (customer.deleted_at) {
      return fail(
        res,
        403,
        "ACCOUNT_DELETED",
        "This account was deleted. Register again with this number to restore it."
      );
    }
    if (customer.status !== "Active") {
      return fail(res, 403, "ACCOUNT_INACTIVE", "Account is not active");
    }
    if (!process.env.JWT_SECRET) {
      return fail(res, 503, "AUTH_NOT_CONFIGURED", "Auth not configured");
    }
    res.json({ token: signCustomerToken(customer), customer: publicCustomer(customer) });
  } catch (err) {
    console.error("login failed:", err.message);
    fail(res, 500, "LOGIN_FAILED", "Login failed");
  }
};

/**
 * POST /api/customers/token/refresh  (sliding session, scenario 12)
 *
 * Accepts the current token (Authorization header) even shortly after expiry
 * (CUSTOMER_TOKEN_REFRESH_GRACE_DAYS) and returns a fresh one once fewer than
 * CUSTOMER_TOKEN_REFRESH_WINDOW_DAYS remain. Revocation (`tv`) and account
 * status still apply.
 */
const refreshToken = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return fail(res, 503, "AUTH_NOT_CONFIGURED", "Auth not configured");
    }
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : str(req.body?.token, { maxLength: 4096 });
    if (!token) return fail(res, 401, "TOKEN_MISSING", "No token provided");

    const decoded = verifyForRefresh(token);
    if (!decoded) return fail(res, 401, "TOKEN_INVALID", "Session expired. Please sign in again.");

    const customer = await Customer.findById(decoded.id).select("status deleted_at token_version");
    if (!customer || customer.deleted_at || customer.status !== "Active") {
      return fail(res, 403, "ACCOUNT_INACTIVE", "Account is not active");
    }
    if (claimVersion(decoded) !== tokenVersionOf(customer)) {
      return fail(res, 401, "TOKEN_REVOKED", "Session revoked. Please sign in again.");
    }

    const expired = decoded.exp && decoded.exp * 1000 <= Date.now();
    if (!expired && !needsRefresh(decoded)) {
      return res.json({ token, refreshed: false, expires_at: new Date(decoded.exp * 1000) });
    }
    const fresh = signCustomerToken(customer);
    const { exp } = require("jsonwebtoken").decode(fresh);
    res.json({ token: fresh, refreshed: true, expires_at: new Date(exp * 1000) });
  } catch (err) {
    if (err?.name === "CastError") return fail(res, 401, "TOKEN_INVALID", "Invalid token");
    console.error("refreshToken failed:", err.message);
    fail(res, 503, "TOKEN_REFRESH_FAILED", "Could not refresh the session");
  }
};

const getProfile = async (req, res) => {
  try {
    const { id } = req.user; // Assume user is set by auth middleware
    const customer = await Customer.findById(id);
    if (!customer) {
      return fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    res.json({
      id: customer._id,
      phone_number: customer.phone_number,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      status: customer.status
    });
  } catch (err) {
    console.error("getProfile failed:", err.message);
    fail(res, 500, "PROFILE_FETCH_FAILED", "Profile fetch failed");
  }
};


const updatePassword = async (req, res) => {
  try {
    const { id } = req.user;
    const oldPassword = str(req.body.oldPassword, { maxLength: 200 });
    const newPassword = str(req.body.newPassword, { maxLength: 200 });
    if (!oldPassword || !newPassword) {
      return fail(res, 400, "PASSWORD_FIELDS_REQUIRED", "Old and new password are required");
    }
    if (newPassword.length < 8) {
      return fail(res, 400, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters long");
    }
    // `password` is select:false on the schema, so without this the compare
    // below ran against undefined and every request 500'd.
    const customer = await Customer.findById(id).select("+password");
    if (!customer) {
      return fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const valid = await bcrypt.compare(oldPassword, customer.password);
    if (!valid) {
      return fail(res, 401, "OLD_PASSWORD_INCORRECT", "Old password incorrect");
    }
    customer.password = await bcrypt.hash(newPassword, 10);
    // Revoke every other session; this device gets a fresh token back.
    customer.token_version = tokenVersionOf(customer) + 1;
    await customer.save();
    res.json({ message: "Password updated", token: signCustomerToken(customer) });
  } catch (err) {
    console.error("updatePassword failed:", err.message);
    fail(res, 500, "PASSWORD_UPDATE_FAILED", "Password update failed");
  }
};

/** Live work that makes deletion unsafe (scenario 4). Read-only. */
async function deletionBlockers(customerId) {
  const [sos, liveJob, activeBooking, upcoming, unpaid] = await Promise.all([
    findActiveSos(customerId),
    findLiveJob(customerId),
    findActiveServiceRequest(customerId),
    // A booking days away is not "active" for the session, but deleting the
    // account would still orphan it, so it blocks deletion too.
    upcomingBookingsForCustomer(customerId),
    findUnpaidJob(customerId),
  ]);
  const booking = activeBooking || upcoming[0] || null;
  const blockers = [];
  if (sos) {
    blockers.push({
      code: "DELETE_BLOCKED_LIVE_SOS",
      error: "You have an SOS in progress. Cancel it or wait until it is handled.",
      sos_id: String(sos._id),
    });
  }
  if (liveJob) {
    blockers.push({
      code: "DELETE_BLOCKED_LIVE_JOB",
      error: "You have a job in progress. Wait until it is finished.",
      job_id: String(liveJob._id),
    });
  }
  if (booking) {
    blockers.push({
      code: "DELETE_BLOCKED_ACTIVE_BOOKING",
      error: "You have an upcoming or active booking. Cancel it first.",
      service_request_id: String(booking._id),
    });
  }
  if (unpaid) {
    blockers.push({
      code: "UNPAID_JOB_HOLD",
      error: "Settle unpaid jobs before deleting this account",
      job_id: String(unpaid._id),
    });
  }
  return blockers;
}

function activeMemberships(customerId) {
  return CustomerSubscription.find({
    customer_id: customerId,
    status: { $in: ["active", "pending_payment"] },
  })
    .select("_id status planName endDate customer_vehicle_id")
    .lean();
}

/** GET /api/customers/delete-check — what the delete dialog must show. */
const deleteCheck = async (req, res) => {
  try {
    const [blockers, memberships] = await Promise.all([
      deletionBlockers(req.user.id),
      activeMemberships(req.user.id),
    ]);
    res.json({
      can_delete: blockers.length === 0,
      blockers,
      active_membership: memberships.some((m) => m.status === "active"),
      memberships: memberships.map((m) => ({
        id: String(m._id),
        status: m.status,
        plan_name: m.planName || "",
        end_date: m.endDate || null,
      })),
      // Policy (open item 2, 7 Nov 2026): a membership is cancelled with the
      // account and is not refunded automatically.
      membership_policy: "forfeit_no_refund",
    });
  } catch (err) {
    console.error("deleteCheck failed:", err.message);
    fail(res, 500, "DELETE_CHECK_FAILED", "Could not check the account");
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { id } = req.user;
    const blockers = await deletionBlockers(id);
    if (blockers.length) {
      const [first] = blockers;
      return res.status(409).json({ ...first, blockers });
    }
    const customer = await Customer.findById(id);
    if (!customer) {
      return fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const reason = str(req.body?.reason, { maxLength: 200 }).trim() || "customer_request";
    const otherReason = str(req.body?.other_reason, { maxLength: 500 }).trim();
    const now = new Date();

    customer.status = "Inactive";
    customer.deleted_at = now;
    customer.deleted_reason = reason;
    customer.deletion_request = { reason, other_reason: otherReason, requested_at: now };
    customer.fcm_token = undefined;
    customer.token_version = tokenVersionOf(customer) + 1;
    await customer.save();

    // Open item 2: deleting the account deactivates the membership. No
    // automatic refund — finance can refund through the admin refund flow.
    const cancelled = await CustomerSubscription.updateMany(
      { customer_id: id, status: { $in: ["active", "pending_payment"] } },
      {
        $set: {
          status: "cancelled",
          cancel_reason: "account_deleted",
          cancelled_at: now,
          cancel_at_period_end: false,
          cancelled_by: { type: "customer", id },
        },
        $push: {
          history: { action: "cancel", at: now, note: "account_deleted", by_type: "customer", by_id: id },
        },
      }
    );

    res.json({
      message: "Account deleted",
      memberships_cancelled: cancelled.modifiedCount || 0,
    });
  } catch (err) {
    console.error("deleteAccount failed:", err.message);
    fail(res, 500, "ACCOUNT_DELETE_FAILED", "Account deletion failed");
  }
};

const updateProfile = async (req, res) => {
  try {
    const { id } = req.user;
    // Was `const update = req.body` — an unfiltered write that let a customer
    // set their own `status`, collide the unique `client_id`, and write an
    // UNHASHED `password` (permanent lockout, since login uses bcrypt.compare).
    const update = pick(req.body, [
      "first_name",
      "last_name",
      "email",
      "profile_picture",
    ]);
    for (const field of ["first_name", "last_name"]) {
      if (update[field] !== undefined) update[field] = normalizeName(str(update[field], { maxLength: 80 }));
    }
    const nameError = validateNames(update, { partial: true });
    if (nameError) {
      return fail(res, 400, nameError, "Names must be 1–50 letters (spaces, ' and - allowed)");
    }
    if (update.email !== undefined) {
      update.email = normalizeEmail(update.email);
      if (!EMAIL_RE.test(update.email)) {
        return fail(res, 400, "INVALID_EMAIL", "Enter a valid email address");
      }
      if (await findEmailOwner(update.email, id)) {
        return fail(res, 409, "EMAIL_ALREADY_REGISTERED", "This email is already registered");
      }
    }
    if (update.profile_picture !== undefined) {
      update.profile_picture = str(update.profile_picture, { maxLength: 2048 });
    }
    const customer = await Customer.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    res.json({ message: "Profile updated", customer });
  } catch (err) {
    if (isDuplicateKey(err)) return duplicateKeyResponse(res, err);
    if (err?.name === "ValidationError") {
      return fail(res, 400, "PROFILE_INVALID", "Some profile fields are not valid");
    }
    console.error("updateProfile failed:", err.message);
    fail(res, 500, "PROFILE_UPDATE_FAILED", "Update profile failed");
  }
};

function maskPhone(phone) {
  return String(phone || "").replace(/.(?=.{4})/g, "*");
}

/** Active, non-deleted customer for a reset flow, or null. */
function findResetCustomer(rawPhone, select) {
  return findCustomerByPhone(
    Customer,
    rawPhone,
    { deleted_at: null, status: "Active" },
    select
  );
}

// Forgot Password - Send OTP to the STORED number of the matched account
const forgotPassword = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });

    if (!phone_number) {
      return fail(res, 400, "PHONE_REQUIRED", "Phone number is required");
    }

    // Country allowlist + per-phone cap BEFORE the account lookup, so the
    // response cannot be used to tell registered numbers apart.
    const reservation = await reserveOtpSend(phone_number, {
      purpose: "password_reset",
      ip: req.ip,
    });
    if (!reservation.ok) {
      return fail(res, reservation.status, reservation.code, reservation.error);
    }

    const customer = await findResetCustomer(phone_number);

    // Only send when the account exists — but respond identically either way.
    // The old code returned 404 for unknown numbers, which made the entire
    // customer roster walkable (Qatari mobiles are 8 digits behind +974).
    if (customer) {
      // Scenario 6: the code goes to the number ON THE ACCOUNT, never to the
      // raw input, and the OTP record is keyed by that same number.
      const target = normalizePhoneE164(customer.phone_number);
      if (isOtpAllowedPhone(target)) {
        const otp = generateOtp();
        await OTPVerification.deleteMany({
          phone: { $in: phoneLookupValues(target) },
          purpose: "password_reset",
        });
        await OTPVerification.create({
          phone: target,
          otp,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
          purpose: "password_reset",
        });
        try {
          await sendOtpSms(target, "password reset", otp);
        } catch (smsErr) {
          return smsFailed(res, smsErr, "forgotPassword");
        }
      }
    }

    res.json({
      message: "If an account exists for that number, a code has been sent.",
      phone_number: maskPhone(phone_number),
    });
  } catch (err) {
    console.error("forgotPassword failed:", err.message);
    fail(res, 500, "OTP_SEND_FAILED", "Failed to send OTP");
  }
};

// Verify OTP for password reset (against the account's stored number)
const verifyResetOTP = async (req, res) => {
  try {
    const customer = await findResetCustomer(str(req.body.phone_number, { maxLength: 24 }));
    if (!customer) {
      return fail(res, 400, "OTP_INVALID", "Invalid or expired code");
    }
    const result = await findAndVerifyOtp(OTPVerification, {
      phone: normalizePhoneE164(customer.phone_number),
      otp: req.body.otp,
      purpose: "password_reset",
    });

    if (!result.ok) {
      return fail(res, result.status, result.status === 429 ? "OTP_TOO_MANY_ATTEMPTS" : "OTP_INVALID", result.error);
    }

    result.record.verified = true;
    await result.record.save();

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyResetOTP failed:", err.message);
    fail(res, 500, "OTP_VERIFY_FAILED", "OTP verification failed");
  }
};

// Reset Password after OTP verification
const resetPassword = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    const new_password = str(req.body.new_password, { maxLength: 200 });
    const confirm_password = str(req.body.confirm_password, { maxLength: 200 });

    if (!phone_number || !new_password || !confirm_password) {
      return fail(res, 400, "PASSWORD_FIELDS_REQUIRED", "All fields are required");
    }
    if (new_password !== confirm_password) {
      return fail(res, 400, "PASSWORDS_DO_NOT_MATCH", "Passwords do not match");
    }
    if (new_password.length < 8) {
      return fail(res, 400, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters long");
    }

    const customer = await findResetCustomer(phone_number, "+password +token_version");
    if (!customer) {
      return fail(res, 400, "OTP_INVALID", "Invalid or expired code");
    }
    const target = normalizePhoneE164(customer.phone_number);

    const result = await findAndVerifyOtp(OTPVerification, {
      phone: target,
      otp: req.body.otp,
      purpose: "password_reset",
      requireVerified: true,
    });

    if (!result.ok) {
      return fail(res, result.status, "OTP_INVALID", result.error);
    }

    customer.password = await bcrypt.hash(new_password, 10);
    // Scenario 13: a reset after a stolen phone must lock the thief out.
    customer.token_version = tokenVersionOf(customer) + 1;
    await customer.save();

    await OTPVerification.deleteMany({
      phone: { $in: phoneLookupValues(target) },
      purpose: "password_reset",
    });

    res.json({
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (err) {
    console.error("resetPassword failed:", err.message);
    fail(res, 500, "PASSWORD_RESET_FAILED", "Password reset failed");
  }
};

// Register OTP (purpose: registration)
const sendRegisterOTP = async (req, res) => {
  try {
    const phone_number = normalizePhoneE164(str(req.body.phone_number, { maxLength: 24 }));
    if (!phone_number) {
      return fail(res, 400, "PHONE_REQUIRED", "phone_number is required");
    }
    const reservation = await reserveOtpSend(phone_number, {
      purpose: "registration",
      ip: req.ip,
    });
    if (!reservation.ok) {
      return fail(res, reservation.status, reservation.code, reservation.error);
    }
    const existing = await findCustomerByPhone(Customer, phone_number);
    // Same answer for a live account (no SMS) so the roster stays private.
    // A DELETED account does get a code: that is the restore path.
    if (existing && !existing.deleted_at) {
      return res.json({ message: "OTP sent" });
    }
    const otp = generateOtp();
    await OTPVerification.deleteMany({
      phone: { $in: phoneLookupValues(phone_number) },
      purpose: "registration",
    });
    await OTPVerification.create({
      phone: phone_number,
      otp,
      purpose: "registration",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    try {
      await sendOtpSms(phone_number, "registration", otp);
    } catch (smsErr) {
      return smsFailed(res, smsErr, "sendRegisterOTP");
    }
    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("sendRegisterOTP failed:", err.message);
    fail(res, 500, "OTP_SEND_FAILED", "Send OTP failed");
  }
};

const verifyRegisterOTP = async (req, res) => {
  try {
    const result = await findAndVerifyOtp(OTPVerification, {
      phones: phoneLookupValues(normalizePhoneE164(str(req.body.phone_number, { maxLength: 24 }))),
      otp: req.body.otp,
      purpose: "registration",
    });

    if (!result.ok) {
      return fail(res, result.status, result.status === 429 ? "OTP_TOO_MANY_ATTEMPTS" : "OTP_INVALID", result.error);
    }

    result.record.verified = true;
    await result.record.save();

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyRegisterOTP failed:", err.message);
    fail(res, 500, "OTP_VERIFY_FAILED", "OTP verification failed");
  }
};

const saveFcmToken = async (req, res) => {
  try {
    const fcm_token = str(req.body.fcm_token, { maxLength: 4096 });
    if (!fcm_token) {
      return fail(res, 400, "FCM_TOKEN_REQUIRED", "fcm_token is required");
    }
    // A device token belongs to exactly one account. Detach it from anyone
    // else still holding it (previous owner of this handset), otherwise their
    // pushes keep being delivered to whoever signs in here next.
    await Customer.updateMany(
      { _id: { $ne: req.user.id }, fcm_token },
      { $unset: { fcm_token: 1 } }
    );
    await Customer.findByIdAndUpdate(req.user.id, { fcm_token });
    res.json({ message: "FCM token saved" });
  } catch (err) {
    console.error("saveFcmToken failed:", err.message);
    fail(res, 500, "FCM_TOKEN_SAVE_FAILED", "Save FCM token failed");
  }
};

const logout = async (_req, res) => {
  // Stateless JWT — the client discards its token. Use /logout-all to revoke.
  res.json({ message: "Logged out" });
};

/** POST /api/customers/logout-all — revoke every session; this device stays in. */
const logoutAll = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.user.id,
      { $inc: { token_version: 1 } },
      { new: true }
    ).select("token_version");
    if (!customer) return fail(res, 404, "CUSTOMER_NOT_FOUND", "Customer not found");
    res.json({ message: "Signed out on all other devices", token: signCustomerToken(customer) });
  } catch (err) {
    console.error("logoutAll failed:", err.message);
    fail(res, 500, "LOGOUT_ALL_FAILED", "Could not sign out other devices");
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  getProfile,
  updatePassword,
  deleteCheck,
  deleteAccount,
  updateProfile,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendRegisterOTP,
  verifyRegisterOTP,
  saveFcmToken,
  logout,
  logoutAll,
};
