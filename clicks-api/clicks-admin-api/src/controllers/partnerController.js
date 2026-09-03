const Partner = require("../models/Partner");
const PartnerEarning = require("../models/PartnerEarning");
const PartnerWithdrawal = require("../models/PartnerWithdrawal");
const { hashPassword, comparePassword, generateAccessToken } = require("../utils/authUtils");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const {
  ensureGoogleSourceWithSubSource,
  refreshPeriodStatus,
} = require("../../../clicks-shared/services/partnerService");

function publicPartner(partner) {
  refreshPeriodStatus(partner);
  return partner.toPublicJSON();
}

/**
 * Snapshot amounts for a withdraw request type.
 *
 * Both figures are net of what has already been settled (withdrawnInvestment /
 * withdrawnEarnings, incremented when a withdrawal is marked paid), otherwise
 * the full lifetime principal + earnings would be payable again every period.
 */
function withdrawAmounts(partner, type) {
  const principal = Math.max(0, Number(partner.investmentAmount || 0));
  const investment = Math.max(
    0,
    principal - Math.max(0, Number(partner.withdrawnInvestment || 0))
  );
  const accrued = Math.max(0, Number(partner.accruedTotal || 0));
  const earnings = Math.max(
    0,
    accrued - principal - Math.max(0, Number(partner.withdrawnEarnings || 0))
  );
  if (type === "investment") {
    return { investmentAmount: investment, earningsAmount: 0, totalAmount: investment };
  }
  if (type === "earnings") {
    return { investmentAmount: 0, earningsAmount: earnings, totalAmount: earnings };
  }
  // both
  return {
    investmentAmount: investment,
    earningsAmount: earnings,
    totalAmount: investment + earnings,
  };
}

function withdrawSummary(partner) {
  // Same source of truth as the request path so the app never offers an amount
  // partnerCreateWithdrawal would refuse.
  const { investmentAmount: investment, earningsAmount: earnings } =
    withdrawAmounts(partner, "both");
  const available =
    partner.status === "frozen" || partner.status === "capped";
  return {
    withdrawAvailable: available,
    amounts: {
      investment,
      earnings,
      both: investment + earnings,
    },
  };
}

async function listPartners(req, res) {
  try {
    const { page = 1, limit = 50, search = "", status } = req.query;
    const limitNum = capAdminLimit(limit, 50, 100);
    const match = {};
    // Escape + length-cap the operator-supplied term: an unescaped "(" or "*"
    // makes mongod reject the query, and "(a+)+$" would burn a mongod core.
    const term = escapeRegex(String(search || "").trim().slice(0, 64));
    if (term) {
      const rx = new RegExp(term, "i");
      match.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
      ];
    }
    if (status) match.status = status;

    const skip = (Math.max(1, Number(page)) - 1) * limitNum;
    const [rows, total] = await Promise.all([
      Partner.find(match).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Partner.countDocuments(match),
    ]);

    const partners = [];
    for (const p of rows) {
      const before = p.status;
      const needsCap = p.currentPeriodCap == null;
      if (needsCap) p.currentPeriodCap = p.formulaPeriodCap();
      refreshPeriodStatus(p);
      if (p.status !== before || needsCap) await p.save();
      partners.push(p.toPublicJSON());
    }

    res.json({
      partners,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to list partners", error: err.message });
  }
}

async function getPartner(req, res) {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    const before = partner.status;
    const needsCap = partner.currentPeriodCap == null;
    if (needsCap) partner.currentPeriodCap = partner.formulaPeriodCap();
    refreshPeriodStatus(partner);
    if (partner.status !== before || needsCap) await partner.save();
    res.json({ partner: partner.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch partner", error: err.message });
  }
}

async function createPartner(req, res) {
  try {
    const {
      name,
      phone,
      email,
      password,
      investmentAmount = 10000,
      profitPerPeriod = 4000,
      periodMonths = 2,
      currentPeriodCap,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "password must be at least 6 characters" });
    }

    const existing = await Partner.findOne({
      name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (existing) {
      return res.status(409).json({ message: "Partner name already exists" });
    }

    const inv = Number(investmentAmount);
    const profit = Number(profitPerPeriod);
    const period = 1;
    const defaultCap = inv + period * profit;
    const cap =
      currentPeriodCap !== undefined && currentPeriodCap !== null && currentPeriodCap !== ""
        ? Number(currentPeriodCap)
        : defaultCap;
    if (Number.isNaN(cap) || cap < 0) {
      return res.status(400).json({ message: "currentPeriodCap must be a non-negative number" });
    }

    const started = new Date();
    const partner = await Partner.create({
      name: String(name).trim(),
      phone: phone || "",
      email: email || "",
      password: hashPassword(password),
      investmentAmount: inv,
      profitPerPeriod: profit,
      currentPeriodCap: cap,
      periodMonths: Number(periodMonths),
      currentPeriod: period,
      periodStartedAt: started,
      periodEndsAt: Partner.computePeriodEnd(started, periodMonths),
      status: "active",
      accruedTotal: 0,
      isActive: true,
    });

    await ensureGoogleSourceWithSubSource(partner.name);

    res.status(201).json({ partner: publicPartner(partner) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create partner", error: err.message });
  }
}

async function updatePartner(req, res) {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    const sameCalendarDay = (a, b) => {
      const da = new Date(a);
      const db = new Date(b);
      if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
      return (
        da.getFullYear() === db.getFullYear() &&
        da.getMonth() === db.getMonth() &&
        da.getDate() === db.getDate()
      );
    };
    const hasLockedPeriodDates =
      partner.periodStartedAt &&
      partner.periodEndsAt &&
      !Number.isNaN(new Date(partner.periodStartedAt).getTime()) &&
      !Number.isNaN(new Date(partner.periodEndsAt).getTime());

    const fields = [
      "phone",
      "email",
      "isActive",
      "investmentAmount",
      "profitPerPeriod",
      "periodMonths",
    ];
    for (const f of fields) {
      if (req.body[f] !== undefined) partner[f] = req.body[f];
    }
    if (req.body.currentPeriodCap !== undefined) {
      const cap = Number(req.body.currentPeriodCap);
      if (Number.isNaN(cap) || cap < 0) {
        return res.status(400).json({ message: "currentPeriodCap must be a non-negative number" });
      }
      partner.currentPeriodCap = cap;
    }
    if (req.body.useFormulaCap === true) {
      partner.currentPeriodCap = partner.formulaPeriodCap();
    }
    if (req.body.currentPeriod !== undefined) {
      const n = Number(req.body.currentPeriod);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ message: "currentPeriod must be an integer >= 1" });
      }
      partner.currentPeriod = n;
    }

    const periodStartTouched = req.body.periodStartedAt !== undefined;
    const periodEndTouched = req.body.periodEndsAt !== undefined;
    const periodMonthsTouched = req.body.periodMonths !== undefined;

    if (hasLockedPeriodDates) {
      if (periodStartTouched) {
        const start = new Date(req.body.periodStartedAt);
        if (Number.isNaN(start.getTime()) || !sameCalendarDay(start, partner.periodStartedAt)) {
          return res.status(400).json({
            message: "Period start and end dates cannot be changed once set",
          });
        }
      }
      if (periodEndTouched) {
        const end = new Date(req.body.periodEndsAt);
        if (Number.isNaN(end.getTime()) || !sameCalendarDay(end, partner.periodEndsAt)) {
          return res.status(400).json({
            message: "Period start and end dates cannot be changed once set",
          });
        }
      }
    }

    if (periodStartTouched && !hasLockedPeriodDates) {
      const start = new Date(req.body.periodStartedAt);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ message: "periodStartedAt must be a valid date" });
      }
      partner.periodStartedAt = start;
    }
    if (periodEndTouched && !hasLockedPeriodDates) {
      const end = new Date(req.body.periodEndsAt);
      if (Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "periodEndsAt must be a valid date" });
      }
      partner.periodEndsAt = end;
    } else if (
      !hasLockedPeriodDates &&
      (periodMonthsTouched || periodStartTouched) &&
      req.body.recalculatePeriodEnd !== false
    ) {
      // Changing length/start recalculates end unless admin set an explicit end
      partner.periodEndsAt = Partner.computePeriodEnd(
        partner.periodStartedAt || new Date(),
        partner.periodMonths
      );
    }

    if (
      partner.periodStartedAt &&
      partner.periodEndsAt &&
      new Date(partner.periodEndsAt) <= new Date(partner.periodStartedAt)
    ) {
      return res.status(400).json({
        message: "periodEndsAt must be after periodStartedAt",
      });
    }

    if (req.body.password) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({ message: "password must be at least 6 characters" });
      }
      partner.password = hashPassword(req.body.password);
    }
    if (req.body.name && String(req.body.name).trim() !== partner.name) {
      const newName = String(req.body.name).trim();
      const clash = await Partner.findOne({
        _id: { $ne: partner._id },
        name: new RegExp(`^${newName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });
      if (clash) return res.status(409).json({ message: "Partner name already exists" });
      partner.name = newName;
      await ensureGoogleSourceWithSubSource(newName);
    }
    if (req.body.status === "inactive") {
      partner.status = "inactive";
    } else if (req.body.status === "active") {
      // Explicit admin request — includes reactivation from inactive
      partner.status = "active";
    }

    // Ensure older partners always have an explicit admin-editable cap stored
    if (partner.currentPeriodCap == null) {
      partner.currentPeriodCap = partner.formulaPeriodCap();
    }

    // Re-evaluate capped/frozen/active from dates + accrued vs cap
    if (partner.status !== "inactive") {
      partner.status = "active";
      refreshPeriodStatus(partner);
    }

    await partner.save();
    res.json({ partner: publicPartner(partner) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update partner", error: err.message });
  }
}

async function startNextPeriod(req, res) {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    refreshPeriodStatus(partner);
    if (!["capped", "frozen"].includes(partner.status)) {
      return res.status(400).json({
        message: `Cannot start next period from status: ${partner.status}`,
      });
    }

    const previousCap = partner.periodCap();
    partner.currentPeriod = Number(partner.currentPeriod || 1) + 1;
    partner.periodStartedAt = new Date();

    if (req.body?.periodMonths !== undefined) {
      const months = Number(req.body.periodMonths);
      if (!Number.isInteger(months) || months < 1) {
        return res.status(400).json({ message: "periodMonths must be an integer >= 1" });
      }
      partner.periodMonths = months;
    }

    if (req.body?.periodEndsAt) {
      const end = new Date(req.body.periodEndsAt);
      if (Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "periodEndsAt must be a valid date" });
      }
      partner.periodEndsAt = end;
    } else {
      partner.periodEndsAt = Partner.computePeriodEnd(
        partner.periodStartedAt,
        partner.periodMonths
      );
    }

    const bodyCap = req.body?.currentPeriodCap;
    if (bodyCap !== undefined && bodyCap !== null && bodyCap !== "") {
      const cap = Number(bodyCap);
      if (Number.isNaN(cap) || cap < 0) {
        return res.status(400).json({ message: "currentPeriodCap must be a non-negative number" });
      }
      partner.currentPeriodCap = cap;
    } else {
      // Default ladder bump: previous cap + profitPerPeriod
      partner.currentPeriodCap =
        previousCap + Number(partner.profitPerPeriod || 0);
    }

    partner.status = "active";
    await partner.save();

    res.json({ partner: publicPartner(partner) });
  } catch (err) {
    res.status(500).json({ message: "Failed to start next period", error: err.message });
  }
}

async function listEarnings(req, res) {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    const earnings = await PartnerEarning.find({ partner: partner._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate({
        path: "job",
        select: "clientName price jobType subSource job_status completed_at issue location",
      });

    res.json({ earnings, partner: publicPartner(partner) });
  } catch (err) {
    res.status(500).json({ message: "Failed to list earnings", error: err.message });
  }
}

/** Partner app login */
async function partnerLogin(req, res) {
  try {
    const { email, phone, password } = req.body || {};
    if (!password) return res.status(400).json({ message: "password is required" });

    let partner = null;
    if (email) {
      partner = await Partner.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    } else if (phone) {
      partner = await Partner.findOne({ phone: String(phone).trim() }).select("+password");
    } else {
      return res.status(400).json({ message: "email or phone is required" });
    }

    if (!partner || !partner.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!comparePassword(password, partner.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateAccessToken({
      id: partner._id.toString(),
      role: "partner",
      name: partner.name,
    });

    const before = partner.status;
    refreshPeriodStatus(partner);
    if (partner.status !== before) await partner.save();

    res.json({ token, partner: partner.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
}

function requirePartner(req, res, next) {
  if (!req.user || req.user.role !== "partner") {
    return res.status(403).json({ message: "Partner access required" });
  }
  next();
}

async function partnerMe(req, res) {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    const before = partner.status;
    refreshPeriodStatus(partner);
    if (partner.status !== before) await partner.save();
    res.json({ partner: partner.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: "Failed to load profile", error: err.message });
  }
}

async function partnerDashboard(req, res) {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    const before = partner.status;
    refreshPeriodStatus(partner);
    if (partner.status !== before) await partner.save();

    const now = new Date();
    const startOfWeek = new Date(now);
    // Monday-based week
    const day = startOfWeek.getDay();
    const diffToMon = day === 0 ? 6 : day - 1;
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - diffToMon);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [recent, weekAgg, monthAgg, openWithdrawal] = await Promise.all([
      PartnerEarning.find({ partner: partner._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate({
          path: "job",
          select: "clientName price jobType completed_at issue",
        }),
      PartnerEarning.aggregate([
        {
          $match: {
            partner: partner._id,
            createdAt: { $gte: startOfWeek },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PartnerEarning.aggregate([
        {
          $match: {
            partner: partner._id,
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      PartnerWithdrawal.findOne({
        partner: partner._id,
        status: { $in: ["pending", "approved"] },
      }).sort({
        createdAt: -1,
      }),
    ]);

    const summary = withdrawSummary(partner);

    res.json({
      partner: partner.toPublicJSON(),
      recentEarnings: recent,
      stats: {
        accruedThisWeek: weekAgg[0]?.total || 0,
        accruedThisMonth: monthAgg[0]?.total || 0,
      },
      withdrawAvailable: summary.withdrawAvailable,
      withdrawAmounts: summary.amounts,
      openWithdrawal: openWithdrawal || null,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load dashboard", error: err.message });
  }
}

async function partnerUpdateProfile(req, res) {
  try {
    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    if (req.body.phone !== undefined) {
      partner.phone = String(req.body.phone || "").trim();
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email || "").toLowerCase().trim();
      if (email && email !== partner.email) {
        const clash = await Partner.findOne({
          _id: { $ne: partner._id },
          email,
        });
        if (clash) {
          return res.status(409).json({ message: "Email already in use" });
        }
        partner.email = email;
      }
    }

    await partner.save();
    res.json({ partner: partner.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ message: "Failed to update profile", error: err.message });
  }
}

async function partnerChangePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        message: "currentPassword and newPassword are required",
      });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "password must be at least 6 characters" });
    }

    // password is select:false on the schema — without this the hash is
    // undefined and bcrypt throws instead of comparing.
    const partner = await Partner.findById(req.user.id).select("+password");
    if (!partner) return res.status(404).json({ message: "Partner not found" });
    if (typeof partner.password !== "string" || !partner.password) {
      return res.status(500).json({ message: "Failed to change password" });
    }
    if (!comparePassword(currentPassword, partner.password)) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    partner.password = hashPassword(newPassword);
    await partner.save();
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to change password", error: err.message });
  }
}

async function partnerSaveFcmToken(req, res) {
  try {
    const { fcm_token } = req.body || {};
    if (!fcm_token || typeof fcm_token !== "string") {
      return res.status(400).json({ message: "fcm_token is required" });
    }
    await Partner.findByIdAndUpdate(req.user.id, {
      fcm_token: fcm_token.trim(),
    });
    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ message: "Failed to save FCM token", error: err.message });
  }
}

async function partnerClearFcmToken(req, res) {
  try {
    await Partner.findByIdAndUpdate(req.user.id, { fcm_token: null });
    res.json({ message: "FCM token cleared" });
  } catch (err) {
    res.status(500).json({ message: "Failed to clear FCM token", error: err.message });
  }
}

async function partnerEarnings(req, res) {
  try {
    const earnings = await PartnerEarning.find({ partner: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate({
        path: "job",
        select: "clientName price jobType subSource completed_at issue location",
      });
    res.json({ earnings });
  } catch (err) {
    res.status(500).json({ message: "Failed to load earnings", error: err.message });
  }
}

async function partnerListWithdrawals(req, res) {
  try {
    const withdrawals = await PartnerWithdrawal.find({ partner: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ withdrawals });
  } catch (err) {
    res.status(500).json({ message: "Failed to load withdrawals", error: err.message });
  }
}

async function partnerCreateWithdrawal(req, res) {
  try {
    const type = String(req.body?.type || "").trim();
    if (!["earnings", "investment", "both"].includes(type)) {
      return res.status(400).json({
        message: "type must be earnings, investment, or both",
      });
    }

    const partner = await Partner.findById(req.user.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    const before = partner.status;
    refreshPeriodStatus(partner);
    if (partner.status !== before) await partner.save();

    if (partner.status !== "frozen" && partner.status !== "capped") {
      return res.status(400).json({
        message: "Withdrawals are only available when the period is capped or frozen",
      });
    }

    // Approved-but-unpaid counts as open too: its amounts have not been debited
    // from the ledger yet, so a second request would claim the same money twice.
    const open = await PartnerWithdrawal.findOne({
      partner: partner._id,
      status: { $in: ["pending", "approved"] },
    });
    if (open) {
      return res.status(409).json({
        message: "You already have a withdrawal request in progress",
        withdrawal: open,
      });
    }

    const amounts = withdrawAmounts(partner, type);
    if (amounts.totalAmount <= 0) {
      return res.status(400).json({
        message: "Nothing available to withdraw for this type",
      });
    }

    const partnerNote = String(req.body?.note || req.body?.partnerNote || "")
      .trim()
      .slice(0, 1000);

    const withdrawal = await PartnerWithdrawal.create({
      partner: partner._id,
      type,
      investmentAmount: amounts.investmentAmount,
      earningsAmount: amounts.earningsAmount,
      totalAmount: amounts.totalAmount,
      period: partner.currentPeriod,
      status: "pending",
      partnerNote,
    });

    res.status(201).json({
      message: "Withdrawal request submitted. Settlement is handled in cash offline.",
      withdrawal,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create withdrawal", error: err.message });
  }
}

async function listPartnerWithdrawals(req, res) {
  try {
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ message: "Partner not found" });

    const withdrawals = await PartnerWithdrawal.find({ partner: partner._id })
      .sort({ createdAt: -1 })
      .populate("reviewedBy", "firstName lastName email");
    res.json({ withdrawals });
  } catch (err) {
    res.status(500).json({ message: "Failed to list withdrawals", error: err.message });
  }
}

async function updatePartnerWithdrawal(req, res) {
  try {
    const { status, adminNote } = req.body || {};
    if (!["approved", "rejected", "paid"].includes(status)) {
      return res.status(400).json({
        message: "status must be approved, rejected, or paid",
      });
    }

    const withdrawal = await PartnerWithdrawal.findOne({
      _id: req.params.withdrawalId,
      partner: req.params.id,
    });
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    const note =
      adminNote === undefined
        ? undefined
        : String(adminNote || "").trim().slice(0, 2000);

    if (status === "approved" || status === "rejected") {
      // "rejected" is also allowed from "approved": an approved-but-unpaid
      // request must have a way out, otherwise it blocks the partner from ever
      // filing another one. Nothing was debited on approval, so there is no
      // ledger movement to reverse here.
      const allowedFrom =
        status === "rejected" ? ["pending", "approved"] : ["pending"];
      if (!allowedFrom.includes(withdrawal.status)) {
        return res.status(400).json({
          message: `Cannot mark ${status} when status is ${withdrawal.status}`,
        });
      }
      const review = { status, reviewedBy: req.user.id, reviewedAt: new Date() };
      if (note !== undefined) review.adminNote = note;

      // Compare-and-set on the status, same as the paid path below, so a
      // concurrent PATCH that already settled this row cannot be reverted back
      // to approved/rejected and re-opened for a second ledger debit.
      const reviewed = await PartnerWithdrawal.findOneAndUpdate(
        { _id: withdrawal._id, status: { $in: allowedFrom } },
        { $set: review },
        { new: true }
      );
      if (!reviewed) {
        return res.status(409).json({
          message: "Withdrawal was already updated by another request",
        });
      }
    } else if (status === "paid") {
      if (withdrawal.status !== "approved" && withdrawal.status !== "pending") {
        return res.status(400).json({
          message: `Cannot mark paid when status is ${withdrawal.status}`,
        });
      }
      const settlement = { status: "paid", paidAt: new Date() };
      // Allow pending → paid directly for ops speed, or approved → paid
      if (withdrawal.status === "pending") {
        settlement.reviewedBy = req.user.id;
        settlement.reviewedAt = new Date();
      }
      if (note !== undefined) settlement.adminNote = note;

      // Compare-and-set on the status: only the request that actually flips the
      // row to "paid" is allowed to debit the partner ledger, so a repeated or
      // concurrent PATCH can never double-debit.
      const settled = await PartnerWithdrawal.findOneAndUpdate(
        { _id: withdrawal._id, status: { $in: ["pending", "approved"] } },
        { $set: settlement },
        { new: true }
      );
      if (!settled) {
        return res.status(409).json({
          message: "Withdrawal was already settled by another request",
        });
      }

      // Debit what was actually handed over so the same principal/earnings are
      // not offered again next period.
      await Partner.updateOne(
        { _id: settled.partner },
        {
          $inc: {
            withdrawnInvestment: Math.max(0, Number(settled.investmentAmount || 0)),
            withdrawnEarnings: Math.max(0, Number(settled.earningsAmount || 0)),
          },
        }
      );
    }

    const populated = await PartnerWithdrawal.findById(withdrawal._id).populate(
      "reviewedBy",
      "firstName lastName email"
    );
    res.json({ withdrawal: populated });
  } catch (err) {
    res.status(500).json({ message: "Failed to update withdrawal", error: err.message });
  }
}

module.exports = {
  listPartners,
  getPartner,
  createPartner,
  updatePartner,
  startNextPeriod,
  listEarnings,
  listPartnerWithdrawals,
  updatePartnerWithdrawal,
  partnerLogin,
  requirePartner,
  partnerMe,
  partnerDashboard,
  partnerEarnings,
  partnerListWithdrawals,
  partnerCreateWithdrawal,
  partnerUpdateProfile,
  partnerChangePassword,
  partnerSaveFcmToken,
  partnerClearFcmToken,
};
