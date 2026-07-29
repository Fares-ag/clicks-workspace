const Admin = require("../models/Admin");
const PasswordReset = require("../models/PasswordReset");
const { hashPassword, comparePassword, generateAccessToken, generateRefreshToken } = require("../utils/authUtils");
const { sendPasswordResetEmail, sendPasswordResetConfirmationEmail } = require("../utils/emailService");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Login
async function login(req, res) {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email });
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
}

// Logout (invalidate refresh token on client side)
function logout(req, res) {
  res.json({ message: "Logged out" });
}

// Forgot Password - Send OTP/Token via email
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Email not found" });
    }
    
    // Generate a 6-digit OTP
    const resetToken = crypto.randomInt(100000, 999999).toString();
    
    // Set expiration to 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    // Delete any existing password reset tokens for this email
    await PasswordReset.deleteMany({ email });
    
    // Create new password reset token
    await PasswordReset.create({
      email,
      token: resetToken,
      expiresAt,
      used: false
    });
    
    // Send email with OTP
    await sendPasswordResetEmail(email, `${admin.firstName} ${admin.lastName}`, resetToken);
    
    res.json({ 
      message: "Password reset code sent to email",
      email: email
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
    const { email, token, newPassword } = req.body;
    
    if (!email || !token || !newPassword) {
      return res.status(400).json({ 
        message: "Email, token, and new password are required" 
      });
    }
    
    // Find the password reset token
    const resetRecord = await PasswordReset.findOne({ 
      email, 
      token, 
      used: false 
    });
    
    if (!resetRecord) {
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
    
    // Find the admin
    const admin = await Admin.findOne({ email });
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
      await sendPasswordResetConfirmationEmail(email, `${admin.firstName} ${admin.lastName}`);
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
function refreshToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "No refresh token" });
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  jwt.verify(refreshToken, secret, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid refresh token" });
    const accessToken = generateAccessToken({ id: user.id, role: user.role, email: user.email });
    res.json({ accessToken });
  });
}

module.exports = {
  login,
  logout,
  forgotPassword,
  resetPassword,
  refreshToken
};
