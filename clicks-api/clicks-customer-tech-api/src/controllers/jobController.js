const {
  Job,
  SOSRequest,
  ServiceRequest,
  Technician,
} = require("../../../clicks-shared/models");
const { assertJobAccess, sameId } = require("../utils/ownership");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const {
  parseJobLocation,
  parseJobLocationToGeoPoint,
} = require("../../../clicks-shared/utils/parseJobLocation");
const { distanceBetween } = require("../../../clicks-shared/utils/geoDistance");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");

const JOB_STATUS_PRIORITY = {
  in_progress: 0,
  arrived: 1,
  en_route: 2,
  accepted: 3,
  assigned: 4,
  completed: 5,
};

const jobPopulateForTech = [
  { path: "customer_id", select: "first_name last_name phone_number email" },
  {
    path: "customer_vehicle_id",
    select: "year plate_number vehicle_color",
    populate: [
      { path: "vehicle_make", select: "makeName" },
      { path: "vehicle_model", select: "modelName" },
      { path: "vehicle_type", select: "typeName" },
    ],
  },
  { path: "source" },
];

function resolveJobLatLng(job) {
  const coords = job?.locationCoordinates?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
  }
  return parseJobLocation(job?.location);
}

function resolveTechLatLng(body, technician) {
  const lat = Number(body?.latitude ?? body?.lat);
  const lng = Number(body?.longitude ?? body?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  const coords = technician?.currentLocation?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const tLng = Number(coords[0]);
    const tLat = Number(coords[1]);
    if (
      Number.isFinite(tLat) &&
      Number.isFinite(tLng) &&
      !(tLat === 0 && tLng === 0)
    ) {
      return { lat: tLat, lng: tLng };
    }
  }
  return null;
}

function technicianTrackingPayload(tech) {
  if (!tech) return undefined;
  const payload = {
    name: `${tech.firstName || ""} ${tech.lastName || ""}`.trim(),
    phone: tech.phone,
    photo: tech.profilePicture,
  };
  const coords = tech.currentLocation?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      payload.latitude = lat;
      payload.longitude = lng;
    }
  }
  return payload;
}

function sortActiveJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const pa = JOB_STATUS_PRIORITY[a.job_status] ?? 99;
    const pb = JOB_STATUS_PRIORITY[b.job_status] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}

const createJob = async (req, res) => {
  try {
    const { 
      clientName, 
      clientMobileNumber, 
      issue, 
      location, 
      dateTime, 
      jobType,
      assignedTechnician, 
      price, 
      source,
      sos_id // NEW: Accept sos_id for SOS-created jobs
    } = req.body;
    
    if (!clientName || !clientMobileNumber || !issue || !location || !dateTime || !jobType || !assignedTechnician || !price) {
      return res.status(400).json({ error: "All required fields must be provided" });
    }

    const locationCoordinates = parseJobLocationToGeoPoint(location);
    
    const job = new Job({
      clientName,
      clientMobileNumber,
      issue,
      location,
      ...(locationCoordinates ? { locationCoordinates } : {}),
      dateTime,
      jobType,
      assignedTechnician,
      price,
      source: source || null,
      job_status: "assigned",
      customer_id: req.user?.id,
      sos_request_id: sos_id || null // NEW: Link to SOS if provided
    });
    
    await job.save();
    
    // NEW: If job is created from SOS, update SOS status and notify technician
    if (sos_id) {
      await SOSRequest.findByIdAndUpdate(sos_id, {
        status: "accepted",
        assigned_technician: assignedTechnician,
        accepted_at: new Date(),
        job_id: job._id
      });

      // Update technician status
      await setTechnicianStatus(assignedTechnician, "On Job");

      const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
      if (typeof notifyPresence === "function") {
        await notifyPresence(assignedTechnician, "On Job");
      }

      // Notify assigned technician via socket
      const notifyFunction = req.app.get('notifyAssignedTechnician');
      if (notifyFunction) {
        await notifyFunction(job._id);
      }
    }
    
    res.status(201).json({ message: "Job created successfully", job });
  } catch (err) {
    res.status(500).json({ error: "Create job failed", details: err.message });
  }
};

const getJobs = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "customer") {
      filter = { customer_id: req.user.id };
    } else if (req.user.role === "technician") {
      filter = { assignedTechnician: req.user.id };
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }
    const jobs = await Job.find(filter);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: "Fetch jobs failed", details: err.message });
  }
};

// Customer job history (filtered)
const getCustomerJobs = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const { status } = req.query;
    const filter = { customer_id };
    if (status) filter.job_status = status;
    const jobs = await Job.find(filter).sort({ dateTime: -1 });
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: "Fetch customer jobs failed", details: err.message });
  }
};

const updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { job_status } = req.body;
    const job = await Job.findById(id).populate(
      "assignedTechnician",
      "firstName lastName phone profilePicture currentLocation"
    );
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (req.user.role === "technician" && job_status !== "en_route") {
      return res.status(400).json({
        error: "Technicians may only update job status to en_route",
      });
    }
    if (job_status === "en_route" && job.job_status !== "accepted") {
      return res.status(400).json({
        error: `Cannot start en route from status: ${job.job_status}`,
      });
    }
    job.job_status = job_status;
    if (job_status === "en_route") job.en_route_at = new Date();
    await job.save();

    if (job_status === "en_route" && job.customer_id) {
      const notify = req.app.get("notifyCustomerJobEvent");
      if (typeof notify === "function") {
        await notify(job.customer_id.toString(), "technicianEnRoute", {
          job_id: job._id,
          status: "en_route",
          en_route_at: job.en_route_at,
          technician: technicianTrackingPayload(job.assignedTechnician),
        });
      }
    }

    res.json({ message: "Job status updated", job_status: job.job_status });
  } catch (err) {
    res.status(500).json({ error: "Update job status failed", details: err.message });
  }
};

const rateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, rating_description } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: "Rating is required and must be between 1 and 5" 
      });
    }
    
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    // Verify job is completed
    if (job.job_status !== "completed") {
      return res.status(400).json({ 
        error: "Can only rate completed jobs" 
      });
    }
    
    // Update rating and description
    job.rating = rating;
    job.rating_description = rating_description || "";
    await job.save();
    
    res.json({ 
      message: "Job rated successfully", 
      rating: job.rating,
      rating_description: job.rating_description
    });
  } catch (err) {
    res.status(500).json({ error: "Rate job failed", details: err.message });
  }
};

const getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: "Fetch job failed", details: err.message });
  }
};

const { RepairProcedure, Receipt } = require("../../../clicks-shared/models");

const markArrived = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.job_status !== "en_route") {
      return res.status(400).json({
        error: `Cannot mark arrived from status: ${job.job_status}`,
      });
    }
    job.job_status = "arrived";
    job.arrived_at = new Date();
    await job.save();

    if (job.customer_id) {
      const notify = req.app.get("notifyCustomerJobEvent");
      if (typeof notify === "function") {
        await notify(job.customer_id.toString(), "technicianArrived", {
          job_id: job._id,
          status: "arrived",
          arrived_at: job.arrived_at,
        });
      }
    }

    res.json({ message: "Technician arrived", job_status: job.job_status });
  } catch (err) {
    res.status(500).json({ error: "Mark arrived failed", details: err.message });
  }
};

const startJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.job_status !== "arrived") {
      return res.status(400).json({
        error: `Cannot start job from status: ${job.job_status}`,
      });
    }

    const otherInProgress = await Job.findOne({
      assignedTechnician: req.user.id,
      job_status: "in_progress",
      _id: { $ne: job._id },
    }).select("_id");
    if (otherInProgress) {
      return res.status(400).json({
        error:
          "Finish your current in-progress job before starting another",
        blocking_job_id: otherInProgress._id,
      });
    }

    // Self-created jobs skip GPS proximity (creator === assignee).
    const isOwnJob = sameId(job.created_by_technician, job.assignedTechnician);
    let distanceMeters = null;

    if (!isOwnJob) {
      const maxMeters = Number(process.env.JOB_START_MAX_METERS || 200);
      const jobPoint = resolveJobLatLng(job);
      if (!jobPoint) {
        return res.status(400).json({
          error: "Job location coordinates are missing; cannot verify proximity",
        });
      }

      const technician = await Technician.findById(req.user.id).select(
        "currentLocation"
      );
      const techPoint = resolveTechLatLng(req.body || {}, technician);
      if (!techPoint) {
        return res.status(400).json({
          error: "Technician location is required to start the job",
        });
      }

      distanceMeters = Math.round(distanceBetween(techPoint, jobPoint));
      if (distanceMeters > maxMeters) {
        return res.status(400).json({
          error: `You must be within ${maxMeters}m of the job location to start`,
          distanceMeters,
          maxMeters,
        });
      }
    }

    job.job_status = "in_progress";
    job.started_at = new Date();
    await job.save();

    if (job.customer_id) {
      const notify = req.app.get("notifyCustomerJobEvent");
      if (typeof notify === "function") {
        await notify(job.customer_id.toString(), "jobStarted", {
          job_id: job._id,
          status: "in_progress",
          started_at: job.started_at,
          issue: job.issue || "",
        });
      }
    }

    res.json({
      message: "Job started",
      job_status: job.job_status,
      ...(distanceMeters != null ? { distanceMeters } : { gpsSkipped: true }),
    });
  } catch (err) {
    res.status(500).json({ error: "Start job failed", details: err.message });
  }
};

const addRepairProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const {
      description,
      quantity,
      price,
      receipt_image_url,
      name,
      notes,
      cost,
    } = req.body;
    const repair = new RepairProcedure({
      job_id: id,
      technician_id: req.user.id,
      description,
      quantity,
      price,
      name: name != null ? String(name).trim() : "",
      notes: notes != null ? String(notes).trim() : "",
      cost: cost != null && cost !== "" ? Number(cost) : 0,
      receipt_image_url,
    });
    await repair.save();
    res.json({ message: "Repair procedure added", repair });
  } catch (err) {
    res.status(500).json({ error: "Add repair procedure failed", details: err.message });
  }
};

const calculateTotal = async (req, res) => {
  try {
    const { id } = req.params;
    const repairs = await RepairProcedure.find({ job_id: id });
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(computeJobPricing(job, repairs));
  } catch (err) {
    res.status(500).json({ error: "Calculate total failed", details: err.message });
  }
};

// Proximity-based technician matching (2dsphere)
const findNearbyTechnicians = async (req, res) => {
  try {
    const { lat, lng, longitude, latitude, maxDistanceKm = 25 } = req.query;
    const latN = Number(latitude ?? lat);
    const lngN = Number(longitude ?? lng);
    const TechnicianModel = require("../../../clicks-shared/models/Technician");

    if (Number.isFinite(latN) && Number.isFinite(lngN)) {
      const maxMeters = Number(maxDistanceKm) * 1000;
      const technicians = await TechnicianModel.find({
        isActive: true,
        currentStatus: "Online",
        currentLocation: {
          $near: {
            $geometry: { type: "Point", coordinates: [lngN, latN] },
            $maxDistance: maxMeters,
          },
        },
      }).select(
        "firstName lastName phone profilePicture currentStatus currentLocation expertise"
      );
      return res.json({ technicians });
    }

    // Fallback when no coords provided
    const technicians = await TechnicianModel.find({
      isActive: true,
      currentStatus: "Online",
    }).select(
      "firstName lastName phone profilePicture currentStatus currentLocation expertise"
    );
    res.json({ technicians });
  } catch (err) {
    res.status(500).json({ error: "Find nearby technicians failed", details: err.message });
  }
};


const markCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Idempotency guard — second call must not re-credit earnings
    if (job.job_status === "completed") {
      return res.json({ message: "Job already completed", job_status: "completed" });
    }
    // Only allow completion from in_progress
    if (job.job_status !== "in_progress") {
      return res.status(400).json({
        error: `Cannot complete job with status: ${job.job_status}`,
      });
    }
    if (!job.customerSignatureUrl || !job.customerSignedAt) {
      return res.status(400).json({
        error: "Customer signature is required before completing the job",
      });
    }
    const notes = req.body?.completion_notes ?? req.body?.notes;
    if (typeof notes === "string" && notes.trim()) {
      job.completion_notes = notes.trim().slice(0, 2000);
    }
    const photos = req.body?.completion_photos;
    if (Array.isArray(photos)) {
      job.completion_photos = photos
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => p.trim().slice(0, 500))
        .slice(0, 10);
    }
    job.job_status = "completed";
    job.completed_at = job.completed_at || new Date();
    await job.save();

    try {
      const { accruePartnerFromCompletedJob } = require("../../../clicks-shared/services/partnerService");
      const populated = await Job.findById(job._id).populate("source", "mainSourceName");
      await accruePartnerFromCompletedJob(populated);
    } catch (partnerErr) {
      console.error("Partner accrual failed:", partnerErr.message);
    }

    // TechnicianEarnings is source of truth for money
    if (job.assignedTechnician) {
      const TechnicianEarnings = require("../../../clicks-shared/models/TechnicianEarnings");
      const amount = job.price || 0;

      // Aggregate totals
      await TechnicianEarnings.findOneAndUpdate(
        { technician_id: job.assignedTechnician },
        {
          $inc: {
            total_earned: amount,
            cash_balance: amount,
            "performance.total_completed_jobs": 1,
          },
          $set: { updated_at: new Date() },
        },
        { upsert: true, new: true }
      );

      // Weekly earnings bucket — ISO week (Monday 00:00 UTC → Sunday 23:59 UTC)
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0=Sun … 6=Sat
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday)
      );
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);

      // Try to increment an existing bucket for this week
      const bucketUpdate = await TechnicianEarnings.updateOne(
        {
          technician_id: job.assignedTechnician,
          "weekly_earnings.week_start": weekStart,
        },
        {
          $inc: {
            "weekly_earnings.$.amount": amount,
            "weekly_earnings.$.jobs_completed": 1,
          },
        }
      );

      // No existing bucket — push a new one
      if (bucketUpdate.modifiedCount === 0) {
        await TechnicianEarnings.updateOne(
          { technician_id: job.assignedTechnician },
          {
            $push: {
              weekly_earnings: {
                week_start: weekStart,
                week_end: weekEnd,
                amount,
                jobs_completed: 1,
                jobs_rejected: 0,
                jobs_cancelled: 0,
                hours_online: 0,
              },
            },
          },
          { upsert: true }
        );
      }

      // Keep non-money counters on Technician.performance in sync
      const technician = await Technician.findById(job.assignedTechnician);
      if (technician) {
        if (!technician.performance) technician.performance = {};
        technician.performance.completedJobs =
          (technician.performance.completedJobs || 0) + 1;
        await technician.save();
      }
    }

    res.json({ message: "Job marked as completed", job_status: job.job_status });
  } catch (err) {
    res.status(500).json({ error: "Mark completed failed", details: err.message });
  }
};

/** Technician cancels an assigned job after arrival / mid-fulfill. */
const cancelJobByTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    const reason =
      (typeof req.body?.reason === "string" && req.body.reason.trim()) ||
      (typeof req.body?.cancellation_reason === "string" &&
        req.body.cancellation_reason.trim()) ||
      "Cancelled by technician";
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const cancellable = [
      "accepted",
      "en_route",
      "arrived",
      "in_progress",
    ];
    if (!cancellable.includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot cancel job in status ${job.job_status}`,
      });
    }
    job.job_status = "cancelled";
    job.rejection_description = reason.slice(0, 500);
    if (!Array.isArray(job.rejection_reasons)) job.rejection_reasons = [];
    job.rejection_reasons.push(reason.slice(0, 200));
    await job.save();

    if (job.assignedTechnician) {
      const TechnicianEarnings = require("../../../clicks-shared/models/TechnicianEarnings");
      await TechnicianEarnings.findOneAndUpdate(
        { technician_id: job.assignedTechnician },
        {
          $inc: { "performance.total_cancelled_jobs": 1 },
          $set: { updated_at: new Date() },
        },
        { upsert: true }
      );
      const technician = await Technician.findById(job.assignedTechnician);
      if (technician) {
        if (!technician.performance) technician.performance = {};
        technician.performance.cancelledJobs =
          (technician.performance.cancelledJobs || 0) + 1;
        await technician.save();
      }

      await setTechnicianStatus(job.assignedTechnician, "Online");
      const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
      if (typeof notifyPresence === "function") {
        await notifyPresence(job.assignedTechnician, "Online");
      }
    }

    // P2-05: notify customer that the technician cancelled
    if (job.customer_id) {
      try {
        const notify = req.app.get("notifyCustomerJobEvent");
        if (typeof notify === "function") {
          await notify(job.customer_id.toString(), "jobCancelled", {
            job_id: job._id,
            status: "cancelled",
            reason,
          });
        }
      } catch (notifyErr) {
        console.error("Failed to notify customer of cancellation:", notifyErr.message);
      }
    }

    res.json({
      message: "Job cancelled",
      job_status: job.job_status,
      reason,
    });
  } catch (err) {
    res.status(500).json({ error: "Cancel job failed", details: err.message });
  }
};

const confirmPayment = async (req, res) => {
  const notifyTechnicianOnline = async (job) => {
    if (!job?.assignedTechnician) return;
    await setTechnicianStatus(job.assignedTechnician, "Online");
    const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
    if (typeof notifyPresence === "function") {
      await notifyPresence(job.assignedTechnician, "Online");
    }
  };

  try {
    const { id } = req.params;
    const { payment_method, notes } = req.body || {};
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // P2-02: payment can only be collected on a completed job
    if (job.job_status !== "completed") {
      return res.status(400).json({
        error: `Cannot collect payment for job with status: ${job.job_status}. Job must be completed first.`,
      });
    }
    // Idempotency — already paid
    if (job.payment_status === "paid") {
      const existing = await Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
      await notifyTechnicianOnline(job);
      return res.json({
        message: "Payment already confirmed",
        job_status: job.job_status,
        payment_status: job.payment_status,
        payment_method: job.payment_method,
        receipt: existing,
      });
    }
    job.payment_status = "paid";
    job.paid_at = new Date();
    if (payment_method && ["cash", "card", "wallet"].includes(payment_method)) {
      job.payment_method = payment_method;
    } else if (!job.payment_method) {
      job.payment_method = "cash";
    }
    await job.save();

    // P1-04: use the same pricing formula as calculateTotal so receipt matches what tech saw
    const repairs = await RepairProcedure.find({ job_id: id });
    const pricing = computeJobPricing(job, repairs);

    const receipt = new Receipt({
      job_id: job._id,
      customer_id: job.customer_id,
      technician_id: job.assignedTechnician,
      total_amount: pricing.total,
      payment_status: "paid",
      items: repairs.map((r) => ({
        description: r.description,
        quantity: r.quantity,
        price: r.price,
        receipt_image_url: r.receipt_image_url,
      })),
      notes: notes || undefined,
    });
    await receipt.save();
    await notifyTechnicianOnline(job);
    res.json({
      message: "Payment confirmed",
      job_status: job.job_status,
      payment_status: job.payment_status,
      payment_method: job.payment_method,
      receipt,
    });
  } catch (err) {
    // Unique index violation (code 11000) means a concurrent call already created
    // the receipt. Return the existing one rather than a 500.
    if (err.code === 11000) {
      const existing = await Receipt.findOne({ job_id: req.params.id }).sort({ issued_at: -1 });
      const job = await Job.findById(req.params.id);
      if (job) await notifyTechnicianOnline(job);
      return res.json({
        message: "Payment already confirmed",
        job_status: "completed",
        payment_status: "paid",
        receipt: existing,
      });
    }
    res.status(500).json({ error: "Confirm payment failed", details: err.message });
  }
};

// ==================== SESSION RESUME ENDPOINTS ====================

// Get customer's current active job (for app resume)
const getCustomerActiveJob = async (req, res) => {
  try {
    const customer_id = req.user.id;
    
    // Find job that is NOT in a terminal state
    // Note: 'paid' is not a valid job_status enum value — valid terminals are 'completed' and 'cancelled'
    const activeJob = await Job.findOne({
      customer_id,
      job_status: { $nin: ['completed', 'cancelled'] }
    })
    .populate('assignedTechnician', 'firstName lastName phone profilePicture currentLocation currentStatus')
    .populate({
      path: 'customer_vehicle_id',
      populate: [
        { path: 'vehicle_make' },
        { path: 'vehicle_model' }
      ]
    })
    .populate('source')
    .sort({ createdAt: -1 });
    
    res.json({ 
      active_job: activeJob,
      has_active_job: !!activeJob
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch active job failed", details: err.message });
  }
};

// Get customer's active SOS request (for app resume)
const getCustomerActiveSOS = async (req, res) => {
  try {
    const customer_id = req.user.id;
    
    // Find SOS that is pending or in_call (not yet converted to job)
    const activeSOS = await SOSRequest.findOne({
      customer_id,
      status: { $in: ['pending', 'in_call'] }
    })
    .populate({
      path: 'customer_vehicle_id',
      populate: [
        { path: 'vehicle_make' },
        { path: 'vehicle_model' }
      ]
    })
    .sort({ createdAt: -1 });
    
    res.json({ 
      active_sos: activeSOS,
      has_active_sos: !!activeSOS
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch active SOS failed", details: err.message });
  }
};

// Get customer's full session state (combines active SOS + active job)
const getCustomerSession = async (req, res) => {
  try {
    const customer_id = req.user.id;
    
    // Check for active SOS first
    const activeSOS = await SOSRequest.findOne({
      customer_id,
      status: { $in: ['pending', 'in_call'] }
    })
    .populate({
      path: 'customer_vehicle_id',
      populate: [
        { path: 'vehicle_make' },
        { path: 'vehicle_model' }
      ]
    })
    .sort({ createdAt: -1 });
    
    // Check for active job
    // Include: active jobs OR completed jobs where payment is not yet received
    const activeJob = await Job.findOne({
      customer_id,
      $or: [
        { job_status: { $in: ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'] } },
        { job_status: 'completed', payment_status: { $ne: 'paid' } }
      ]
    })
    .populate('assignedTechnician', 'firstName lastName phone profilePicture currentLocation currentStatus')
    .populate({
      path: 'customer_vehicle_id',
      populate: [
        { path: 'vehicle_make' },
        { path: 'vehicle_model' }
      ]
    })
    .populate('source')
    .sort({ createdAt: -1 });

    const activeServiceRequest = await ServiceRequest.findOne({
      customer_id,
      status: { $in: ["pending", "assigned"] },
    })
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make" },
          { path: "vehicle_model" },
        ],
      })
      .sort({ createdAt: -1 });
    
    res.json({
      active_sos: activeSOS,
      active_job: activeJob,
      active_service_request: activeServiceRequest,
      has_active_session: !!(activeSOS || activeJob || activeServiceRequest),
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch session failed", details: err.message });
  }
};

// Get technician's current active job (for app resume)
const getTechnicianActiveJob = async (req, res) => {
  try {
    const technician_id = req.user.id;
    
    // Find job that is assigned to this technician and is active
    const activeJob = await Job.findOne({
      assignedTechnician: technician_id,
      job_status: { $in: ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'] }
    })
    .populate('customer_id', 'first_name last_name phone_number email')
    .populate({
      path: 'customer_vehicle_id',
      populate: [
        { path: 'vehicle_make' },
        { path: 'vehicle_model' }
      ]
    })
    .populate('source')
    .sort({ createdAt: -1 });
    
    res.json({ 
      active_job: activeJob,
      has_active_job: !!activeJob
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch active job failed", details: err.message });
  }
};

// Get technician's full session state
const getTechnicianSession = async (req, res) => {
  try {
    const technician_id = req.user.id;
    
    // Get technician info
    const technician = await Technician.findById(technician_id)
      .select('firstName lastName currentStatus isActive applicationStatus phone');
    
    // All fulfill-path jobs + completed but unpaid (queue for multi-job)
    const activeJobsRaw = await Job.find({
      assignedTechnician: technician_id,
      $or: [
        {
          job_status: {
            $in: ["assigned", "accepted", "en_route", "arrived", "in_progress"],
          },
        },
        { job_status: "completed", payment_status: { $ne: "paid" } },
      ],
    })
    .populate(jobPopulateForTech)
    .sort({ createdAt: -1 });

    const active_jobs = sortActiveJobs(activeJobsRaw);
    const activeJob = active_jobs[0] || null;
    
    res.json({
      technician: {
        id: technician?._id,
        name: technician ? `${technician.firstName} ${technician.lastName}` : null,
        status: technician?.currentStatus,
        is_active: technician?.isActive,
        applicationStatus: technician?.applicationStatus,
        phone: technician?.phone,
      },
      active_job: activeJob,
      active_jobs,
      has_active_job: !!activeJob
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch technician session failed", details: err.message });
  }
};

/** Aggregated payload for Activity Details screen */
const getActivityDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id).populate(jobPopulateForTech);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const repairs = await RepairProcedure.find({ job_id: id }).sort({
      created_at: 1,
    });
    const pricing = computeJobPricing(job, repairs);
    const receipt = await Receipt.findOne({ job_id: id }).sort({
      issued_at: -1,
    });

    res.json({
      job,
      repairs,
      pricing,
      receipt: receipt || null,
    });
  } catch (err) {
    res.status(500).json({
      error: "Fetch activity detail failed",
      details: err.message,
    });
  }
};

function clearCustomerSignature(job) {
  const had = Boolean(job.customerSignatureUrl || job.customerSignedAt);
  if (!had) return false;
  job.customerSignatureUrl = "";
  job.customerSignedAt = null;
  job.customerSignatureInvalidatedAt = new Date();
  return true;
}

/** Technician edits client/vehicle fields only after arrived. Clears e-sign. */
const updateJobDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!["arrived", "in_progress"].includes(job.job_status)) {
      return res.status(400).json({
        error: "Job details can only be edited after the technician has arrived",
      });
    }

    const {
      clientName,
      clientMobileNumber,
      clientEmail,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      vinNumber,
      issue,
      location,
    } = req.body;

    if (clientName != null) job.clientName = String(clientName).trim();
    if (clientMobileNumber != null) job.clientMobileNumber = String(clientMobileNumber).trim();
    if (clientEmail != null) job.clientEmail = String(clientEmail).trim();
    if (vehicleMake != null) job.vehicleMake = String(vehicleMake).trim();
    if (vehicleModel != null) job.vehicleModel = String(vehicleModel).trim();
    if (vehicleYear != null && vehicleYear !== "") job.vehicleYear = Number(vehicleYear);
    if (licensePlate != null) job.licensePlate = String(licensePlate).trim();
    if (vinNumber != null) job.vinNumber = String(vinNumber).trim();
    if (issue != null) job.issue = String(issue).trim();
    if (location != null) job.location = String(location).trim();

    const signatureCleared = clearCustomerSignature(job);
    await job.save();

    res.json({
      message: "Job details updated",
      job,
      signatureCleared,
    });
  } catch (err) {
    res.status(500).json({ error: "Update job details failed", details: err.message });
  }
};

const uploadCustomerSignature = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!["arrived", "in_progress"].includes(job.job_status)) {
      return res.status(400).json({
        error: "Signature can only be collected after arrival",
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: "signature file is required" });
    }

    const fileUploadService = require("../services/fileUploadService");
    const filename = `jobs/${id}/signature-${Date.now()}-${req.file.originalname || "sign.png"}`;
    const url = await fileUploadService.uploadFile(req.file, filename);

    job.customerSignatureUrl = url;
    job.customerSignedAt = new Date();
    job.customerSignatureInvalidatedAt = null;
    await job.save();

    res.json({
      message: "Signature saved",
      customerSignatureUrl: url,
      customerSignedAt: job.customerSignedAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Upload signature failed", details: err.message });
  }
};

module.exports = {
  createJob,
  getJobs,
  getCustomerJobs,
  updateJobStatus,
  updateJobDetails,
  uploadCustomerSignature,
  rateJob,
  getJobById,
  markArrived,
  startJob,
  addRepairProcedure,
  calculateTotal,
  findNearbyTechnicians,
  markCompleted,
  cancelJobByTechnician,
  confirmPayment,
  getCustomerActiveJob,
  getCustomerActiveSOS,
  getCustomerSession,
  getTechnicianActiveJob,
  getTechnicianSession,
  getActivityDetail,
};
