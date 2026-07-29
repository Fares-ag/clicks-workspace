const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Technician, Job } = require("../../../clicks-shared/models");
const { OTPVerification, TechnicianEarnings } = require("../../../clicks-shared/models");
const multer = require("multer");
const fileUploadService = require("../services/fileUploadService");
const { addSASToTechnician } = require("../utils/sasHelper");
const { assertJobAccess } = require("../utils/ownership");
const {
  getWeeklyOnlineHoursSummary,
  setTechnicianStatus,
} = require("../../../clicks-shared/services/technicianOnlineHours");

// OTP send/verify
const { sendSMS } = require("../services/smsService");
const normalizePhone = (raw) => {
  let phone = String(raw || "").trim().replace(/[\s-]/g, "");
  if (phone && !phone.startsWith("+") && /^\d+$/.test(phone)) {
    phone = `+${phone}`;
  }
  return phone;
};

/**
 * Normalise a raw phone string to E.164, honouring Qatar's 8-digit local format.
 * "11111111" → "+97411111111"; "+97411111111" → "+97411111111"; "97411111111" → "+97411111111"
 */
const normalizePhoneE164 = (raw) => {
  const cleaned = String(raw || "").trim().replace(/[\s-]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) return `+974${digits}`;
  if (cleaned && !cleaned.startsWith("+") && /^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
};

/**
 * Build a Mongoose $or query that matches all plausible stored forms of a phone number.
 * Mirrors the multi-form lookup used in login() so password-reset and status checks
 * work regardless of how the number was originally stored.
 */
const buildPhoneQuery = (raw) => {
  const normalized = normalizePhoneE164(raw);
  const bare = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  const original = String(raw || "").trim();
  const forms = [...new Set([normalized, bare, original])].filter(Boolean);
  return { $or: forms.map((f) => ({ phone: f })) };
};

const login = async (req, res) => {
  try {
  const { phone, email, password } = req.body;
    let technician;
    if (phone) {
      const normalized = normalizePhone(phone);
      const bare = normalized.startsWith("+") ? normalized.slice(1) : normalized;
      technician = await Technician.findOne({
        $or: [
          { phone: normalized },
          { phone: bare },
          { phone: String(phone).trim() },
        ],
      });
    } else if (email) {
      technician = await Technician.findOne({ email });
    } else {
      return res.status(400).json({ error: "Phone or email required" });
    }
    if (!technician) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, technician.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ error: "Auth not configured" });
    }
    const token = jwt.sign(
      { id: technician._id, role: "technician" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      token,
      technician: {
        id: technician._id,
        phone: technician.phone,
        firstName: technician.firstName,
        lastName: technician.lastName,
        email: technician.email,
        profilePicture: technician.profilePicture,
        applicationStatus: technician.applicationStatus,
        rejectionReason: technician.rejectionReason || null
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
};

/** Percent change helper — returns 0 when there is no baseline. */
const pctChange = (current, previous) => {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(2));
};

/** Sunday 00:00 UTC of the week containing `date`. */
const startOfWeekSundayUtc = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
};

/** Build Sun–Sat daily earnings from paid/completed jobs this week. */
const buildDailyEarningsThisWeek = async (technicianId) => {
  const weekStart = startOfWeekSundayUtc();
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString(), amount: 0, dayIndex: i };
  });

  const jobs = await Job.find({
    assignedTechnician: technicianId,
    job_status: "completed",
    $or: [
      { paid_at: { $gte: weekStart, $lt: weekEnd } },
      { completed_at: { $gte: weekStart, $lt: weekEnd } },
    ],
  })
    .select("price paid_at completed_at payment_status")
    .lean();

  const msDay = 86400000;
  for (const job of jobs) {
    const t = job.paid_at || job.completed_at;
    if (!t) continue;
    const ts = new Date(t).getTime();
    if (ts < weekStart.getTime() || ts >= weekEnd.getTime()) continue;
    const idx = Math.floor((ts - weekStart.getTime()) / msDay);
    if (idx >= 0 && idx < 7) {
      days[idx].amount += Number(job.price) || 0;
    }
  }
  return days;
};

const getDashboard = async (req, res) => {
  try {
    const { id } = req.user;
    const technician = await Technician.findById(id);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    const earnings = await TechnicianEarnings.findOne({ technician_id: id });
    const techPerf = technician.performance || {};

    const now = new Date();
    const thisWeekStart = startOfWeekSundayUtc(now);
    const prevWeekStart = new Date(thisWeekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const techFilter = { assignedTechnician: id };

    const [
      completedJobs,
      cancelledJobs,
      rejectedJobs,
      weekCompleted,
      prevWeekCompleted,
      weekCancelled,
      prevWeekCancelled,
      weekRejected,
      prevWeekRejected,
      completedThisMonth,
      completedLastMonth,
      earningsAgg,
      weekEarningsAgg,
      earningsData,
    ] = await Promise.all([
      Job.countDocuments({ ...techFilter, job_status: "completed" }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        rejection_reasons: { $in: [null, []] },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        "rejection_reasons.0": { $exists: true },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "completed",
        completed_at: { $gte: thisWeekStart },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "completed",
        completed_at: { $gte: prevWeekStart, $lt: thisWeekStart },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        updatedAt: { $gte: thisWeekStart },
        rejection_reasons: { $in: [null, []] },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        updatedAt: { $gte: prevWeekStart, $lt: thisWeekStart },
        rejection_reasons: { $in: [null, []] },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        updatedAt: { $gte: thisWeekStart },
        "rejection_reasons.0": { $exists: true },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "cancelled",
        updatedAt: { $gte: prevWeekStart, $lt: thisWeekStart },
        "rejection_reasons.0": { $exists: true },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "completed",
        completed_at: { $gte: thisMonthStart },
      }),
      Job.countDocuments({
        ...techFilter,
        job_status: "completed",
        completed_at: { $gte: lastMonthStart, $lt: thisMonthStart },
      }),
      Job.aggregate([
        { $match: { ...techFilter, job_status: "completed" } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$price", 0] } } } },
      ]),
      Job.aggregate([
        {
          $match: {
            ...techFilter,
            job_status: "completed",
            completed_at: { $gte: thisWeekStart },
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$price", 0] } } } },
      ]),
      buildDailyEarningsThisWeek(id),
    ]);

    // Cancelled without rejection_reasons may still be cancels; simplify counts:
    // if rejection query is too strict, fall back to all cancelled for cancelledJobs
    const cancelledAll = await Job.countDocuments({
      ...techFilter,
      job_status: "cancelled",
    });
    const finalCancelled = Math.max(cancelledJobs, cancelledAll - rejectedJobs);
    const finalRejected = rejectedJobs;

    const totalEarnings =
      Number(earningsAgg[0]?.total) ||
      Number(earnings?.total_earned) ||
      Number(techPerf.totalEarnings) ||
      0;

    const onlineHours = await getWeeklyOnlineHoursSummary(id, technician);

    const performance = {
      ...techPerf,
      totalEarnings,
      cashBalance: Number(earnings?.cash_balance) || Number(techPerf.cashBalance) || 0,
      completedJobs,
      rejectedJobs: finalRejected,
      cancelledJobs: finalCancelled,
      weeklyCompletedJobs: weekCompleted,
      weeklyRejectedJobs: weekRejected,
      weeklyCancelledJobs: weekCancelled,
      weeklyOnlineHours: onlineHours.weeklyOnlineHours,
      weeklyOnlineHoursChangePct: onlineHours.weeklyOnlineHoursChangePct,
      completedJobsChangePct: pctChange(completedThisMonth, completedLastMonth),
      completedJobsTrendPct: pctChange(weekCompleted, prevWeekCompleted),
      rejectedJobsTrendPct: pctChange(weekRejected, prevWeekRejected),
      cancelledJobsTrendPct: pctChange(weekCancelled, prevWeekCancelled),
      weeklyEarningsTotal:
        Number(weekEarningsAgg[0]?.total) ||
        earningsData.reduce((s, d) => s + (Number(d.amount) || 0), 0),
      earningsData,
      homeHeroUrl: technician.homeHeroUrl || "",
    };

    res.json({ performance });
  } catch (err) {
    res.status(500).json({ error: "Dashboard fetch failed", details: err.message });
  }
};

// Per-tech in-memory throttle (avoids hammering Mongo on every 3s ping)
const _locationThrottleMs = Number(process.env.LOCATION_THROTTLE_MS || 3000);
const _lastLocationWrite = new Map(); // techId -> timestamp

const updateLocation = async (req, res) => {
  try {
    const technicianId = String(req.user.id);
    const { latitude, longitude, job_id } = req.body;

    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const now = Date.now();
    const last = _lastLocationWrite.get(technicianId) || 0;
    if (now - last < _locationThrottleMs) {
      return res.status(200).json({ ok: true, skipped: true });
    }
    _lastLocationWrite.set(technicianId, now);

    const lat = Number(latitude);
    const lng = Number(longitude);
    const lastLocationAt = new Date();

    await Technician.findByIdAndUpdate(technicianId, {
      "currentLocation.coordinates": [lng, lat],
      lastLocationAt,
    });

    console.log(`[REST] Technician ${technicianId} location updated: [${lat}, ${lng}]`);

    // Broadcast to admin Live Map (same event as socket path)
    const notifyLocation = req.app.get("notifyAdminTechnicianLocation");
    if (typeof notifyLocation === "function") {
      notifyLocation(technicianId, lat, lng, lastLocationAt);
    }

    // Relay to customer if job_id provided
    if (job_id) {
      const notifyCustomer = req.app.get("notifyCustomerJobEvent");
      if (typeof notifyCustomer === "function") {
        notifyCustomer(job_id, "locationUpdate", { latitude: lat, longitude: lng, timestamp: lastLocationAt });
      }
    }

    res.json({ ok: true, lastLocationAt });
  } catch (err) {
    res.status(500).json({ error: "Location update failed", details: err.message });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const { id } = req.user; // Get technician ID from JWT token
    const { status } = req.body; // "Online" or "Offline"
    if (!["Online", "Offline"].includes(status)) {
      return res.status(400).json({ error: "Status must be Online or Offline" });
    }
    const technician = await setTechnicianStatus(id, status);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
    if (typeof notifyPresence === "function") {
      await notifyPresence(technician._id, status);
    }

    res.json({ message: "Status updated", currentStatus: technician.currentStatus });
  } catch (err) {
    res.status(500).json({ error: "Status update failed", details: err.message });
  }
};

const getJobs = async (req, res) => {
  try {
    const { id } = req.user; // Assume user is set by auth middleware
    const { from, to } = req.query;
    const filter = {
      $or: [{ assignedTechnician: id }, { created_by_technician: id }],
    };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    const jobs = await Job.find(filter)
      .populate({
        path: "customer_vehicle_id",
        select: "year plate_number vehicle_color",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
          { path: "vehicle_type", select: "typeName" },
        ],
      })
      .sort({ createdAt: -1 });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: "Fetch jobs failed", details: err.message });
  }
};

const acceptJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id)
      .populate('assignedTechnician', 'firstName lastName phone profilePicture currentLocation')
      .populate('customer_id', 'first_name last_name phone_number');
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Job must be in "assigned" status to be accepted
    if (job.job_status !== "assigned") {
      return res.status(400).json({ error: `Cannot accept job with status: ${job.job_status}` });
    }
    
    // Change status from "assigned" to "accepted"
    job.job_status = "accepted";
    job.accepted_at = new Date();
    await job.save();

    // Update technician status to "On Job"
    await setTechnicianStatus(job.assignedTechnician._id, "On Job");

    const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
    if (typeof notifyPresence === "function") {
      await notifyPresence(job.assignedTechnician._id, "On Job");
    }
    
    // Notify customer via Socket.IO that technician accepted
    const notifyCustomer = req.app.get('notifyCustomerTechnicianAccepted');
    if (notifyCustomer && job.customer_id) {
      try {
        await notifyCustomer(job.customer_id._id.toString(), {
          job_id: job._id,
          status: "accepted",
          technician: {
            id: job.assignedTechnician._id,
            name: `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`,
            phone: job.assignedTechnician.phone,
            photo: job.assignedTechnician.profilePicture
          },
          accepted_at: job.accepted_at
        });
      } catch (notifyError) {
        console.error('Failed to notify customer:', notifyError.message);
      }
    }
    
    res.json({ 
      message: "Job accepted", 
      job_status: job.job_status,
      accepted_at: job.accepted_at
    });
  } catch (err) {
    res.status(500).json({ error: "Accept job failed", details: err.message });
  }
};

const rejectJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reasons, rejection_description } = req.body;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    // P0-03: ensure only the assigned technician can reject
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Only assigned jobs can be rejected (before acceptance)
    if (job.job_status !== "assigned") {
      return res.status(400).json({
        error: `Cannot reject job with status: ${job.job_status}`,
      });
    }
    job.job_status = "cancelled";
    job.rejection_reasons = Array.isArray(rejection_reasons)
      ? rejection_reasons
      : rejection_reasons
      ? [rejection_reasons]
      : [];
    job.rejection_description = rejection_description || "";
    await job.save();

    // P1-01: increment rejected-jobs counter in TechnicianEarnings (source of truth)
    await TechnicianEarnings.findOneAndUpdate(
      { technician_id: job.assignedTechnician },
      {
        $inc: { "performance.total_rejected_jobs": 1 },
        $set: { updated_at: new Date() },
      },
      { upsert: true }
    );

    // P1-02: reset technician status to Online and keep Technician.performance in sync
    const technician = await Technician.findById(job.assignedTechnician);
    if (technician) {
      if (!technician.performance) technician.performance = {};
      technician.performance.rejectedJobs =
        (technician.performance.rejectedJobs || 0) + 1;
      await setTechnicianStatus(technician, "Online");
    }

    // P2-04: notify customer that the technician rejected the job
    if (job.customer_id) {
      try {
        const notify = req.app.get("notifyCustomerJobEvent");
        if (typeof notify === "function") {
          await notify(job.customer_id.toString(), "jobRejected", {
            job_id: job._id,
            status: "cancelled",
            reason: rejection_description || "Technician unavailable",
          });
        }
      } catch (notifyErr) {
        console.error("Failed to notify customer of rejection:", notifyErr.message);
      }
    }

    res.json({ message: "Job rejected", job_status: job.job_status });
  } catch (err) {
    res.status(500).json({ error: "Reject job failed", details: err.message });
  }
};



const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OTPVerification.create({ phone, otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendSMS(phone, `Your OTP is: ${otp}`);
    res.json({ message: "OTP sent", phone });
  } catch (err) {
    res.status(500).json({ error: "OTP send failed", details: err.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const record = await OTPVerification.findOne({ phone, otp });
    if (!record || record.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }
    await OTPVerification.deleteMany({ phone });
    res.json({ message: "OTP verified", phone });
  } catch (err) {
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
};


const registerTechnician = async (req, res) => {
  try {
    const { phone, email, firstName, lastName, password } = req.body;
    const files = req.files || {};

    // Upload each file to GCS and get public URLs
    let profilePictureUrl = "";
    let drivingLicenseFrontUrl = "";
    let drivingLicenseBackUrl = "";
    let workPermitFrontUrl = "";
    let workPermitBackUrl = "";

    if (files.profilePicture && files.profilePicture[0]) {
      const filename = `technician-profile/${Date.now()}_${files.profilePicture[0].originalname}`;
      profilePictureUrl = await fileUploadService.uploadFile(files.profilePicture[0], filename);
    }
    if (files.licenseFront && files.licenseFront[0]) {
      const filename = `technician-license-front/${Date.now()}_${files.licenseFront[0].originalname}`;
      drivingLicenseFrontUrl = await fileUploadService.uploadFile(files.licenseFront[0], filename);
    }
    if (files.licenseBack && files.licenseBack[0]) {
      const filename = `technician-license-back/${Date.now()}_${files.licenseBack[0].originalname}`;
      drivingLicenseBackUrl = await fileUploadService.uploadFile(files.licenseBack[0], filename);
    }
    if (files.permitFront && files.permitFront[0]) {
      const filename = `technician-permit-front/${Date.now()}_${files.permitFront[0].originalname}`;
      workPermitFrontUrl = await fileUploadService.uploadFile(files.permitFront[0], filename);
    }
    if (files.permitBack && files.permitBack[0]) {
      const filename = `technician-permit-back/${Date.now()}_${files.permitBack[0].originalname}`;
      workPermitBackUrl = await fileUploadService.uploadFile(files.permitBack[0], filename);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const technician = new Technician({
      phone,
      email,
      firstName,
      lastName,
      password: hashedPassword,
      profilePicture: profilePictureUrl,
      drivingLicenseFront: drivingLicenseFrontUrl,
      drivingLicenseBack: drivingLicenseBackUrl,
      workPermitFront: workPermitFrontUrl,
      workPermitBack: workPermitBackUrl,
      applicationStatus: "Pending",
      currentStatus: "Offline"
    });

    await technician.save();
    res.json({ message: "Technician registration successful", technicianId: technician._id });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
};

// Application status
const getApplicationStatus = async (req, res) => {
  try {
    const { phone } = req.query;
    const technician = await Technician.findOne(buildPhoneQuery(phone));
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    res.json({
      status: technician.applicationStatus,
      phone: technician.phone,
      email: technician.email,
      firstName: technician.firstName,
      lastName: technician.lastName,
      rejectionReason: technician.rejectionReason || "",
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch application status failed", details: err.message });
  }
};

// Forgot Password - Send OTP to phone number
const forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    // Check if technician exists (try all stored forms of the phone number)
    const technician = await Technician.findOne(buildPhoneQuery(phone));
    if (!technician) {
      return res.status(404).json({ error: "No account found with this phone number" });
    }
    // Use the stored phone value from this point on so OTP records match correctly
    const storedPhone = technician.phone;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    // Delete any existing OTPs for this phone
    await OTPVerification.deleteMany({ phone: storedPhone, purpose: "password_reset" });
    
    // Save new OTP — key by the canonical stored phone so verifyResetOTP can find it
    await OTPVerification.create({
      phone: storedPhone,
      otp,
      expiresAt,
      purpose: "password_reset"
    });
    
    // Send OTP via SMS
    await sendSMS(storedPhone, `Your Clicks technician password reset OTP is: ${otp}. Valid for 10 minutes.`);
    
    res.json({ 
      message: "OTP sent successfully",
      phone: storedPhone.replace(/.(?=.{4})/g, '*') // Mask phone number
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
};

// Verify OTP for password reset
const verifyResetOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone number and OTP are required" });
    }

    // Normalise so the lookup matches the canonical phone stored in the OTP record
    const normalizedPhone = normalizePhoneE164(phone);
    
    // Find valid OTP — try normalized first, then raw as fallback
    const otpRecord = await OTPVerification.findOne({
      phone: { $in: [normalizedPhone, String(phone).trim()] },
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
    const { phone, otp, new_password, confirm_password } = req.body;
    
    if (!phone || !otp || !new_password || !confirm_password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    
    if (new_password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }
    
    // Normalise so lookups match the canonical phone used when creating the OTP
    const normalizedPhone = normalizePhoneE164(phone);

    // Verify OTP is valid and verified
    const otpRecord = await OTPVerification.findOne({
      phone: { $in: [normalizedPhone, String(phone).trim()] },
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
    
    // Find technician using multi-form lookup
    const technician = await Technician.findOne(buildPhoneQuery(phone));
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    
    // Hash and update password
    technician.password = await bcrypt.hash(new_password, 10);
    await technician.save();
    
    // Delete used OTP (clean up all forms)
    await OTPVerification.deleteMany({
      phone: { $in: [normalizedPhone, String(phone).trim()] },
      purpose: "password_reset"
    });
    
    res.json({ message: "Password reset successfully. You can now login with your new password." });
  } catch (err) {
    res.status(500).json({ error: "Password reset failed", details: err.message });
  }
};

// Get technician profile
const getProfile = async (req, res) => {
  try {
    const { id } = req.user; // From auth middleware
    const technician = await Technician.findById(id).select('firstName lastName email phone profilePicture');
    
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    
    // Add SAS token to profile picture if needed
    const technicianWithSAS = addSASToTechnician(technician);
    
    res.json({
      firstName: technicianWithSAS.firstName,
      lastName: technicianWithSAS.lastName,
      email: technicianWithSAS.email,
      phone: technicianWithSAS.phone,
      profilePicture: technicianWithSAS.profilePicture
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile", details: err.message });
  }
};

// Update technician profile
const updateProfile = async (req, res) => {
  try {
    const { id } = req.user; // From auth middleware
    const { firstName, lastName, email, phone } = req.body;
    
    // Check if email is being changed and if it's already taken
    if (email) {
      const existingTechnician = await Technician.findOne({ email, _id: { $ne: id } });
      if (existingTechnician) {
        return res.status(409).json({ error: "Email already in use by another technician" });
      }
    }
    
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    
    const technician = await Technician.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('firstName lastName email phone profilePicture');
    
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    
    const technicianWithSAS = addSASToTechnician(technician);
    
    res.json({
      message: "Profile updated successfully",
      technician: {
        firstName: technicianWithSAS.firstName,
        lastName: technicianWithSAS.lastName,
        email: technicianWithSAS.email,
        phone: technicianWithSAS.phone,
        profilePicture: technicianWithSAS.profilePicture
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile", details: err.message });
  }
};

const saveFcmToken = async (req, res) => {
  try {
    const { fcm_token } = req.body || {};
    if (!fcm_token || typeof fcm_token !== "string") {
      return res.status(400).json({ error: "fcm_token is required" });
    }
    await Technician.findByIdAndUpdate(req.user.id, { fcm_token: fcm_token.trim() });
    res.json({ message: "FCM token saved" });
  } catch (err) {
    res.status(500).json({ error: "Save FCM token failed", details: err.message });
  }
};

const clearFcmToken = async (req, res) => {
  try {
    await Technician.findByIdAndUpdate(req.user.id, { fcm_token: null });
    res.json({ message: "FCM token cleared" });
  } catch (err) {
    res.status(500).json({ error: "Clear FCM token failed", details: err.message });
  }
};

/** Soft-delete / deactivate technician account (Figma Acc delete). */
const deleteAccount = async (req, res) => {
  try {
    const { id } = req.user;
    const technician = await Technician.findById(id);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    await setTechnicianStatus(technician, "Offline");
    technician.isActive = false;
    technician.fcm_token = null;
    if (technician.email && !String(technician.email).includes("+deleted")) {
      technician.email = `deleted+${Date.now()}+${technician.email}`;
    }
    await technician.save();
    res.json({ message: "Account deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Account deletion failed", details: err.message });
  }
};

// Get assigned vehicle details
const getVehicle = async (req, res) => {
  try {
    const { id } = req.user; // From auth middleware
    const technician = await Technician.findById(id)
      .select('assignedVehicle')
      .populate({
        path: 'assignedVehicle',
        select: 'vehicleImage make model year plateNumber vinNumber color',
        populate: [
          { path: 'make', select: 'makeName' },
          { path: 'model', select: 'modelName' }
        ]
      });
    
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    
    if (!technician.assignedVehicle) {
      return res.status(404).json({ error: "No vehicle assigned to this technician" });
    }
    
    const vehicle = technician.assignedVehicle;
    
    res.json({
      vehicle: {
        vehicleImage: vehicle.vehicleImage,
        name: `${vehicle.make?.makeName || ''} ${vehicle.model?.modelName || ''}`.trim(),
        year: vehicle.year,
        plateNumber: vehicle.plateNumber,
        vinNumber: vehicle.vinNumber,
        color: vehicle.color
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch vehicle", details: err.message });
  }
};

const DEFAULT_COUNTRY_CODE = "+974";
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

async function resolveTechnicianAppSource() {
  const Source = require("../../../clicks-shared/models/Source");
  let source = await Source.findOne({ mainSourceName: "Technician App" });
  if (!source) {
    source = await Source.create({
      mainSourceName: "Technician App",
      isActive: true,
      subSources: [{ name: "Mobile App" }],
    });
  }
  return source;
}

/** Technician creates a pending intake job (admin dispatches), stamped with creator. */
const createTechnicianJob = async (req, res) => {
  try {
    const techId = req.user.id;
    const technician = await Technician.findById(techId);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

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
    } = req.body;

    if (!clientName || !clientMobileNumber || !location || !dateTime || !jobType || price == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!issue || !String(issue).trim()) {
      return res.status(400).json({ error: "Issue description is mandatory" });
    }
    if (!vehicleMake || !vehicleModel) {
      return res.status(400).json({ error: "Vehicle make and model are required" });
    }

    const cc = countryCode || DEFAULT_COUNTRY_CODE;
    const local = toLocalDigits(clientMobileNumber, cc);
    if (!isValidLocalPhone(local)) {
      return res.status(400).json({
        error: "Phone number must be exactly 8 digits (without country code)",
      });
    }

    const allowedTypes = ["Tires", "Engines", "Gearbox"];
    if (!allowedTypes.includes(jobType)) {
      return res.status(400).json({ error: "Invalid jobType" });
    }

    const source = await resolveTechnicianAppSource();
    const techName = `${technician.firstName || ""} ${technician.lastName || ""}`.trim();

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
      assignedTechnician: null,
      job_status: "pending",
      payment_status: "unpaid",
      created_by_technician: technician._id,
      createdByTechnicianName: techName,
    });

    const populated = await Job.findById(job._id)
      .populate("source", "mainSourceName")
      .lean();

    try {
      const notifyAdminTechnicianJob = req.app.get("notifyAdminTechnicianJob");
      if (typeof notifyAdminTechnicianJob === "function") {
        notifyAdminTechnicianJob({
          job_id: job._id.toString(),
          created_by_technician: technician._id.toString(),
          createdByTechnicianName: techName,
          clientName: job.clientName,
          clientMobileNumber: job.clientMobileNumber,
          clientEmail: job.clientEmail || "",
          vehicle: {
            make: job.vehicleMake || "Unknown",
            model: job.vehicleModel || "Unknown",
            year: job.vehicleYear || "—",
            plate: job.licensePlate || "—",
          },
          location: { address: job.location || "" },
          issue: job.issue || "",
          jobType: job.jobType || "",
          price: job.price,
          dateTime: job.dateTime,
          status: "pending",
        });
      }
    } catch (notifyErr) {
      console.error("Failed to notify admins of technician job:", notifyErr.message);
    }

    res.status(201).json({ message: "Job created", job: populated });
  } catch (err) {
    res.status(500).json({ error: "Failed to create job", details: err.message });
  }
};

const uploadHomeHero = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "homeHero file is required" });
    }
    const filename = `technicians/${req.user.id}/home-hero-${Date.now()}-${req.file.originalname}`;
    const url = await fileUploadService.uploadFile(req.file, filename);
    const technician = await Technician.findByIdAndUpdate(
      req.user.id,
      { homeHeroUrl: url },
      { new: true }
    ).select("-password");
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }
    const withSas = addSASToTechnician(technician.toObject());
    res.json({
      message: "Home hero updated",
      homeHeroUrl: withSas.homeHeroUrl || url,
      technician: withSas,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload home hero", details: err.message });
  }
};

const createTechnicianSubscription = async (req, res) => {
  try {
    const Subscription = require("../../../clicks-shared/models/Subscription");
    const techId = req.user.id;
    const technician = await Technician.findById(techId);
    if (!technician) {
      return res.status(404).json({ error: "Technician not found" });
    }

    const {
      clientName,
      phone,
      plateNumber,
      vinNumber,
      planName,
      durationMonths,
      price,
      startDate,
    } = req.body;

    if (!clientName || !phone || !plateNumber || !planName || !durationMonths || price == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + Number(durationMonths));
    const techName = `${technician.firstName || ""} ${technician.lastName || ""}`.trim();

    const subscription = await Subscription.create({
      clientName: String(clientName).trim(),
      phone: String(phone).trim(),
      plateNumber: String(plateNumber).trim().toUpperCase(),
      vinNumber: vinNumber ? String(vinNumber).trim() : "",
      planName: String(planName).trim(),
      durationMonths: Number(durationMonths),
      price: Number(price),
      startDate: start,
      endDate: end,
      status: "active",
      created_by_technician: technician._id,
      createdByTechnicianName: techName,
    });

    const obj = subscription.toObject();
    obj.status = subscription.resolveStatus();
    res.status(201).json({ message: "Subscription created", subscription: obj });
  } catch (err) {
    res.status(500).json({ error: "Failed to create subscription", details: err.message });
  }
};

module.exports = {
  login,
  getDashboard,
  toggleStatus,
  getJobs,
  createTechnicianJob,
  acceptJob,
  rejectJob,
  sendOTP,
  verifyOTP,
  registerTechnician,
  getApplicationStatus,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  getProfile,
  updateProfile,
  deleteAccount,
  getVehicle,
  updateLocation,
  uploadHomeHero,
  createTechnicianSubscription,
  saveFcmToken,
  clearFcmToken,
};
