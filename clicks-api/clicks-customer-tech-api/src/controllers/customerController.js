const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Customer, OTPVerification } = require("../../../clicks-shared/models");
const { sendSMS } = require("../services/smsService");

const register = async (req, res) => {
  try {
    const { phone_number, first_name, last_name, email, password } = req.body;
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
    const { phone_number, password } = req.body;
    const customer = await Customer.findOne({ phone_number });
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
    const { oldPassword, newPassword } = req.body;
    const customer = await Customer.findById(id);
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
    const update = req.body;
    const customer = await Customer.findByIdAndUpdate(id, update, { new: true });
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
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    // Check if customer exists
    const customer = await Customer.findOne({ phone_number });
    if (!customer) {
      return res.status(404).json({ error: "No account found with this phone number" });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    // Delete any existing OTPs for this phone
    await OTPVerification.deleteMany({ phone: phone_number, purpose: "password_reset" });
    
    // Save new OTP
    await OTPVerification.create({
      phone: phone_number,
      otp,
      expiresAt,
      purpose: "password_reset"
    });
    
    // Send OTP via SMS
    await sendSMS(phone_number, `Your Clicks password reset OTP is: ${otp}. Valid for 10 minutes.`);
    
    res.json({ 
      message: "OTP sent successfully",
      phone_number: phone_number.replace(/.(?=.{4})/g, '*') // Mask phone number
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
};

// Verify OTP for password reset
const verifyResetOTP = async (req, res) => {
  try {
    const { phone_number, otp } = req.body;
    
    if (!phone_number || !otp) {
      return res.status(400).json({ error: "Phone number and OTP are required" });
    }
    
    // Find valid OTP
    const otpRecord = await OTPVerification.findOne({
      phone: phone_number,
      otp,
      purpose: "password_reset"
    });
    
    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid OTP" });
    }
    
    if (otpRecord.expiresAt < new Date()) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: "OTP has expired" });
    }
    
    // Mark OTP as verified (keep it for the reset step)
    otpRecord.verified = true;
    await otpRecord.save();
    
    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
};

// Reset Password after OTP verification
const resetPassword = async (req, res) => {
  try {
    const { phone_number, otp, new_password, confirm_password } = req.body;
    
    if (!phone_number || !otp || !new_password || !confirm_password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    
    if (new_password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }
    
    // Verify OTP is valid and verified
    const otpRecord = await OTPVerification.findOne({
      phone: phone_number,
      otp,
      purpose: "password_reset",
      verified: true
    });
    
    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid or unverified OTP. Please verify OTP first." });
    }
    
    if (otpRecord.expiresAt < new Date()) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: "OTP has expired. Please request a new one." });
    }
    
    // Find customer and update password
    const customer = await Customer.findOne({ phone_number });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    
    // Hash and update password
    customer.password = await bcrypt.hash(new_password, 10);
    await customer.save();
    
    // Delete used OTP
    await OTPVerification.deleteMany({ phone: phone_number, purpose: "password_reset" });
    
    res.json({ message: "Password reset successfully. You can now login with your new password." });
  } catch (err) {
    res.status(500).json({ error: "Password reset failed", details: err.message });
  }
};

// Register OTP (purpose: registration)
const sendRegisterOTP = async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) {
      return res.status(400).json({ error: "phone_number is required" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
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
    const { phone_number, otp } = req.body;
    if (!phone_number || !otp) {
      return res.status(400).json({ error: "phone_number and otp are required" });
    }
    const otpRecord = await OTPVerification.findOne({
      phone: phone_number,
      otp,
      purpose: "registration",
    });
    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid OTP" });
    }
    if (otpRecord.expiresAt < new Date()) {
      await OTPVerification.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ error: "OTP has expired" });
    }
    otpRecord.verified = true;
    await otpRecord.save();
    res.json({ message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
};

const saveFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) {
      return res.status(400).json({ error: "fcm_token is required" });
    }
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
