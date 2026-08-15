const axios = require("axios");
const { generateAccessToken, comparePassword } = require("../utils/authUtils");
const BusinessUser = require("../models/BusinessUser");
const Business = require("../models/Business");
const Job = require("../models/Job");
const Source = require("../models/Source");
const VehicleMake = require("../models/VehicleMake");
const VehicleModel = require("../models/VehicleModel");
const { JOB_TYPES } = require("../../../clicks-shared/constants/jobTypes");

const DEFAULT_COUNTRY_CODE = "+974";

/** Same phone rules as admin Add Job: 8 local digits → E.164. */
const toLocalDigits = (raw, countryCode = DEFAULT_COUNTRY_CODE) => {
  let digits = String(raw ?? "").replace(/\D/g, "");
  const cc = String(countryCode ?? "").replace(/\D/g, "");
  if (cc && digits.startsWith(cc) && digits.length > cc.length) {
    digits = digits.slice(cc.length);
  }
  if (digits.length > 8 && digits.startsWith("974")) {
    digits = digits.slice(3);
  }
  return digits.slice(0, 8);
};

const toE164 = (localOrRaw, countryCode = DEFAULT_COUNTRY_CODE) => {
  const local = toLocalDigits(localOrRaw, countryCode);
  const cc = String(countryCode || DEFAULT_COUNTRY_CODE).startsWith("+")
    ? String(countryCode || DEFAULT_COUNTRY_CODE)
    : `+${String(countryCode || "974").replace(/^\+/, "")}`;
  return `${cc}${local}`;
};

const isValidLocalPhone = (localDigits) => /^\d{8}$/.test(String(localDigits ?? ""));

const normalizePhone = (raw) => {
  let phone = String(raw || "").trim().replace(/[\s-]/g, "");
  if (phone && !phone.startsWith("+") && /^\d+$/.test(phone)) {
    phone = `+${phone}`;
  }
  return phone;
};

async function login(req, res) {
  try {
    const { phone, email, password } = req.body;
    if (!password || (!phone && !email)) {
      return res.status(400).json({ message: "Phone or email and password required" });
    }

    let user;
    if (email) {
      user = await BusinessUser.findOne({ email: String(email).trim().toLowerCase() });
    } else {
      const normalized = normalizePhone(phone);
      const bare = normalized.startsWith("+") ? normalized.slice(1) : normalized;
      user = await BusinessUser.findOne({
        $or: [{ phone: normalized }, { phone: bare }, { phone: String(phone).trim() }],
      });
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!comparePassword(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const business = await Business.findById(user.business_id);
    if (!business || !business.isActive) {
      return res.status(403).json({ message: "Business account is inactive" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: "Auth not configured" });
    }

    const accessToken = generateAccessToken({
      id: user._id.toString(),
      role: "business",
      business_id: business._id.toString(),
      email: user.email,
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      business: {
        id: business._id,
        name: business.name,
        cutType: business.cutType,
        cutPercent: business.cutPercent,
      },
    });
  } catch (err) {
    console.error("Business login error:", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
}

async function me(req, res) {
  try {
    const business = req.business;
    const user = req.businessUser;
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      business: {
        id: business._id,
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        cutType: business.cutType,
        cutPercent: business.cutPercent,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load profile", error: err.message });
  }
}

async function resolveDefaultSource(business) {
  if (business.defaultSource) {
    const existing = await Source.findById(business.defaultSource);
    if (existing) return existing;
  }
  let source = await Source.findOne({ mainSourceName: "Business Portal" });
  if (!source) {
    source = await Source.create({
      mainSourceName: "Business Portal",
      isActive: true,
      subSources: [{ name: "Mobile App" }],
    });
  }
  if (!business.defaultSource) {
    business.defaultSource = source._id;
    await business.save();
  }
  return source;
}

/**
 * Create job — same payload / validation rules as admin Add Job.
 * Differences for portal: source + business cut stamped server-side; no technician assign.
 */
async function createJob(req, res) {
  try {
    const business = req.business;
    const user = req.businessUser;
    const {
      clientName,
      clientMobileNumber,
      countryCode,
      clientEmail,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      vinNumber,
      issue,
      location,
      dateTime,
      jobType,
      price,
      subSource,
      customer_id,
      customer_vehicle_id,
    } = req.body;

    // Same required set as admin (minus source — portal stamps Business Portal)
    if (!clientName || !clientMobileNumber || !location || !dateTime || !jobType || price == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!issue || !String(issue).trim()) {
      return res.status(400).json({ message: "Issue description is mandatory" });
    }
    if (!vehicleMake || !vehicleModel) {
      return res.status(400).json({ message: "Vehicle make and model are required" });
    }

    const cc = countryCode || DEFAULT_COUNTRY_CODE;
    const local = toLocalDigits(clientMobileNumber, cc);
    if (!isValidLocalPhone(local)) {
      return res.status(400).json({
        message: "Phone number must be exactly 8 digits (without country code)",
      });
    }

    const allowedTypes = JOB_TYPES;
    if (!allowedTypes.includes(jobType)) {
      return res.status(400).json({ message: "Invalid jobType" });
    }

    const source = await resolveDefaultSource(business);

    const job = await Job.create({
      clientName: String(clientName).trim(),
      clientMobileNumber: toE164(local, cc),
      clientEmail: clientEmail ? String(clientEmail).trim() : "",
      vehicleMake: String(vehicleMake).trim(),
      vehicleModel: String(vehicleModel).trim(),
      vehicleYear:
        vehicleYear != null && vehicleYear !== "" ? Number(vehicleYear) : null,
      licensePlate: licensePlate ? String(licensePlate).trim() : "",
      vinNumber: vinNumber ? String(vinNumber).trim() : "",
      issue: String(issue).trim(),
      location: String(location).trim(),
      dateTime: new Date(dateTime),
      jobType,
      price: Number(price),
      source: source._id,
      subSource: subSource ? String(subSource).trim() : "Mobile App",
      // Portal never assigns tech — same as admin when technician left empty → pending
      assignedTechnician: null,
      job_status: "pending",
      payment_status: "unpaid",
      customer_id: customer_id || null,
      customer_vehicle_id: customer_vehicle_id || null,
      business_id: business._id,
      businessName: business.name,
      businessCutType: business.cutType,
      businessCutPercent: business.cutPercent,
      created_by_business_user: user._id,
    });

    const populated = await Job.findById(job._id)
      .populate("source", "mainSourceName")
      .lean();

    // Same urgency path as SOS: push to admin sockets with business tag payload
    let adminsNotified = false;
    try {
      const customerTechApiUrl =
        process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
      const secret = process.env.INTERNAL_API_SECRET;
      if (!secret) {
        console.error(
          "INTERNAL_API_SECRET missing — cannot notify admins of business job"
        );
      } else {
        const notifyRes = await axios.post(
          `${customerTechApiUrl}/api/sos/notify-business-job`,
          {
            job_id: job._id.toString(),
            business_id: business._id.toString(),
            businessName: business.name,
            sourceLabel: "Business Portal",
            companyName: business.name,
            clientName: job.clientName,
            clientMobileNumber: job.clientMobileNumber,
            clientEmail: job.clientEmail || "",
            vehicle: {
              make: job.vehicleMake || "Unknown",
              model: job.vehicleModel || "Unknown",
              year: job.vehicleYear || "—",
              plate: job.licensePlate || "—",
            },
            location: {
              address: job.location || "",
            },
            issue: job.issue || "",
            jobType: job.jobType || "",
            price: job.price,
            dateTime: job.dateTime,
            status: "pending",
          },
          {
            headers: { "x-internal-secret": secret },
            timeout: 8000,
            validateStatus: () => true,
          }
        );
        if (notifyRes.status >= 200 && notifyRes.status < 300) {
          adminsNotified = true;
        } else {
          console.error(
            "Failed to notify admins of business job:",
            notifyRes.status,
            notifyRes.data
          );
        }
      }
    } catch (notifyErr) {
      console.error(
        "Failed to notify admins of business job:",
        notifyErr.message
      );
    }

    res.status(201).json({
      message: "Job created successfully",
      job: populated,
      adminsNotified,
    });
  } catch (err) {
    console.error("Business createJob error:", err);
    res.status(500).json({ message: "Failed to create job", error: err.message });
  }
}

async function listVehicleMakes(req, res) {
  try {
    // Same catalog as admin Add Job
    const makes = await VehicleMake.find().sort({ makeName: 1 });
    res.json({ makes });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle makes", error: err.message });
  }
}

async function listVehicleModelsByMake(req, res) {
  try {
    const { makeId } = req.params;
    const models = await VehicleModel.find({ makeId }).sort({ modelName: 1 });
    res.json({ models });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle models", error: err.message });
  }
}

async function listJobs(req, res) {
  try {
    const businessId = req.business._id;
    const { page = 1, limit = 20, status, bucket } = req.query;
    const query = { business_id: businessId };
    if (bucket === "open") {
      query.job_status = { $in: ["pending", "assigned", "accepted"] };
    } else if (bucket === "inProgress") {
      query.job_status = { $in: ["en_route", "arrived", "in_progress"] };
    } else if (bucket === "completed") {
      query.job_status = "completed";
    } else if (status) {
      query.job_status = status;
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [jobs, total] = await Promise.all([
      Job.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("assignedTechnician", "firstName lastName phone")
        .populate("source", "mainSourceName")
        .lean(),
      Job.countDocuments(query),
    ]);

    res.json({ jobs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: "Failed to list jobs", error: err.message });
  }
}

async function getJobById(req, res) {
  try {
    const job = await Job.findOne({
      _id: req.params.id,
      business_id: req.business._id,
    })
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName")
      .lean();

    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json({ job });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job", error: err.message });
  }
}

async function dashboard(req, res) {
  try {
    const businessId = req.business._id;
    const [open, inProgress, completed] = await Promise.all([
      Job.countDocuments({
        business_id: businessId,
        job_status: { $in: ["pending", "assigned", "accepted"] },
      }),
      Job.countDocuments({
        business_id: businessId,
        job_status: { $in: ["en_route", "arrived", "in_progress"] },
      }),
      Job.countDocuments({
        business_id: businessId,
        job_status: "completed",
      }),
    ]);
    res.json({
      counts: { open, inProgress, completed, total: open + inProgress + completed },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load dashboard", error: err.message });
  }
}

function periodRange(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "week") {
    const day = start.getDay(); // 0 Sun
    const diff = day === 0 ? 6 : day - 1; // Monday start
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  return null; // all
}

/** Partner analytics — estimated earnings = cut only (never gross job price). */
async function analytics(req, res) {
  try {
    const business = req.business;
    const businessId = business._id;
    const period = String(req.query.period || "month").toLowerCase();
    const allowed = ["today", "week", "month", "all"];
    if (!allowed.includes(period)) {
      return res.status(400).json({ message: "Invalid period" });
    }

    const range = periodRange(period);
    const createdMatch = { business_id: businessId };
    const completedMatch = {
      business_id: businessId,
      job_status: "completed",
    };
    const cancelledMatch = {
      business_id: businessId,
      job_status: "cancelled",
    };
    if (range) {
      createdMatch.createdAt = { $gte: range.start, $lte: range.end };
      completedMatch.completed_at = { $gte: range.start, $lte: range.end };
      cancelledMatch.updatedAt = { $gte: range.start, $lte: range.end };
    }

    const [
      jobsCreated,
      jobsCompleted,
      jobsCancelled,
      jobsOpen,
      jobsInProgress,
      earningsAgg,
      byJobTypeAgg,
    ] = await Promise.all([
      Job.countDocuments(createdMatch),
      Job.countDocuments(completedMatch),
      Job.countDocuments(cancelledMatch),
      Job.countDocuments({
        business_id: businessId,
        job_status: { $in: ["pending", "assigned", "accepted"] },
      }),
      Job.countDocuments({
        business_id: businessId,
        job_status: { $in: ["en_route", "arrived", "in_progress"] },
      }),
      Job.aggregate([
        { $match: completedMatch },
        {
          $project: {
            cut: {
              $multiply: [
                { $ifNull: ["$price", 0] },
                {
                  $divide: [{ $ifNull: ["$businessCutPercent", 0] }, 100],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            estimatedEarnings: { $sum: "$cut" },
          },
        },
      ]),
      Job.aggregate([
        { $match: completedMatch },
        {
          $group: {
            _id: "$jobType",
            count: { $sum: 1 },
            estimatedEarnings: {
              $sum: {
                $multiply: [
                  { $ifNull: ["$price", 0] },
                  {
                    $divide: [{ $ifNull: ["$businessCutPercent", 0] }, 100],
                  },
                ],
              },
            },
          },
        },
      ]),
    ]);

    const byJobType = {};
    for (const row of byJobTypeAgg) {
      if (!row._id) continue;
      byJobType[row._id] = {
        count: row.count,
        estimatedEarnings: Math.round((row.estimatedEarnings || 0) * 100) / 100,
      };
    }

    res.json({
      period,
      cutType: business.cutType || "revenue",
      cutPercent: business.cutPercent ?? 0,
      jobsCreated,
      jobsCompleted,
      jobsCancelled,
      jobsOpen,
      jobsInProgress,
      estimatedEarnings:
        Math.round((earningsAgg[0]?.estimatedEarnings || 0) * 100) / 100,
      byJobType,
    });
  } catch (err) {
    console.error("Business analytics error:", err);
    res.status(500).json({ message: "Failed to load analytics", error: err.message });
  }
}

module.exports = {
  login,
  me,
  createJob,
  listJobs,
  getJobById,
  dashboard,
  analytics,
  listVehicleMakes,
  listVehicleModelsByMake,
};
