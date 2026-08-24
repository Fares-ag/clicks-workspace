const FinanceUser = require("../models/FinanceUser");
const { hashPassword } = require("../utils/authUtils");

async function listFinanceUsers(req, res) {
  try {
    const users = await FinanceUser.find()
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: "Failed to list finance users", error: err.message });
  }
}

async function createFinanceUser(req, res) {
  try {
    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    const exists = await FinanceUser.findOne({
      email: String(email).trim().toLowerCase(),
    });
    if (exists) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const user = await FinanceUser.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone || "",
      password: hashPassword(password),
      role: role === "admin" ? "admin" : "operator",
      isActive: true,
    });

    res.status(201).json({
      message: "Finance user created",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create finance user", error: err.message });
  }
}

async function updateFinanceUser(req, res) {
  try {
    const { name, phone, role, isActive } = req.body;
    const user = await FinanceUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Finance user not found" });
    }

    if (name != null) user.name = String(name).trim();
    if (phone != null) user.phone = phone;
    if (role === "admin" || role === "operator") user.role = role;
    if (typeof isActive === "boolean") user.isActive = isActive;
    await user.save();

    res.json({
      message: "Finance user updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to update finance user", error: err.message });
  }
}

async function resetFinanceUserPassword(req, res) {
  try {
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await FinanceUser.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Finance user not found" });
    }

    user.password = hashPassword(password);
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reset password", error: err.message });
  }
}

module.exports = {
  listFinanceUsers,
  createFinanceUser,
  updateFinanceUser,
  resetFinanceUserPassword,
};
