const Admin = require("../models/Admin");
const PasswordReset = require("../models/PasswordReset");
const { hashPassword, comparePassword, generateAccessToken, generateRefreshToken } = require("../utils/authUtils");
const { sendPasswordResetEmail, sendPasswordResetConfirmationEmail } = require("../utils/emailService");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { str, normaliseEmail } = require("../../../clicks-shared/utils/coerce");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");

const RESET_MAX_ATTEMPTS = Number(process.env.RESET_MAX_ATTEMPTS || 5);

/**
 * Look an admin up by email, case-insensitively.
 *
 * createAdmin stores the address lower-cased while the login form posts it
 * exactly as typed, so an exact match locked out every admin whose address was
 * issued with a capital letter. Matching on an anchored /^…$/i keeps rows that
 * predate the lower-casing reachable too, so no data migration is required.
 * Callers must use the returned `admin.email` as the canonical address for
 * anything they write (password reset rows, emails).
 */
async function findAdminByEmail(email, { withPassword = false } = {}) {
  if (!email) return null;
  const exact = new RegExp(`^${escapeRegex(email)}$`, "i");
  const query = Admin.findOne({ email: exact });
  if (withPassword) query.select("+password");
  return query;
}

// Login
async function login(req, res) {
  // Express 4 does not forward async rejections to the error middleware, and
  // Node's default unhandledRejection mode is `throw` — an unwrapped await here
  // kills the container on any transient Mongo blip. Same shape as refreshToken.
  try {
    // Coerced: {"email":{"$ne":null}} would otherwise match an arbitrary admin.
    // Matched case-insensitively: createAdmin lower-cases on insert while the
    // login form posts the address exactly as typed, so an exact match locked
    // out every admin whose address was issued with a capital letter. Rows that
    // predate the lower-casing stay reachable, so no migration is needed.
    const email = str(req.body.email, { maxLength: 254 });
    const password = str(req.body.password, { maxLength: 200 });
    const admin = await findAdminByEmail(email, { withPassword: true });
    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    // Check if admin account is active
    if (!admin.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Please contact an administrator." });
    }

    const valid = comparePassword(password, admin.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const payload = { id: admin._id, role: admin.role, email: admin.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        email: admin.email,
        phone: admin.phone,
        profilePicture: admin.profilePicture
      }
    });
  } catch (err) {
    console.error("login failed:", err.message);
    return res.status(503).json({ message: "Auth temporarily unavailable" });
  }
}

// Logout (invalidate refresh token on client side)
function logout(req, res) {
  res.json({ message: "Logged out" });
}

// Forgot Password - Send OTP/Token via email
async function forgotPassword(req, res) {
  try {
    const email = str(req.body.email, { maxLength: 254 });

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const admin = await findAdminByEmail(email);

    // Only send when the account exists — but respond identically either way.
    // The old code returned 404 for unknown emails, which let an attacker
    // confirm which admin addresses are real before attacking them.
    if (admin) {
      // Key the reset record off the stored address, not the typed one, so the
      // lookup in resetPassword finds it whatever case the admin types.
      const canonicalEmail = admin.email;
      // 100000..999999 inclusive-exclusive upper bound; the original excluded
      // 999999. Kept as-is to avoid changing code length expectations.
      const resetToken = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await PasswordReset.deleteMany({ email: canonicalEmail });
      await PasswordReset.create({
        email: canonicalEmail,
        token: resetToken,
        expiresAt,
        used: false,
      });

      await sendPasswordResetEmail(
        canonicalEmail,
        `${admin.firstName} ${admin.lastName}`,
        resetToken
      );
    }

    res.json({
      message: "If an account exists for that address, a reset code has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ 
      message: "Failed to send password reset email", 
      error: error.message 
    });
  }
}

// Reset Password - Verify OTP and update password
async function resetPassword(req, res) {
  try {
    const email = str(req.body.email, { maxLength: 254 });
    const token = str(req.body.token, { maxLength: 6 });
    const newPassword = str(req.body.newPassword, { maxLength: 200 });

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        message: "Email, token, and new password are required"
      });
    }
    if (!/^\d{6}$/.test(token)) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Resolve the account first (case-insensitively) because forgotPassword
    // stores the reset record under the address exactly as it is stored on the
    // admin, which is not necessarily the case the admin types here.
    const admin = await findAdminByEmail(email);
    const lookupEmail = admin ? admin.email : email;

    // Look the record up by email + used only. The supplied token NEVER enters
    // the filter — that is what allowed `{"token":{"$gt":""}}` to reset any
    // admin's password without ever reading the emailed code.
    const resetRecord = await PasswordReset.findOne({
      email: lookupEmail,
      used: false
    }).sort({ createdAt: -1 });

    if (!resetRecord) {
      return res.status(400).json({
        message: "Invalid or expired reset token"
      });
    }

    if ((resetRecord.attempts || 0) >= RESET_MAX_ATTEMPTS) {
      await PasswordReset.deleteOne({ _id: resetRecord._id });
      return res.status(429).json({
        message: "Too many incorrect attempts. Please request a new code."
      });
    }

    // Constant-time comparison so latency does not leak matching digits.
    const storedBuf = Buffer.from(String(resetRecord.token || ""));
    const suppliedBuf = Buffer.from(token);
    const tokenMatches =
      storedBuf.length === suppliedBuf.length &&
      crypto.timingSafeEqual(storedBuf, suppliedBuf);

    if (!tokenMatches) {
      await PasswordReset.updateOne(
        { _id: resetRecord._id },
        { $inc: { attempts: 1 } }
      );
      return res.status(400).json({
        message: "Invalid or expired reset token"
      });
    }
    
    // Check if token has expired
    if (new Date() > resetRecord.expiresAt) {
      await PasswordReset.deleteOne({ _id: resetRecord._id });
      return res.status(400).json({ 
        message: "Reset token has expired. Please request a new one." 
      });
    }
    
    // Admin resolved above, alongside the reset record
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    
    // Hash the new password and update
    const hashedPassword = hashPassword(newPassword);
    admin.password = hashedPassword;
    await admin.save();
    
    // Mark token as used
    resetRecord.used = true;
    await resetRecord.save();
    
    // Send confirmation email
    try {
      await sendPasswordResetConfirmationEmail(lookupEmail, `${admin.firstName} ${admin.lastName}`);
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the request if confirmation email fails
    }
    
    res.json({ 
      message: "Password reset successful. You can now login with your new password." 
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ 
      message: "Failed to reset password", 
      error: error.message 
    });
  }
}

// Refresh Token
async function refreshToken(req, res) {
  const rt = req.body && req.body.refreshToken;
  if (!rt || typeof rt !== "string") {
    return res.status(401).json({ message: "No refresh token" });
  }

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ message: "Auth is not configured" });
  }

  let decoded;
  try {
    decoded = jwt.verify(rt, secret, { algorithms: ["HS256"] });
  } catch (err) {
    // 401, not 403 — the admin console's interceptor treats 403 as
    // "permission denied" and 401 as "re-authenticate".
    return res.status(401).json({ message: "Invalid refresh token" });
  }

  try {
    // Role and status come from the DATABASE, never from the token being
    // refreshed. Previously this copied `user.role` straight off the old
    // token, so a demoted or deactivated admin kept minting valid access
    // tokens carrying their former role for the full 7-day refresh window.
    const admin = await Admin.findById(decoded.id).select("_id role isActive email");
    if (!admin) {
      return res.status(401).json({ message: "Account no longer exists" });
    }
    if (admin.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    const accessToken = generateAccessToken({
      id: String(admin._id),
      role: admin.role,
      email: admin.email,
    });
    return res.json({ accessToken });
  } catch (err) {
    console.error("refreshToken failed:", err.message);
    return res.status(503).json({ message: "Auth temporarily unavailable" });
  }
}


// GET /api/auth/me — current admin profile (mobile session validation)
async function me(req, res) {
  try {
    const admin = await Admin.findById(req.user.id).select(
      "-password"
    );
    if (!admin) {
      return res.status(401).json({ message: "Account no longer exists" });
    }
    if (admin.isActive === false) {
      return res.status(403).json({ message: "Account is deactivated" });
    }
    res.json({
      user: {
        id: admin._id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        email: admin.email,
        phone: admin.phone,
        profilePicture: admin.profilePicture,
      },
    });
  } catch (err) {
    console.error("me failed:", err.message);
    return res.status(503).json({ message: "Auth temporarily unavailable" });
  }
}

async function saveFcmToken(req, res) {
  try {
    const { fcm_token } = req.body || {};
    if (!fcm_token || typeof fcm_token !== "string") {
      return res.status(400).json({ message: "fcm_token is required" });
    }
    await Admin.findByIdAndUpdate(req.user.id, {
      fcm_token: fcm_token.trim(),
    });
    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save FCM token", error: err.message });
  }
}

async function clearFcmToken(req, res) {
  try {
    await Admin.findByIdAndUpdate(req.user.id, { fcm_token: null });
    res.json({ message: "FCM token cleared" });
  } catch (err) {
    res.status(500).json({ message: "Failed to clear FCM token", error: err.message });
  }
}

module.exports = {
  login,
  logout,
  forgotPassword,
  resetPassword,
  refreshToken,
  me,
  saveFcmToken,
  clearFcmToken,
};
