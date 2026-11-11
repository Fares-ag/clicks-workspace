const {
  Job,
  SOSRequest,
  ServiceRequest,
  Technician,
} = require("../../../clicks-shared/models");
const { SETTLED_PAYMENT_STATUSES } = require("../../../clicks-shared/constants/jobStatuses");
const { assertJobAccess, sameId } = require("../utils/ownership");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const {
  parseJobLocation,
} = require("../../../clicks-shared/utils/parseJobLocation");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../../../clicks-shared/utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../../../clicks-shared/utils/parseJobLocation");
const { distanceBetween } = require("../../../clicks-shared/utils/geoDistance");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const { captureException } = require("../../../clicks-shared/middleware/sentry");
const { num } = require("../../../clicks-shared/utils/coerce");
const {
  recordTechnicianActivity,
} = require("../../../clicks-shared/services/technicianActivityLog");
const {
  TECH_SESSION_ACTIVE_STATUSES,
  TECH_BUSY_JOB_STATUSES,
  JOB_STATUS_PRIORITY,
} = require("../../../clicks-shared/constants/jobStatuses");
const {
  resolveTechnicianStatusAfterJob,
  requestJobHold,
  cancelHoldRequest,
} = require("../../../clicks-shared/services/jobHold");
const { buildCustomerSession } = require("../../../clicks-shared/utils/customerBookingGuard");
const {
  customerCancelDecision,
  customerCancelRefusalMessage,
} = require("../../../clicks-shared/utils/customerCancelPolicy");
const { sendJobToGarage } = require("../../../clicks-shared/services/jobGarage");
const { notifyCustomerSafe } = require("../../../clicks-shared/services/notifyCustomer");
const {
  MOBILE_JOB_LIST_SELECT,
  MOBILE_JOB_LIST_POPULATE,
  paginateQuery,
} = require("../../../clicks-shared/utils/mobileJobList");
const {
  notifyAdminJobStatusFromReq,
} = require("../../../clicks-shared/utils/adminJobStatus");
const {
  deletePayloadCacheKey,
} = require("../../../clicks-shared/utils/payloadCache");

function invalidateTechSessionCache(technicianId) {
  if (!technicianId) return;
  deletePayloadCacheKey(`clicks:tech:payload:session:${technicianId}`).catch(
    () => {}
  );
}
const { isCompletionCasMiss } = require("../../../clicks-shared/utils/mongoTransactions");

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
  { path: "source", select: "mainSourceName" },
];

/** Session/active queue: job docs already carry vehicleMake/Model — skip nested vehicle DB hops. */
const sessionJobPopulate = [
  { path: "customer_id", select: "first_name last_name phone_number email" },
  { path: "source", select: "mainSourceName" },
];

const SESSION_JOB_SELECT =
  "job_reference clientName clientMobileNumber clientEmail customer_id customer_vehicle_id vehicleMake vehicleModel vehicleYear licensePlate issue location locationCoordinates dateTime jobType assignedTechnician price source subSource job_status payment_status payment_method assigned_at accepted_at en_route_at arrived_at started_at completed_at hold_request hold_reason hold_status previous_status started_latitude started_longitude rating businessName customerSignatureUrl customerSignedAt customerSignatureInvalidatedAt completion_notes membership createdAt updatedAt";

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

// NOTE: the customer-facing `POST /api/jobs` handler (createJob) was removed.
// It trusted client-supplied price / assignedTechnician / job_status and mutated
// an arbitrary SOSRequest by id with no ownership check. Customer jobs are now
// created only through the SOS and service-request dispatch paths (admin API).

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

    const { page, limit, skip } = paginateQuery(req.query.page, req.query.limit);
    const sort = req.user.role === "technician" ? { createdAt: -1 } : { dateTime: -1 };

    const jobsQuery = Job.find(filter)
      .select(MOBILE_JOB_LIST_SELECT)
      .populate(MOBILE_JOB_LIST_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    let total = null;
    const [jobs, totalCount] = await Promise.all([
      jobsQuery,
      page === 1 ? Job.countDocuments(filter) : Promise.resolve(null),
    ]);
    if (page === 1) total = totalCount;

    res.json({
      jobs,
      total,
      page,
      has_more: jobs.length === limit,
    });
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

    const { page, limit, skip } = paginateQuery(req.query.page, req.query.limit);

    const jobs = await Job.find(filter)
      .select(MOBILE_JOB_LIST_SELECT)
      .populate(MOBILE_JOB_LIST_POPULATE)
      .sort({ dateTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let total = null;
    if (page === 1) {
      total = await Job.countDocuments(filter);
    }

    res.json({
      jobs,
      total,
      page,
      has_more: jobs.length === limit,
    });
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
    invalidateTechSessionCache(job.assignedTechnician);

    notifyAdminJobStatusFromReq(req, job);

    if (job_status === "en_route" && job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "technicianEnRoute", {
        job_id: job._id,
        status: "en_route",
        en_route_at: job.en_route_at,
        technician: technicianTrackingPayload(job.assignedTechnician),
      });
    }

    if (req.user.role === "technician") {
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: job_status === "en_route" ? "job.en_route" : "job.status_changed",
        message:
          job_status === "en_route"
            ? "Started driving to the job"
            : `Changed job status to ${job_status}`,
        statusCode: 200,
        jobId: job._id,
        jobReference: job.job_reference,
        metadata: { job_status },
      });
    }

    res.json({ message: "Job status updated", job_status: job.job_status });
  } catch (err) {
    res.status(500).json({ error: "Update job status failed", details: err.message });
  }
};

/** A rating can be changed for this long after it was first given (scenario 76). */
const RATING_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATED_PAYMENT_STATUSES = ["paid", "partially_refunded", "refunded"];

/**
 * One rating per job (scenario 76): only a completed, PAID job can be rated;
 * the first rating may be edited for 24 hours, then it is locked. Ratings
 * feed technician performance, so they must not be overwritten at will.
 */
const rateJob = async (req, res) => {
  try {
    const { id } = req.params;
    const rating = Number(req.body?.rating);
    const description =
      typeof req.body?.rating_description === "string"
        ? req.body.rating_description.trim().slice(0, 500)
        : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating is required and must be between 1 and 5",
        code: "RATING_INVALID",
      });
    }

    const job = await Job.findById(id).select(
      "customer_id assignedTechnician job_status payment_status rating rated_at"
    );
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.job_status !== "completed") {
      return res.status(400).json({
        error: "Can only rate completed jobs",
        code: "RATING_JOB_NOT_COMPLETED",
      });
    }
    if (!RATED_PAYMENT_STATUSES.includes(job.payment_status)) {
      return res.status(409).json({
        error: "You can rate this job once it has been paid",
        code: "RATING_JOB_UNPAID",
      });
    }

    const now = new Date();
    const fields = { rating, rating_description: description };

    // First rating: CAS on "not rated yet", so a double submit rates once.
    if (job.rating == null) {
      const first = await Job.findOneAndUpdate(
        {
          _id: job._id,
          $or: [{ rating: null }, { rating: { $exists: false } }],
        },
        { $set: { ...fields, rated_at: now } },
        { new: true, select: "rating rating_description rated_at" }
      );
      if (first) {
        return res.json({
          message: "Job rated successfully",
          rating: first.rating,
          rating_description: first.rating_description,
          rated_at: first.rated_at,
          editable_until: new Date(first.rated_at.getTime() + RATING_EDIT_WINDOW_MS),
        });
      }
    }

    // Edit: only within 24 h of the first rating. Legacy ratings with no
    // rated_at are treated as locked.
    const fresh = await Job.findById(job._id).select("rating rated_at");
    const ratedAt = fresh?.rated_at ? new Date(fresh.rated_at) : null;
    if (!ratedAt || now.getTime() - ratedAt.getTime() > RATING_EDIT_WINDOW_MS) {
      return res.status(409).json({
        error: "This job has already been rated",
        code: "RATING_LOCKED",
        rating: fresh?.rating ?? null,
      });
    }
    const edited = await Job.findOneAndUpdate(
      { _id: job._id, rated_at: ratedAt },
      { $set: { ...fields, rating_edited_at: now } },
      { new: true, select: "rating rating_description rated_at" }
    );
    res.json({
      message: "Rating updated",
      rating: edited?.rating ?? rating,
      rating_description: edited?.rating_description ?? description,
      rated_at: ratedAt,
      editable_until: new Date(ratedAt.getTime() + RATING_EDIT_WINDOW_MS),
    });
  } catch (err) {
    res.status(500).json({ error: "Rate job failed", details: err.message });
  }
};

/**
 * POST /api/jobs/:id/rating-prompted — the app showed the "rate your
 * service" prompt on resume; it is never shown again for this job.
 */
const markRatingPrompted = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).select("customer_id rating_prompted_at");
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const updated = await Job.findOneAndUpdate(
      { _id: job._id, rating_prompted_at: null },
      { $set: { rating_prompted_at: new Date() } },
      { new: true, select: "rating_prompted_at" }
    );
    res.json({
      message: "ok",
      rating_prompted_at: (updated || job).rating_prompted_at,
      already_prompted: !updated,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to record rating prompt", details: err.message });
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
    const priced = await withPricing(job);
    const body = { job: priced, pricing: priced.pricing };
    if (req.user?.role === "customer") {
      // Tracking reloads read the fee note from here too (scenario 63).
      const { customerCancelPolicy } = require("../../../clicks-shared/utils/customerCancelPolicy");
      body.cancel_policy = customerCancelPolicy(job);
      // The tracking poll follows THIS job (two live jobs, scenario 62) and
      // needs the technician's position and when it was last reported (59).
      if (job.assignedTechnician) {
        const Technician = require("../../../clicks-shared/models/Technician");
        const tech = await Technician.findById(job.assignedTechnician)
          .select("firstName lastName phone profilePicture currentLocation lastLocationAt")
          .lean();
        if (tech) body.job = { ...body.job, assignedTechnician: tech };
      }
    }
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: "Fetch job failed", details: err.message });
  }
};

const { RepairProcedure, Receipt } = require("../../../clicks-shared/models");
const { completeJob: completeJobService } = require("../../../clicks-shared/services/completeJob");
const {
  isJobPaid,
  isPriceLocked,
  applyJobPayment,
  liveCheckJobAttempts,
  cancelPendingJobAttempts,
  jobPricingPayload,
} = require("../../../clicks-shared/services/jobPayment");
const { pendingAttempts } = require("../../../clicks-shared/services/paymentAttempts");

function skipcashFetchFor(req) {
  return req.app.get("skipcashFetch") || undefined;
}

async function respondCompletionCasMiss(res, id) {
  const current = await Job.findById(id);
  if (!current) return res.status(404).json({ error: "Job not found" });
  if (current.job_status === "completed") {
    return res.json({ message: "Job already completed", job_status: "completed" });
  }
  return res.status(400).json({
    error: `Cannot complete job with status: ${current.job_status}`,
  });
}

/** Lean job + `pricing` {base, repairs[], discount, total} for customer payloads. */
async function withPricing(job) {
  if (!job) return job;
  const plain = typeof job.toObject === "function" ? job.toObject() : { ...job };
  plain.pricing = await jobPricingPayload(plain);
  return plain;
}

const markCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.price == null) {
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: "job.complete_blocked",
        outcome: "blocked",
        message: "Complete blocked — job price not set",
        statusCode: 400,
        jobId: job._id,
        jobReference: job.job_reference,
        metadata: { reason: "price_missing" },
      });
      return res.status(400).json({
        error: "Set the job price before completing the job",
      });
    }
    const completeRepairs = await RepairProcedure.find({ job_id: job._id });
    const completePricing = computeJobPricing(job, completeRepairs);
    const zeroDue = Number(completePricing.total || 0) <= 0;
    if (!isJobPaid(job) && !zeroDue) {
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: "job.complete_blocked",
        outcome: "blocked",
        message: "Complete blocked — payment not collected",
        statusCode: 400,
        jobId: job._id,
        jobReference: job.job_reference,
        metadata: { reason: "payment_missing" },
      });
      return res.status(400).json({
        error: "Payment must be collected before completing the job",
      });
    }
    if (!job.customerSignatureUrl || !job.customerSignedAt) {
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: "job.complete_blocked",
        outcome: "blocked",
        message: "Complete blocked — customer signature missing",
        statusCode: 400,
        jobId: job._id,
        jobReference: job.job_reference,
        metadata: { reason: "signature_missing" },
      });
      return res.status(400).json({
        error: "Customer signature is required before completing the job",
      });
    }
    const jobReference =
      typeof req.body?.job_reference === "string" ? req.body.job_reference.trim() : "";
    if (job.job_status === "in_progress" && !jobReference) {
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: "job.complete_blocked",
        outcome: "blocked",
        message: "Complete blocked — Job ID not entered",
        statusCode: 400,
        jobId: job._id,
        metadata: { reason: "job_reference_missing" },
      });
      return res.status(400).json({
        error: "Job ID is required to complete the job",
      });
    }
    if (jobReference.length > 64) {
      return res.status(400).json({
        error: "Job ID must be 64 characters or fewer",
      });
    }
    const completionSet = { job_reference: jobReference };
    const notes = req.body?.completion_notes ?? req.body?.notes;
    if (typeof notes === "string" && notes.trim()) {
      completionSet.completion_notes = notes.trim().slice(0, 2000);
    }
    const photos = req.body?.completion_photos;
    if (Array.isArray(photos)) {
      completionSet.completion_photos = photos
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => p.trim().slice(0, 500))
        .slice(0, 10);
    }

    let updated;
    let receipt;
    try {
      // completeJob tells the customer (jobCompleted) — the same call an
      // admin completion makes, so both paths notify identically.
      ({ job: updated, receipt } = await completeJobService({
        jobId: id,
        fromStatuses: ["in_progress"],
        set: completionSet,
        completedBy: "technician",
      }));
    } catch (completeErr) {
      if (isCompletionCasMiss(completeErr)) {
        return respondCompletionCasMiss(res, id);
      }
      return res.status(500).json({
        error: "Mark completed failed",
        details: completeErr.message,
      });
    }

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.completed",
      message: "Completed the job",
      statusCode: 200,
      jobId: updated._id,
      jobReference: updated.job_reference,
      metadata: {
        completed_at: updated.completed_at,
        payment_status: updated.payment_status,
        payment_method: updated.payment_method,
        completion_notes: completionSet.completion_notes,
      },
    });

    const assignedTechnician = updated.assignedTechnician;
    const completedJobId = updated._id.toString();
    setImmediate(() => {
      (async () => {
        if (assignedTechnician) {
          const nextStatus = await resolveTechnicianStatusAfterJob(
            assignedTechnician,
            updated._id
          );
          await setTechnicianStatus(assignedTechnician, nextStatus);
          const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
          if (typeof notifyPresence === "function") {
            await notifyPresence(assignedTechnician, nextStatus);
          }
        }
      })().catch((err) => {
        console.error("markCompleted async side effects:", err.message);
        captureException(err, {
          job_id: completedJobId,
          event: "jobCompleted",
        });
      });
    });

    res.json({
      message: "Job marked as completed",
      job_status: updated.job_status,
      payment_status: updated.payment_status,
      payment_method: updated.payment_method,
      receipt,
    });
  } catch (err) {
    res.status(500).json({ error: "Mark completed failed", details: err.message });
  }
};

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
    invalidateTechSessionCache(job.assignedTechnician);

    notifyAdminJobStatusFromReq(req, job);

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "technicianArrived", {
        job_id: job._id,
        status: "arrived",
        arrived_at: job.arrived_at,
      });
    }

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.arrived",
      message: "Marked arrival at the job location",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: { arrived_at: job.arrived_at },
    });

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
        recordTechnicianActivity({
          req,
          technicianId: req.user.id,
          event: "job.start_blocked",
          outcome: "blocked",
          message: `Start blocked — ${distanceMeters}m from the job (limit ${maxMeters}m)`,
          statusCode: 400,
          jobId: job._id,
          jobReference: job.job_reference,
          latitude: techPoint.lat ?? techPoint.latitude,
          longitude: techPoint.lng ?? techPoint.longitude,
          metadata: { distanceMeters, maxMeters, reason: "too_far" },
        });
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
    invalidateTechSessionCache(job.assignedTechnician);

    notifyAdminJobStatusFromReq(req, job);

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobStarted", {
        job_id: job._id,
        status: "in_progress",
        started_at: job.started_at,
        issue: job.issue || "",
      });
    }

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.started",
      message:
        distanceMeters != null
          ? `Started the job (${distanceMeters}m from site)`
          : "Started their own job (GPS check skipped)",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: {
        distanceMeters,
        gpsSkipped: distanceMeters == null,
        started_at: job.started_at,
      },
    });

    res.json({
      message: "Job started",
      job_status: job.job_status,
      ...(distanceMeters != null ? { distanceMeters } : { gpsSkipped: true }),
    });
  } catch (err) {
    res.status(500).json({ error: "Start job failed", details: err.message });
  }
};

const REPAIR_LOCKED_PAYMENT = ["paid", "partially_refunded", "refunded"];

const addRepairProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Lines are frozen once money has been taken or the job is closed: the
    // receipt was issued for the total at that moment.
    if (REPAIR_LOCKED_PAYMENT.includes(job.payment_status) || job.job_status === "completed") {
      return res.status(409).json({
        error: "Repairs cannot be changed after the job is paid or completed",
        code: "REPAIRS_LOCKED",
      });
    }
    if (job.job_status === "cancelled") {
      return res.status(409).json({
        error: "Repairs cannot be added to a cancelled job",
        code: "REPAIRS_LOCKED",
      });
    }
    if (await isPriceLocked(job)) {
      return res.status(409).json({
        error:
          "The customer has an open card payment. Cancel it (re-check first) before adding parts.",
        code: "PRICE_LOCKED",
      });
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
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "Price must be greater than 0", code: "INVALID_REPAIR_PRICE" });
    }
    const parsedQty = quantity == null || quantity === "" ? 1 : Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 1) {
      return res.status(400).json({
        error: "Quantity must be a whole number of at least 1",
        code: "INVALID_REPAIR_QUANTITY",
      });
    }
    const parsedCost = cost != null && cost !== "" ? Number(cost) : 0;
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: "Cost cannot be negative", code: "INVALID_REPAIR_COST" });
    }
    const repair = new RepairProcedure({
      job_id: id,
      technician_id: req.user.id,
      description,
      quantity: parsedQty,
      price: parsedPrice,
      name: name != null ? String(name).trim() : "",
      notes: notes != null ? String(notes).trim() : "",
      cost: parsedCost,
      receipt_image_url,
    });
    try {
      await repair.save();
    } catch (validationErr) {
      if (validationErr.name === "ValidationError") {
        return res.status(400).json({ error: validationErr.message, code: "INVALID_REPAIR" });
      }
      throw validationErr;
    }
    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.repair_added",
      message: `Added repair: ${repair.description || repair.name || "item"}`,
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: {
        description: repair.description,
        price: repair.price,
        cost: repair.cost,
        quantity: repair.quantity,
      },
    });

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
    res.json({ ...computeJobPricing(job, repairs), price_locked: Boolean(job.price_locked) });
  } catch (err) {
    res.status(500).json({ error: "Calculate total failed", details: err.message });
  }
};

/// Proximity-based technician matching (2dsphere).
//
// Customers used to get every online technician's name, phone and live
// coordinates — with no radius cap, and the whole fleet when no coordinates
// were sent. Customers now get only a count and the nearest distance;
// technicians must send coordinates and are capped at NEARBY_MAX_KM.
const NEARBY_MAX_KM = 50;

const findNearbyTechnicians = async (req, res) => {
  try {
    const { lat, lng, longitude, latitude, maxDistanceKm = 25 } = req.query;
    const latN = Number(latitude ?? lat);
    const lngN = Number(longitude ?? lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({
        error: "latitude and longitude are required",
        code: "NEARBY_LOCATION_REQUIRED",
      });
    }
    const requestedKm = Number(maxDistanceKm);
    const radiusKm = Math.min(
      Number.isFinite(requestedKm) && requestedKm > 0 ? requestedKm : 25,
      NEARBY_MAX_KM
    );
    const TechnicianModel = require("../../../clicks-shared/models/Technician");
    const filter = {
      isActive: true,
      currentStatus: "Online",
      currentLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: [lngN, latN] },
          $maxDistance: radiusKm * 1000,
        },
      },
    };

    if (req.user?.role === "customer") {
      const nearest = await TechnicianModel.find(filter)
        .select("currentLocation")
        .limit(50)
        .lean();
      let nearestKm = null;
      if (nearest.length) {
        const [tLng, tLat] = nearest[0].currentLocation?.coordinates || [];
        const km =
          distanceBetween({ lat: latN, lng: lngN }, { lat: Number(tLat), lng: Number(tLng) }) /
          1000;
        // Rounded so the response can't be used to triangulate a technician.
        nearestKm = Number.isFinite(km) ? Math.max(0.5, Math.round(km * 2) / 2) : null;
      }
      return res.json({
        count: nearest.length,
        nearest_km: nearestKm,
        radius_km: radiusKm,
      });
    }

    const technicians = await TechnicianModel.find(filter)
      .select("firstName lastName profilePicture currentStatus currentLocation expertise")
      .limit(100);
    return res.json({ technicians, radius_km: radiusKm });
  } catch (err) {
    res.status(500).json({ error: "Find nearby technicians failed", details: err.message });
  }
};

// cancelJob tells the customer itself (notifyCustomer); the notifier only
// carries the technician-side and Live Map side effects.
function cancelNotifierFromReq(req) {
  return {
    technicianPresence: req.app.get("notifyAdminTechnicianPresence"),
    technicianJobEvent: req.app.get("notifyTechnicianJobEvent"),
  };
}

/**
 * Technician can't finish (breakdown, accident) — scenario 48.
 *
 * Customer jobs go back to `pending` with no technician so dispatch can send
 * someone else; the SOS stays linked, admins are alerted and the customer
 * hears "finding another technician". Only a job the technician created
 * themselves (no customer waiting on it) is actually cancelled.
 */
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
    const {
      TECHNICIAN_RELEASE_STATUSES,
      releaseJobForRedispatch,
    } = require("../../../clicks-shared/services/jobReassign");
    if (!TECHNICIAN_RELEASE_STATUSES.includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot cancel job in status ${job.job_status}`,
      });
    }
    // Cash has already been collected and a paid Receipt exists — cancelling
    // here would strand that money outside the earnings ledger.
    if (job.payment_status === "paid") {
      return res.status(400).json({
        error:
          "Cannot cancel a job that has already been paid. Complete the job or request a refund.",
      });
    }

    const ownJobNoCustomer =
      !job.customer_id &&
      !job.sos_request_id &&
      !job.service_request_id &&
      job.created_by_technician &&
      sameId(job.created_by_technician, req.user.id);

    if (ownJobNoCustomer) {
      const { cancelJob } = require("../../../clicks-shared/services/cancelJob");
      const result = await cancelJob({
        jobId: id,
        actor: "technician",
        actorId: req.user.id,
        reason,
        notifier: cancelNotifierFromReq(req),
      });
      invalidateTechSessionCache(req.user.id);
      recordTechnicianActivity({
        req,
        technicianId: req.user.id,
        event: "job.cancelled",
        message: "Cancelled the job",
        statusCode: 200,
        jobId: job._id,
        jobReference: job.job_reference,
        metadata: { reason },
      });
      return res.json({
        message: "Job cancelled",
        job_status: result.job.job_status,
        reason,
      });
    }

    const released = await releaseJobForRedispatch({
      jobId: id,
      technicianId: req.user.id,
      reason,
      note: reason,
    });
    if (!released) {
      const current = await Job.findById(id).select("job_status payment_status");
      if (!current) return res.status(404).json({ error: "Job not found" });
      return res.status(400).json({
        error: `Cannot cancel job in status ${current.job_status} (payment ${current.payment_status})`,
      });
    }

    const TechnicianEarnings = require("../../../clicks-shared/models/TechnicianEarnings");
    await TechnicianEarnings.findOneAndUpdate(
      { technician_id: req.user.id },
      {
        $inc: { "performance.total_cancelled_jobs": 1 },
        $set: { updated_at: new Date() },
      },
      { upsert: true }
    );
    await Technician.updateOne(
      { _id: req.user.id },
      { $inc: { "performance.cancelledJobs": 1 } }
    );
    await applyTechnicianPresence(req, req.user.id, job._id);
    invalidateTechSessionCache(req.user.id);

    const notifyRedispatch = req.app.get("notifyJobRedispatch");
    if (typeof notifyRedispatch === "function") {
      try {
        await notifyRedispatch({
          job_id: String(job._id),
          customer_id: job.customer_id ? String(job.customer_id) : null,
          technician_id: String(req.user.id),
          sos_id: job.sos_request_id ? String(job.sos_request_id) : null,
          reason,
          released_at: released.releasedAt || released.job?.updatedAt,
        });
      } catch (notifyErr) {
        console.error("Failed to notify redispatch:", notifyErr.message);
      }
    }

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.cancelled",
      message: "Handed the job back for re-dispatch",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: { reason, redispatch: true },
    });

    res.json({
      message: "Job released for re-dispatch",
      job_status: released.job.job_status,
      redispatch: true,
      reason,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Cancel job failed", details: err.message });
  }
};

const TECH_PAYMENT_METHODS = ["cash", "card", "wallet", "fawran"];

/**
 * Technician confirms collection (cash, card, wallet, or Fawran).
 *
 * While a SkipCash checkout is open it is asked first: a paid link settles
 * the job by card (409 CARD_PAYMENT_RECEIVED). Cash is blocked until the
 * technician cancels the open link (`cancel_card: true`). In-person card /
 * wallet / Fawran can still be confirmed while a checkout is pending.
 */
const confirmPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, notes } = req.body || {};
    const cancelCard = req.body?.cancel_card === true || req.body?.cancel_card === "true";
    const method = String(payment_method || "cash").trim().toLowerCase();
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!TECH_PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({
        error: `payment_method must be one of ${TECH_PAYMENT_METHODS.join(", ")}`,
        code: "INVALID_PAYMENT_METHOD",
      });
    }
    // Payment is collected during in_progress (before complete). Legacy unpaid
    // completed jobs can still be paid to clear the queue.
    if (!["in_progress", "completed"].includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot collect payment for job with status: ${job.job_status}. Job must be in progress (or completed unpaid).`,
      });
    }
    if (job.price == null) {
      return res.status(400).json({
        error: "Set the job price before collecting payment",
      });
    }
    const alreadyPaidResponse = async (current, message = "Payment already confirmed") => {
      const existing = await Receipt.findOne({ job_id: current._id }).sort({ issued_at: -1 });
      return res.json({
        message,
        job_status: current.job_status,
        payment_status: current.payment_status,
        payment_method: current.payment_method,
        receipt: existing,
      });
    };
    // Idempotency — already paid (do not set Online; tech stays On Job until complete)
    if (isJobPaid(job)) return alreadyPaidResponse(job);

    const notify = notifyCustomerSafe;
    const open = await pendingAttempts({ jobId: job._id });
    if (open.length) {
      const check = await liveCheckJobAttempts(job._id, {
        fetchImpl: skipcashFetchFor(req),
        notify,
        source: "poll",
      });
      if (check.paid) {
        return res.status(409).json({
          error: "The customer has already paid by card. Do not collect cash.",
          code: "CARD_PAYMENT_RECEIVED",
          payment_status: check.job?.payment_status,
          payment_method: check.job?.payment_method,
        });
      }
      if (check.unverified.length) {
        return res.status(409).json({
          error:
            "Could not confirm the customer's card payment with SkipCash. Re-check before taking cash.",
          code: "CARD_PAYMENT_UNVERIFIED",
        });
      }
      if (check.stillPending.length && method === "cash") {
        if (!cancelCard) {
          return res.status(409).json({
            error:
              "The customer has a card payment in progress. Cancel it before taking cash.",
            code: "CARD_PAYMENT_PENDING",
          });
        }
        const cancelled = await cancelPendingJobAttempts(job._id, {
          fetchImpl: skipcashFetchFor(req),
          notify,
          note: "cancelled by technician to take cash",
        });
        if (cancelled.paid) {
          return res.status(409).json({
            error: "The customer has already paid by card. Do not collect cash.",
            code: "CARD_PAYMENT_RECEIVED",
            payment_status: cancelled.job?.payment_status,
            payment_method: cancelled.job?.payment_method,
          });
        }
        if (cancelled.unverified.length) {
          return res.status(409).json({
            error: "Could not confirm the card payment with SkipCash. Re-check before taking cash.",
            code: "CARD_PAYMENT_UNVERIFIED",
          });
        }
      }
    }

    const fresh = await Job.findById(job._id);
    const applied = await applyJobPayment(fresh, {
      paymentMethod: method,
      notes: typeof notes === "string" && notes.trim() ? notes.trim().slice(0, 500) : undefined,
      paidBy: { type: "technician", id: req.user.id },
      notify,
    });
    if (applied.alreadyPaid) return alreadyPaidResponse(applied.job || fresh);
    const paidJob = applied.job;

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.payment_collected",
      message: `Collected payment (${paidJob.payment_method})`,
      statusCode: 200,
      jobId: paidJob._id,
      jobReference: paidJob.job_reference,
      metadata: {
        payment_method: paidJob.payment_method,
        paid_at: paidJob.paid_at,
        price: paidJob.price,
        notes: typeof notes === "string" ? notes.slice(0, 200) : undefined,
      },
    });

    res.json({
      message: "Payment confirmed",
      job_status: paidJob.job_status,
      payment_status: paidJob.payment_status,
      payment_method: paidJob.payment_method,
      receipt: applied.receipt,
    });
  } catch (err) {
    res.status(500).json({ error: "Confirm payment failed", details: err.message });
  }
};

/** Customer chooses cash. Does not mark the job paid — technician still confirms collection. */
const payCash = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!["in_progress", "completed"].includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot choose cash for a job in status ${job.job_status}`,
        code: "CASH_NOT_PAYABLE",
      });
    }
    if (isJobPaid(job)) {
      return res.json({
        message: "Payment already confirmed",
        job_status: job.job_status,
        payment_status: job.payment_status,
        payment_method: job.payment_method,
        already_paid: true,
      });
    }
    if (job.price == null) {
      return res.status(400).json({
        error: "Price has not been set yet",
        code: "PRICE_NOT_SET",
      });
    }

    const updated = await Job.findOneAndUpdate(
      { _id: job._id, payment_status: "unpaid" },
      { $set: { payment_method: "cash" } },
      { new: true }
    );
    const current = updated || (await Job.findById(job._id));

    res.json({
      message: "Cash payment selected. Pay the technician — they will confirm when they receive it.",
      job_status: current.job_status,
      payment_status: current.payment_status,
      payment_method: current.payment_method,
      already_paid: isJobPaid(current) || undefined,
      pricing: await jobPricingPayload(current),
    });
  } catch (err) {
    res.status(500).json({ error: "Cash payment failed", details: err.message });
  }
};

// ==================== SESSION RESUME ENDPOINTS ====================

// Get customer's current active job (for app resume)
const getCustomerActiveJob = async (req, res) => {
  try {
    const customer_id = req.user.id;
    
    // Same definition of "live" as the session: every non-terminal status,
    // including a `pending` job awaiting a technician (scenario 45) — but a
    // pending job for a future slot only from its scheduled window.
    const { liveJobFilter } = require("../../../clicks-shared/utils/customerBookingGuard");
    const activeJob = await Job.findOne(liveJobFilter(customer_id))
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
      active_job: await withPricing(activeJob),
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
    const session = await buildCustomerSession({ customerId: req.user.id });
    // Server-priced totals so the app never shows its own (truncated) number.
    for (const key of ["live_job", "unpaid_job", "active_job"]) {
      if (session[key]) session[key] = await withPricing(session[key]);
    }
    res.json(session);
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
      job_status: { $in: TECH_SESSION_ACTIVE_STATUSES },
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

    // Live path — do not cache. The payload cache stale window (up to 2 min)
    // hid new assignments and status changes after admin dispatch / accept.
    const [technician, activeJobsRaw] = await Promise.all([
      Technician.findById(technician_id)
        .select("firstName lastName currentStatus isActive applicationStatus phone")
        .lean(),
      Job.find({
        assignedTechnician: technician_id,
        $or: [
          {
            job_status: {
              $in: TECH_SESSION_ACTIVE_STATUSES,
            },
          },
          { job_status: "completed", payment_status: { $nin: SETTLED_PAYMENT_STATUSES } },
        ],
      })
        .select(SESSION_JOB_SELECT)
        .populate(sessionJobPopulate)
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

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
      has_active_job: !!activeJob,
    });
  } catch (err) {
    res.status(500).json({ error: "Fetch technician session failed", details: err.message });
  }
};

/** Aggregated payload for Activity Details screen */
const getActivityDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const [job, repairs, receipt] = await Promise.all([
      Job.findById(id).populate(jobPopulateForTech).lean(),
      RepairProcedure.find({ job_id: id }).sort({ created_at: 1 }).lean(),
      Receipt.findOne({ job_id: id }).sort({ issued_at: -1 }).lean(),
    ]);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const pricing = computeJobPricing(job, repairs);

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
      price,
    } = req.body;

    if (price != null) {
      if (isJobPaid(job)) {
        return res.status(400).json({
          error: "Cannot change price after payment is collected",
        });
      }
      if (await isPriceLocked(job)) {
        return res.status(409).json({
          error:
            "The customer has an open card payment. Cancel it (re-check first) before changing the price.",
          code: "PRICE_LOCKED",
        });
      }
      const parsed = Number(price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ error: "Invalid price" });
      }
      const maxPrice = Number(process.env.MAX_TECHNICIAN_JOB_PRICE || 100000);
      if (parsed > maxPrice) {
        return res.status(400).json({ error: `Price cannot exceed ${maxPrice} QAR` });
      }
      job.price = parsed;
    }

    if (clientName != null) job.clientName = String(clientName).trim();
    if (clientMobileNumber != null) job.clientMobileNumber = String(clientMobileNumber).trim();
    if (clientEmail != null) job.clientEmail = String(clientEmail).trim();
    if (vehicleMake != null) job.vehicleMake = String(vehicleMake).trim();
    if (vehicleModel != null) job.vehicleModel = String(vehicleModel).trim();
    if (vehicleYear != null && vehicleYear !== "") job.vehicleYear = Number(vehicleYear);
    if (licensePlate != null) job.licensePlate = String(licensePlate).trim();
    if (vinNumber != null) job.vinNumber = String(vinNumber).trim();
    if (issue != null) job.issue = String(issue).trim();
    if (location != null) {
      const locationInput = String(location).trim();
      const geo = await resolveJobLocationToGeoPointRequired(locationInput);
      job.location = formatGeoPointAsLocationString(geo) || locationInput;
      job.locationCoordinates = geo;
    }

    let signatureCleared = false;
    const detailsChanged =
      clientName != null ||
      clientMobileNumber != null ||
      clientEmail != null ||
      vehicleMake != null ||
      vehicleModel != null ||
      vehicleYear != null ||
      licensePlate != null ||
      vinNumber != null ||
      issue != null ||
      location != null;
    if (detailsChanged) {
      signatureCleared = clearCustomerSignature(job);
    }
    await job.save();
    invalidateTechSessionCache(job.assignedTechnician);

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.details_updated",
      message: signatureCleared
        ? "Edited job details (signature cleared)"
        : "Edited job details",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: {
        fields: Object.keys(req.body || {}),
        signatureCleared,
      },
    });

    res.json({
      message: "Job details updated",
      job,
      signatureCleared,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Update job details failed",
      details: err.message,
    });
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
    invalidateTechSessionCache(job.assignedTechnician);

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.signature_captured",
      message: "Captured the customer signature",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: { customerSignedAt: job.customerSignedAt },
    });

    res.json({
      message: "Signature saved",
      customerSignatureUrl: url,
      customerSignedAt: job.customerSignedAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Upload signature failed", details: err.message });
  }
};

async function applyTechnicianPresence(req, technicianId, excludeJobId, forceOnJob = false) {
  if (!technicianId) return;
  const nextStatus = forceOnJob
    ? "On Job"
    : await resolveTechnicianStatusAfterJob(technicianId, excludeJobId);
  await setTechnicianStatus(technicianId, nextStatus);
  const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
  if (typeof notifyPresence === "function") {
    await notifyPresence(technicianId, nextStatus);
  }
  return nextStatus;
}

const requestHold = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await requestJobHold(job, {
      reason: req.body?.reason,
      technicianId: req.user.id,
    });

    const notify = req.app.get("notifyAdminHoldRequest");
    if (typeof notify === "function") {
      notify({
        job_id: String(job._id),
        technician_id: String(req.user.id),
        reason: job.hold_request?.reason,
        clientName: job.clientName,
      });
    }

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.hold_requested",
      message: `Requested a hold: ${job.hold_request?.reason || "no reason given"}`,
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: {
        reason: job.hold_request?.reason,
        job_status: job.job_status,
      },
    });

    const populated = await Job.findById(job._id).populate(jobPopulateForTech);
    res.json({
      message: "Hold request submitted",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Failed to submit hold request",
    });
  }
};

const cancelHoldRequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await cancelHoldRequest(job, { technicianId: req.user.id });

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.hold_request_cancelled",
      message: "Cancelled their hold request",
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
    });

    const populated = await Job.findById(job._id).populate(jobPopulateForTech);
    res.json({
      message: "Hold request cancelled",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Failed to cancel hold request",
    });
  }
};

const cancelJobByCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const reason =
      (typeof req.body?.reason === "string" && req.body.reason.trim()) ||
      (typeof req.body?.cancellation_reason === "string" &&
        req.body.cancellation_reason.trim()) ||
      "cancelled_by_customer";

    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.job_status === "cancelled" && job.cancelled_by === "customer") {
      return res.json({
        message: "Job cancelled",
        job,
        cancel_fee_due: !!job.cancel_fee_due,
      });
    }

    const decision = customerCancelDecision(job.job_status);
    if (!decision.allowed) {
      return res.status(400).json({
        error: customerCancelRefusalMessage(decision.code),
        code: decision.code,
      });
    }

    const { cancelJob } = require("../../../clicks-shared/services/cancelJob");
    let result;
    try {
      result = await cancelJob({
        jobId: id,
        actor: "customer",
        actorId: req.user.id,
        reason,
        feeDue: decision.fee,
        notifier: cancelNotifierFromReq(req),
      });
    } catch (cancelErr) {
      if (cancelErr.status && cancelErr.status < 500) {
        return res.status(400).json({
          error:
            cancelErr.code === "JOB_PAID"
              ? cancelErr.message
              : "Job is no longer cancellable",
          code: cancelErr.code === "JOB_PAID" ? "JOB_PAID" : "JOB_NOT_CANCELLABLE",
        });
      }
      throw cancelErr;
    }

    res.json({
      message: "Job cancelled",
      job: result.job,
      cancel_fee_due: !!result.job.cancel_fee_due,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to cancel job",
      details: err.message,
    });
  }
};

const sendCustomerJobToGarage = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!sameId(job.assignedTechnician, req.user.id)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await sendJobToGarage(job, {
      reason: req.body?.reason,
      garageName: req.body?.garage_name,
      expectedReadyAt: req.body?.expected_ready_at,
      heldBy: "technician",
    });

    const nextStatus = await resolveTechnicianStatusAfterJob(
      job.assignedTechnician,
      job._id
    );
    if (job.assignedTechnician) {
      await setTechnicianStatus(job.assignedTechnician, nextStatus);
      const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
      if (typeof notifyPresence === "function") {
        await notifyPresence(job.assignedTechnician, nextStatus);
      }
    }

    if (job.customer_id) {
      await notifyCustomerSafe(
        job.customer_id,
        "jobAtGarage",
        require("../../../clicks-shared/services/jobGarage").garageCustomerPayload(job, "at_garage")
      );
    }
    notifyAdminJobStatusFromReq(req, job);

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({ message: "Job sent to garage", job: populated });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Failed to send job to garage",
    });
  }
};

module.exports = {
  getJobs,
  getCustomerJobs,
  updateJobStatus,
  updateJobDetails,
  uploadCustomerSignature,
  rateJob,
  markRatingPrompted,
  getJobById,
  markArrived,
  startJob,
  addRepairProcedure,
  calculateTotal,
  findNearbyTechnicians,
  markCompleted,
  cancelJobByTechnician,
  cancelJobByCustomer,
  sendCustomerJobToGarage,
  confirmPayment,
  payCash,
  getCustomerActiveJob,
  getCustomerActiveSOS,
  getCustomerSession,
  getTechnicianActiveJob,
  getTechnicianSession,
  getActivityDetail,
  requestHold,
  cancelHoldRequestHandler,
};
