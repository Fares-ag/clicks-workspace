const { hashPassword } = require("../utils/authUtils");
const Business = require("../models/Business");
const BusinessUser = require("../models/BusinessUser");
const Source = require("../models/Source");
const Job = require("../models/Job");
// Same earnings definition as the business portal/dashboard: a "profit" cut is
// a share of the audited net profit, not of revenue.
const { cutAmountExpr } = require("../../../clicks-shared/utils/businessCut");

async function listBusinesses(req, res) {
  try {
    const { page = 1, limit = 20, search = "", isActive } = req.query;
    const match = {};
    if (search) {
      match.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (isActive === "true") match.isActive = true;
    if (isActive === "false") match.isActive = false;

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const limitNum = Number(limit);

    const [rows, total] = await Promise.all([
      Business.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limitNum },
        {
          $lookup: {
            from: "businessusers",
            localField: "_id",
            foreignField: "business_id",
            as: "users",
          },
        },
        {
          $lookup: {
            from: "sources",
            localField: "defaultSource",
            foreignField: "_id",
            as: "defaultSourceDoc",
          },
        },
        {
          $addFields: {
            userCount: { $size: "$users" },
            defaultSource: { $arrayElemAt: ["$defaultSourceDoc", 0] },
          },
        },
        {
          $project: {
            users: 0,
            defaultSourceDoc: 0,
          },
        },
      ]),
      Business.countDocuments(match),
    ]);

    const businesses = rows.map((b) => ({
      ...b,
      defaultSource: b.defaultSource
        ? {
            _id: b.defaultSource._id,
            mainSourceName: b.defaultSource.mainSourceName,
          }
        : null,
    }));

    res.json({ businesses, total, page: Number(page), limit: limitNum });
  } catch (err) {
    res.status(500).json({ message: "Failed to list businesses", error: err.message });
  }
}

async function getBusiness(req, res) {
  try {
    const business = await Business.findById(req.params.id)
      .populate("defaultSource", "mainSourceName")
      .lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    const users = await BusinessUser.find({ business_id: business._id })
      .select("-password")
      .lean();
    res.json({ business, users });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch business", error: err.message });
  }
}

async function createBusiness(req, res) {
  try {
    const {
      name,
      phone,
      email,
      address,
      cutType,
      cutPercent,
      defaultSource,
      isActive,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    let sourceId = defaultSource || null;
    if (!sourceId) {
      let source = await Source.findOne({ mainSourceName: "Business Portal" });
      if (!source) {
        source = await Source.create({
          mainSourceName: "Business Portal",
          isActive: true,
          subSources: [{ name: "Mobile App" }],
        });
      }
      sourceId = source._id;
    }

    const business = await Business.create({
      name: String(name).trim(),
      phone: phone || "",
      email: email || "",
      address: address || "",
      cutType: cutType === "profit" ? "profit" : "revenue",
      cutPercent: cutPercent != null ? Number(cutPercent) : 0,
      defaultSource: sourceId,
      isActive: isActive !== false,
    });

    res.status(201).json({ message: "Business created", business });
  } catch (err) {
    res.status(500).json({ message: "Failed to create business", error: err.message });
  }
}

async function updateBusiness(req, res) {
  try {
    const {
      name,
      phone,
      email,
      address,
      cutType,
      cutPercent,
      defaultSource,
      isActive,
    } = req.body;

    const update = {};
    if (name != null) update.name = String(name).trim();
    if (phone != null) update.phone = phone;
    if (email != null) update.email = email;
    if (address != null) update.address = address;
    if (cutType === "revenue" || cutType === "profit") update.cutType = cutType;
    if (cutPercent != null) update.cutPercent = Number(cutPercent);
    if (defaultSource != null) update.defaultSource = defaultSource;
    if (typeof isActive === "boolean") update.isActive = isActive;

    const business = await Business.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).populate("defaultSource", "mainSourceName");

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    res.json({ message: "Business updated", business });
  } catch (err) {
    res.status(500).json({ message: "Failed to update business", error: err.message });
  }
}

async function createBusinessUser(req, res) {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const { name, email, phone, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    const exists = await BusinessUser.findOne({
      email: String(email).trim().toLowerCase(),
    });
    if (exists) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const user = await BusinessUser.create({
      business_id: business._id,
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone || "",
      password: hashPassword(password),
      role: role === "owner" ? "owner" : "staff",
      isActive: true,
    });

    res.status(201).json({
      message: "Business user created",
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
    res.status(500).json({ message: "Failed to create business user", error: err.message });
  }
}

async function updateBusinessUser(req, res) {
  try {
    const { id, userId } = req.params;
    const { name, phone, role, isActive } = req.body;

    const user = await BusinessUser.findOne({
      _id: userId,
      business_id: id,
    });
    if (!user) {
      return res.status(404).json({ message: "Business user not found" });
    }

    if (name != null) user.name = String(name).trim();
    if (phone != null) user.phone = phone;
    if (role === "owner" || role === "staff") user.role = role;
    if (typeof isActive === "boolean") user.isActive = isActive;
    await user.save();

    res.json({
      message: "Business user updated",
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
    res.status(500).json({ message: "Failed to update business user", error: err.message });
  }
}

async function resetBusinessUserPassword(req, res) {
  try {
    const { id, userId } = req.params;
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await BusinessUser.findOne({
      _id: userId,
      business_id: id,
    });
    if (!user) {
      return res.status(404).json({ message: "Business user not found" });
    }

    user.password = hashPassword(password);
    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to reset password", error: err.message });
  }
}

async function getBusinessStats(req, res) {
  try {
    const businessId = req.params.id;
    const business = await Business.findById(businessId).lean();
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const completedMatch = {
      business_id: business._id,
      job_status: "completed",
    };

    const [open, inProgress, completed, cancelled, earningsAgg] = await Promise.all([
      Job.countDocuments({
        business_id: business._id,
        job_status: { $in: ["pending", "assigned", "accepted"] },
      }),
      Job.countDocuments({
        business_id: business._id,
        job_status: { $in: ["en_route", "arrived", "in_progress"] },
      }),
      Job.countDocuments(completedMatch),
      Job.countDocuments({
        business_id: business._id,
        job_status: "cancelled",
      }),
      Job.aggregate([
        { $match: completedMatch },
        { $project: { cut: cutAmountExpr() } },
        { $group: { _id: null, estimatedEarnings: { $sum: "$cut" } } },
      ]),
    ]);

    res.json({
      cutType: business.cutType || "revenue",
      cutPercent: business.cutPercent ?? 0,
      jobsOpen: open,
      jobsInProgress: inProgress,
      jobsCompleted: completed,
      jobsCancelled: cancelled,
      estimatedEarnings:
        Math.round((earningsAgg[0]?.estimatedEarnings || 0) * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load business stats", error: err.message });
  }
}

module.exports = {
  listBusinesses,
  getBusiness,
  createBusiness,
  updateBusiness,
  createBusinessUser,
  updateBusinessUser,
  resetBusinessUserPassword,
  getBusinessStats,
};
