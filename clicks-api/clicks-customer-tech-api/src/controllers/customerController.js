const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Customer, OTPVerification } = require("../../../clicks-shared/models");
const { sendSMS } = require("../services/smsService");
const { str, pick } = require("../../../clicks-shared/utils/coerce");
const {
  findAndVerifyOtp,
  generateOtp,
} = require("../../../clicks-shared/utils/otpVerify");

// NOTE ON PHONE NUMBERS (audit stage 1):
// We coerce to a string but deliberately do NOT normalise the format here.
// Existing records were stored exactly as the client sent them, so
// normalising on lookup would silently break sign-in for anyone who
// registered as "55512345" rather than "+97455512345". Format normalisation
// + a dedupe migration is a separate, later change.

const register = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    const first_name = str(req.body.first_name, { maxLength: 80 });
    const last_name = str(req.body.last_name, { maxLength: 80 });
    const email = str(req.body.email, { maxLength: 254 });
    const password = str(req.body.password, { maxLength: 200 });
    if (!phone_number || !first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const existing = await Customer.findOne({ $or: [{ phone_number }, { email }] });
    if (existing) {
      return res.status(409).json({ error: "Phone number or email already registered" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const customer = new Customer({
      phone_number,
      first_name,
      last_name,
      email,
      password: hashedPassword
    });
    await customer.save();
    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
};

const login = async (req, res) => {
  try {
    // Coerced: an object here (e.g. {"$ne":null}) would otherwise reach the
    // filter and match an arbitrary customer record.
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    const password = str(req.body.password, { maxLength: 200 });
    const customer = await Customer.findOne({ phone_number }).select("+password");
    if (!customer) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, customer.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: "Auth not configured" });
    }
    const token = jwt.sign(
      { id: customer._id, role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, customer: { id: customer._id, phone_number: customer.phone_number, first_name: customer.first_name, last_name: customer.last_name, email: customer.email } });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const { id } = req.user; // Assume user is set by auth middleware
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
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
    res.status(500).json({ error: "Profile fetch failed", details: err.message });
  }
};


const updatePassword = async (req, res) => {
  try {
    const { id } = req.user;
    const oldPassword = str(req.body.oldPassword, { maxLength: 200 });
    const newPassword = str(req.body.newPassword, { maxLength: 200 });
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new password are required" });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }
    // `password` is select:false on the schema, so without this the compare
    // below ran against undefined and every request 500'd.
    const customer = await Customer.findById(id).select("+password");
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    const valid = await bcrypt.compare(oldPassword, customer.password);
    if (!valid) {
      return res.status(401).json({ error: "Old password incorrect" });
    }
    customer.password = await bcrypt.hash(newPassword, 10);
    await customer.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ error: "Password update failed", details: err.message });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { id } = req.user;
    await Customer.findByIdAndDelete(id);
    res.json({ message: "Account deleted" });
  } catch (err) {
    res.status(500).json({ error: "Account deletion failed", details: err.message });
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
    const customer = await Customer.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json({ message: "Profile updated", customer });
  } catch (err) {
    res.status(500).json({ error: "Update profile failed", details: err.message });
  }
};

// Forgot Password - Send OTP to phone number
const forgotPassword = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const customer = await Customer.findOne({ phone_number }).select("+password");

    // Only send when the account exists — but respond identically either way.
    // The old code returned 404 for unknown numbers, which made the entire
    // customer roster walkable (Qatari mobiles are 8 digits behind +974).
    if (customer) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await OTPVerification.deleteMany({
        phone: phone_number,
        purpose: "password_reset",
      });
      await OTPVerification.create({
        phone: phone_number,
        otp,
        expiresAt,
        purpose: "password_reset",
      });

      await sendSMS(
        phone_number,
        `Your Clicks password reset OTP is: ${otp}. Valid for 10 minutes.`
      );
    }

    res.json({
      message: "If an account exists for that number, a code has been sent.",
      phone_number: phone_number.replace(/.(?=.{4})/g, "*"),
    });
  } catch (err) {
    console.error("forgotPassword failed:", err.message);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// Verify OTP for password reset
const verifyResetOTP = async (req, res) => {
  try {
    const result = await findAndVerifyOtp(OTPVerification, {
      phone: req.body.phone_number,
      otp: req.body.otp,
      purpose: "password_reset",
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    result.record.verified = true;
    await result.record.save();

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyResetOTP failed:", err.message);
    res.status(500).json({ error: "OTP verification failed" });
  }
};

// Reset Password after OTP verification
const resetPassword = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    const new_password = str(req.body.new_password, { maxLength: 200 });
    const confirm_password = str(req.body.confirm_password, { maxLength: 200 });

    if (!phone_number || !new_password || !confirm_password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (new_password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters long" });
    }

    const result = await findAndVerifyOtp(OTPVerification, {
      phone: phone_number,
      otp: req.body.otp,
      purpose: "password_reset",
      requireVerified: true,
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const customer = await Customer.findOne({ phone_number }).select("+password");
    if (!customer) {
      // Should be unreachable — a verified OTP implies the account existed.
      return res.status(400).json({ error: "Invalid or expired code" });
    }

    customer.password = await bcrypt.hash(new_password, 10);
    await customer.save();

    await OTPVerification.deleteMany({
      phone: phone_number,
      purpose: "password_reset",
    });

    res.json({
      message: "Password reset successfully. You can now login with your new password.",
    });
  } catch (err) {
    console.error("resetPassword failed:", err.message);
    res.status(500).json({ error: "Password reset failed" });
  }
};

// Register OTP (purpose: registration)
const sendRegisterOTP = async (req, res) => {
  try {
    const phone_number = str(req.body.phone_number, { maxLength: 24 });
    if (!phone_number) {
      return res.status(400).json({ error: "phone_number is required" });
    }
    const otp = generateOtp();
    await OTPVerification.deleteMany({ phone: phone_number, purpose: "registration" });
    await OTPVerification.create({
      phone: phone_number,
      otp,
      purpose: "registration",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    await sendSMS(
      phone_number,
      `Your Clicks registration OTP is: ${otp}. Valid for 10 minutes.`
    );
    res.json({ message: "OTP sent" });
  } catch (err) {
    res.status(500).json({ error: "Send OTP failed", details: err.message });
  }
};

const verifyRegisterOTP = async (req, res) => {
  try {
    const result = await findAndVerifyOtp(OTPVerification, {
      phone: req.body.phone_number,
      otp: req.body.otp,
      purpose: "registration",
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    result.record.verified = true;
    await result.record.save();

    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyRegisterOTP failed:", err.message);
    res.status(500).json({ error: "OTP verification failed" });
  }
};

const saveFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ error: "fcm_token is required" });
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
    res.status(500).json({ error: "Save FCM token failed", details: err.message });
  }
};

const logout = async (_req, res) => {
  // Stateless JWT MVP — client discards token
  res.json({ message: "Logged out" });
};

module.exports = {
  register,
  login,
  getProfile,
  updatePassword,
  deleteAccount,
  updateProfile,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  sendRegisterOTP,
  verifyRegisterOTP,
  saveFcmToken,
  logout,
};
