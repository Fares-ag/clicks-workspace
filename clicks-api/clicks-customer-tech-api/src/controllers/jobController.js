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
} = require("../../../clicks-shared/utils/parseJobLocation");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../../../clicks-shared/utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../../../clicks-shared/utils/parseJobLocation");
const { distanceBetween } = require("../../../clicks-shared/utils/geoDistance");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const { captureException } = require("../../../clicks-shared/middleware/sentry");
const { creditTechnicianForJob } = require("../../../clicks-shared/services/technicianCredit");
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
const {
  MOBILE_JOB_LIST_SELECT,
  MOBILE_JOB_LIST_POPULATE,
  paginateQuery,
} = require("../../../clicks-shared/utils/mobileJobList");
const {
  getCachedPayload,
  deletePayloadCacheKey,
} = require("../../../clicks-shared/utils/payloadCache");

function invalidateTechSessionCache(technicianId) {
  if (!technicianId) return;
  deletePayloadCacheKey(`clicks:tech:payload:session:${technicianId}`).catch(
    () => {}
  );
}
const {
  completionCasMissError,
  isCompletionCasMiss,
  isReplicaSetTransactionError,
} = require("../../../clicks-shared/utils/mongoTransactions");

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
  "job_reference clientName clientMobileNumber clientEmail customer_id customer_vehicle_id vehicleMake vehicleModel vehicleYear licensePlate issue location locationCoordinates dateTime jobType assignedTechnician price source subSource job_status payment_status payment_method assigned_at accepted_at en_route_at arrived_at started_at completed_at hold_request hold_reason hold_status previous_status started_latitude started_longitude rating businessName customerSignatureUrl customerSignedAt customerSignatureInvalidatedAt completion_notes createdAt updatedAt";

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

async function ensureCompletionReceipt(job, jobId, session = null) {
  let query = Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
  if (session) query = query.session(session);
  const existing = await query;
  if (existing) return existing;

  let repairsQuery = RepairProcedure.find({ job_id: jobId });
  if (session) repairsQuery = repairsQuery.session(session);
  const repairs = await repairsQuery;
  const pricing = computeJobPricing(job, repairs);
  const receiptDoc = {
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
  };

  if (session) {
    const [created] = await Receipt.create([receiptDoc], { session });
    return created;
  }
  return Receipt.create(receiptDoc);
}

async function runCompletionMoneyPath(id, completionSet, session = null) {
  const updateOpts = session ? { new: true, session } : { new: true };
  const updated = await Job.findOneAndUpdate(
    { _id: id, job_status: "in_progress" },
    { $set: completionSet },
    updateOpts
  );

  if (!updated) {
    throw completionCasMissError();
  }

  await creditTechnicianForJob(updated, session ? { session } : {});
  const receipt = await ensureCompletionReceipt(updated, id, session);
  return { updated, receipt };
}

async function runCompletionWithTransaction(id, completionSet) {
  const session = await Job.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await runCompletionMoneyPath(id, completionSet, session);
    });
    return result;
  } finally {
    await session.endSession();
  }
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

/** Standalone Mongo: sequential writes + credit outbox on partial failure. */
async function runCompletionWithoutTransaction(id, completionSet) {
  const updated = await Job.findOneAndUpdate(
    { _id: id, job_status: "in_progress" },
    { $set: completionSet },
    { new: true }
  );

  if (!updated) {
    throw completionCasMissError();
  }

  try {
    await creditTechnicianForJob(updated);
  } catch (creditErr) {
    console.error("Technician credit failed:", creditErr.message);
    try {
      const {
        enqueueOutboxEvent,
        OUTBOX_TYPES,
      } = require("../../../clicks-shared/services/outboxWorker");
      await enqueueOutboxEvent(OUTBOX_TYPES.TECHNICIAN_CREDIT, {
        job_id: updated._id.toString(),
      });
    } catch (outboxErr) {
      console.error("Failed to enqueue technician credit outbox:", outboxErr.message);
    }
  }

  const receipt = await ensureCompletionReceipt(updated, id, null);
  return { updated, receipt };
}

let loggedTransactionFallback = false;

const markCompleted = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (job.payment_status !== "paid") {
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
    const completionSet = {
      job_status: "completed",
      completed_at: new Date(),
      job_reference: jobReference,
    };
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
      ({ updated, receipt } = await runCompletionWithTransaction(id, completionSet));
    } catch (txnErr) {
      if (isCompletionCasMiss(txnErr)) {
        return respondCompletionCasMiss(res, id);
      }
      if (isReplicaSetTransactionError(txnErr)) {
        if (!loggedTransactionFallback) {
          loggedTransactionFallback = true;
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "completion_transaction_unavailable",
              detail: txnErr.message,
              fallback: "non_transactional",
            })
          );
        }
        try {
          ({ updated, receipt } = await runCompletionWithoutTransaction(id, completionSet));
        } catch (fallbackErr) {
          if (isCompletionCasMiss(fallbackErr)) {
            return respondCompletionCasMiss(res, id);
          }
          throw fallbackErr;
        }
      } else {
        return res.status(500).json({
          error: "Mark completed failed",
          details: txnErr.message,
        });
      }
    }

    try {
      const { accruePartnerFromCompletedJob } = require("../../../clicks-shared/services/partnerService");
      const populated = await Job.findById(updated._id).populate("source", "mainSourceName");
      await accruePartnerFromCompletedJob(populated);
    } catch (partnerErr) {
      console.error("Partner accrual failed:", partnerErr.message);
      try {
        const {
          enqueueOutboxEvent,
          OUTBOX_TYPES,
        } = require("../../../clicks-shared/services/outboxWorker");
        await enqueueOutboxEvent(OUTBOX_TYPES.PARTNER_ACCRUAL, {
          job_id: updated._id.toString(),
        });
      } catch (outboxErr) {
        console.error("Failed to enqueue partner accrual outbox:", outboxErr.message);
      }
    }

    invalidateTechSessionCache(updated.assignedTechnician);

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
    const customerId = updated.customer_id;
    const completedJobId = updated._id.toString();
    const paymentStatus = updated.payment_status;
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
        if (customerId) {
          const notify = req.app.get("notifyCustomerJobEvent");
          if (typeof notify === "function") {
            await notify(customerId.toString(), "jobCompleted", {
              job_id: completedJobId,
              job_status: "completed",
              payment_status: paymentStatus,
            });
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
    // Cash has already been collected and a paid Receipt exists — cancelling
    // here would strand that money outside the earnings ledger.
    if (job.payment_status === "paid") {
      return res.status(400).json({
        error:
          "Cannot cancel a job that has already been paid. Complete the job or request a refund.",
      });
    }
    // Guarded CAS so a concurrent payment/complete cannot be cancelled out from
    // under us, and so a repeated cancel does not double-count the counters.
    const cancelled = await Job.findOneAndUpdate(
      {
        _id: id,
        job_status: { $in: cancellable },
        payment_status: { $ne: "paid" },
      },
      {
        $set: {
          job_status: "cancelled",
          rejection_description: reason.slice(0, 500),
        },
        $push: { rejection_reasons: reason.slice(0, 200) },
      },
      { new: true }
    );
    if (!cancelled) {
      const current = await Job.findById(id).select("job_status payment_status");
      if (!current) return res.status(404).json({ error: "Job not found" });
      return res.status(400).json({
        error: `Cannot cancel job in status ${current.job_status} (payment ${current.payment_status})`,
      });
    }
    job.job_status = cancelled.job_status;

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

      // Only free the technician when they have no other live job.
      const nextStatus = await resolveTechnicianStatusAfterJob(
        job.assignedTechnician,
        job._id
      );
      await setTechnicianStatus(job.assignedTechnician, nextStatus);
      const notifyPresence = req.app.get("notifyAdminTechnicianPresence");
      if (typeof notifyPresence === "function") {
        await notifyPresence(job.assignedTechnician, nextStatus);
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
  try {
    const { id } = req.params;
    const { payment_method, notes } = req.body || {};
    const job = await Job.findById(id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!assertJobAccess(job, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Payment is collected during in_progress (before complete). Legacy unpaid
    // completed jobs can still be paid to clear the queue.
    if (!["in_progress", "completed"].includes(job.job_status)) {
      return res.status(400).json({
        error: `Cannot collect payment for job with status: ${job.job_status}. Job must be in progress (or completed unpaid).`,
      });
    }
    // Idempotency — already paid (do not set Online; tech stays On Job until complete)
    if (job.payment_status === "paid") {
      const existing = await Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
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
    if (payment_method && ["cash", "card", "wallet", "fawran"].includes(payment_method)) {
      job.payment_method = payment_method;
    } else if (!job.payment_method) {
      job.payment_method = "cash";
    }
    await job.save();
    invalidateTechSessionCache(job.assignedTechnician);

    recordTechnicianActivity({
      req,
      technicianId: req.user.id,
      event: "job.payment_collected",
      message: `Collected payment (${job.payment_method})`,
      statusCode: 200,
      jobId: job._id,
      jobReference: job.job_reference,
      metadata: {
        payment_method: job.payment_method,
        paid_at: job.paid_at,
        price: job.price,
        notes: typeof notes === "string" ? notes.slice(0, 200) : undefined,
      },
    });

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

    if (job.customer_id) {
      const notify = req.app.get("notifyCustomerJobEvent");
      if (typeof notify === "function") {
        await notify(job.customer_id.toString(), "paymentConfirmed", {
          job_id: job._id.toString(),
          job_status: job.job_status,
          payment_status: "paid",
          total_amount: pricing.total,
        });
      }
    }

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
      return res.json({
        message: "Payment already confirmed",
        job_status: job?.job_status || "in_progress",
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
        { job_status: { $in: TECH_SESSION_ACTIVE_STATUSES } },
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

    const payload = await getCachedPayload(
      `clicks:tech:payload:session:${technician_id}`,
      12000,
      async () => {
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
              { job_status: "completed", payment_status: { $ne: "paid" } },
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

        return {
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
        };
      }
    );

    res.json(payload);
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
      if (job.payment_status === "paid") {
        return res.status(400).json({
          error: "Cannot change price after payment is collected",
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

module.exports = {
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
  requestHold,
  cancelHoldRequestHandler,
};
