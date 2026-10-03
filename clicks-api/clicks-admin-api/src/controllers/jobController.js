const Job = require("../models/Job");
const Technician = require("../models/Technician");
const Source = require("../models/Source");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const axios = require('axios');
const xlsx = require("xlsx");
const {
  mapHistoricalRow,
  importHistoricalJobs,
} = require("../../../clicks-shared/utils/historicalJobImport");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../../../clicks-shared/utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../../../clicks-shared/utils/parseJobLocation");
const { createJobRecord } = require("../../../clicks-shared/services/createJobRecord");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const {
  putJobOnHold,
  resumeJobFromHold,
  resolveTechnicianStatusAfterJob,
  approveHoldRequest,
  rejectHoldRequest,
  clearPendingHoldRequest,
} = require("../../../clicks-shared/services/jobHold");
const { TECH_BUSY_JOB_STATUSES, ONGOING_JOB_STATUSES, ADMIN_COMPLETABLE_JOB_STATUSES } = require("../../../clicks-shared/constants/jobStatuses");
const { COMPLETED } = require("../../../clicks-shared/utils/dashboardRevenue");
const { startOfQatarDay, endOfQatarDay } = require("../utils/qatarDay");
const { isSourceLockedJob, formatJobSourceLabel } = require("../../../clicks-shared/utils/jobOrigin");
const { buildPrefixSearchFilter, computeJobSearchFields } = require("../../../clicks-shared/utils/searchFields");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");
const { getCachedPayload } = require("../../../clicks-shared/utils/payloadCache");
const {
  getSlimTechnicianRoster,
  technicianRosterMap,
  getSourceRoster,
  sourceRosterMap,
  toId,
} = require("../../../clicks-shared/utils/adminLookups");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { pick, str } = require("../../../clicks-shared/utils/coerce");
const {
  computeJobChanges,
  omitChangeKeys,
  recordAudit,
  serializeAuditValue,
} = require("../utils/auditLog");

// PUT /api/jobs/:id is open to every ops role (Job Dispatcher, Coordinator,
// Call Center Agent), so the update document is allow-listed instead of being
// spread from req.body. Everything not named here stays owned by the
// controller that is allowed to write it: finance_* by the finance portal,
// payment_status/paid_at by the payment flow, business_id/businessName/
// partner_id/customer_id by job creation.
const ADMIN_EDITABLE_JOB_FIELDS = [
  "clientName",
  "clientMobileNumber",
  "clientEmail",
  "issue",
  "location",
  "dateTime",
  "jobType",
  "assignedTechnician",
  "job_status",
  "price",
  "source",
  "subSource",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "licensePlate",
  "vinNumber",
  "task_description",
  "payment_method",
  "estimate",
  "technician_estimate",
];

// GET /api/jobs
async function getJobs(req, res) {
  try {
    const { page = 1, limit = 10, search = "", status, businessPortal, completedToday } = req.query;
    const limitNum = capAdminLimit(limit, 10, 100);
    const filterCompletedToday =
      completedToday === "1" || completedToday === "true";
    
    // Build search query
    let query = {};
    
    if (search) {
      // TODO: full free-text search on issue/location → Atlas Search
      const searchFilter = buildPrefixSearchFilter(search, {
        phoneField: "search_phone",
        nameField: "search_name",
        businessNameField: "businessName",
      });
      if (searchFilter) {
        // The list now shows job_reference as the job's identity, so it has to
        // be searchable. buildPrefixSearchFilter short-circuits to a phone
        // prefix as soon as the term holds 4+ digits — which a numeric Job ID
        // always does — so the reference is ORed back in rather than replaced.
        const term = str(search, { maxLength: 64 }).trim();
        const clauses = searchFilter.$or ? [...searchFilter.$or] : [searchFilter];
        if (term) {
          clauses.push({ job_reference: new RegExp(`^${escapeRegex(term)}`, "i") });
        }
        query = { ...query, $or: clauses };
      }
    }
    
    // Add status filter
    if (filterCompletedToday) {
      query.job_status = { $in: COMPLETED };
      query.completed_at = {
        $gte: startOfQatarDay(),
        $lte: endOfQatarDay(),
      };
    } else if (status === "ongoing") {
      query.job_status = { $in: ONGOING_JOB_STATUSES };
    } else if (status) {
      query.job_status = status;
    }

    if (businessPortal === "1" || businessPortal === "true") {
      query.business_id = { $exists: true, $ne: null };
    }

    const hasFilter = Boolean(
      search ||
        status ||
        filterCompletedToday ||
        businessPortal === "1" ||
        businessPortal === "true"
    );
    const countKey = `admin_jobs:${str(search)}|${str(status)}|${filterCompletedToday ? "1" : ""}|${str(businessPortal)}`;
    const skip = (page - 1) * limitNum;
    const cacheKey = `clicks:admin:payload:job-list:${page}:${limitNum}:${countKey}`;

    const started = Date.now();
    const payload = await getCachedPayload(cacheKey, 30000, async () => {
      const findStarted = Date.now();
      const listQuery = Job.find(query)
        .select(
          "job_reference clientName clientMobileNumber job_status hold_reason dateTime location source subSource assignedTechnician legacyTechnicianName price jobType vehicleMake vehicleModel vehicleYear licensePlate business_id businessName createdByTechnicianName payment_status createdAt"
        )
        .sort(hasFilter ? { createdAt: -1 } : { _id: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

      const countPromise = hasFilter
        ? cachedCount(Job, query, { ttlMs: 15000, key: countKey })
        : page === 1
          ? Job.estimatedDocumentCount()
          : cachedCount(Job, query, { ttlMs: 15000, key: "admin_jobs_unfiltered" });

      const [jobs, total, techRoster, sourceRoster] = await Promise.all([
        listQuery,
        countPromise,
        getSlimTechnicianRoster(),
        getSourceRoster(),
      ]);
      const findMs = Date.now() - findStarted;
      const techById = technicianRosterMap(techRoster);
      const sourceById = sourceRosterMap(sourceRoster);

      console.log(
        JSON.stringify({
          msg: "getJobs_timing",
          findMs,
          hydrateMs: Date.now() - findStarted - findMs,
          n: jobs.length,
          hasFilter,
          page,
        })
      );

      return {
        jobs: jobs.map((job) => {
          const assigned = job.assignedTechnician
            ? techById.get(toId(job.assignedTechnician)) || null
            : null;
          const source = job.source
            ? sourceById.get(toId(job.source)) || job.source
            : job.source;
          const hydrated = {
            ...job,
            assignedTechnician: assigned,
            source,
          };
          return {
            ...hydrated,
            sourceDisplay: formatJobSourceLabel(hydrated),
          };
        }),
        total,
      };
    });
    console.log(
      JSON.stringify({
        msg: "getJobs_total",
        totalMs: Date.now() - started,
        n: Array.isArray(payload?.jobs) ? payload.jobs.length : 0,
      })
    );
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs", error: err.message });
  }
}

// POST /api/jobs
async function createJob(req, res) {
  try {
    const notifyTechnicianFn = async (jobId) => {
      const customerTechApiUrl =
        process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
      await axios.post(
        `${customerTechApiUrl}/api/sos/notify-technician`,
        { job_id: jobId },
        { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
      );
      console.log(`Technician notified about job ${jobId}`);
    };

    const { populatedJob } = await createJobRecord(req.body, {
      notifyTechnicianFn: req.body.assignedTechnician
        ? notifyTechnicianFn
        : undefined,
    });

    await recordAudit({
      req,
      action: "job.create",
      entityType: "job",
      entityId: populatedJob._id,
      changes: {
        clientName: serializeAuditValue(populatedJob.clientName),
        clientMobileNumber: serializeAuditValue(populatedJob.clientMobileNumber),
        job_status: serializeAuditValue(populatedJob.job_status),
        assignedTechnician: serializeAuditValue(populatedJob.assignedTechnician),
        price: serializeAuditValue(populatedJob.price),
        source: serializeAuditValue(populatedJob.source),
      },
    });

    res.status(201).json({
      message: "Job created successfully",
      job: populatedJob,
    });
  } catch (err) {
    console.error("Error creating job:", err);
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to create job",
      error: err.message,
    });
  }
}

// GET /api/jobs/:id
async function getJobById(req, res) {
  try {
    const JobArchive = require("../../../clicks-shared/models/JobArchive");
    let job = await Job.findById(req.params.id)
      .populate({
        path: "assignedTechnician",
        select: "firstName lastName phone profilePicture currentStatus assignedVehicle",
        populate: {
          path: "assignedVehicle",
          select: "plateNumber make model",
          populate: [
            { path: "make", select: "makeName" },
            { path: "model", select: "modelName" },
          ],
        },
      })
      .populate("customer_id")
      .populate({
        path: "customer_vehicle_id",
        select: "vehicle_make vehicle_model year plateNumber",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .populate("created_by_technician", "firstName lastName")
      .populate("source", "mainSourceName")
      .populate("lead_id", "internalNotes")
      .lean();

    let archived = false;
    if (!job) {
      job = await JobArchive.findById(req.params.id)
        .populate({
          path: "assignedTechnician",
          select: "firstName lastName phone profilePicture currentStatus assignedVehicle",
          populate: {
            path: "assignedVehicle",
            populate: [{ path: "make" }, { path: "model" }],
          },
        })
        .populate("customer_id")
        .populate({
          path: "customer_vehicle_id",
          populate: [{ path: "vehicle_make" }, { path: "vehicle_model" }],
        })
        .populate("created_by_technician", "firstName lastName")
        .populate("source", "mainSourceName")
        .populate("lead_id", "internalNotes");
      archived = Boolean(job);
    }

    if (!job) return res.status(404).json({ message: "Job not found" });

    const { RepairProcedure, Receipt } = require("../../../clicks-shared/models");
    const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
    const repairs = await RepairProcedure.find({ job_id: job._id })
      .populate("technician_id", "firstName lastName")
      .sort({ created_at: 1 });
    const receipt = await Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
    const pricing = computeJobPricing(job, repairs);

    const { addSASTokenIfNeeded } = require("../utils/sasHelper");
    const jobObj = job.toObject ? job.toObject() : { ...job };
    if (jobObj.customerSignatureUrl) {
      jobObj.customerSignatureUrl = addSASTokenIfNeeded(jobObj.customerSignatureUrl);
    }

    const isPaid = job.payment_status === "paid";
    const financials = {
      currentEstimate: pricing.total,
      totalCost: pricing.costTotal,
      serviceCharge: pricing.serviceCharge,
      currentProfit: pricing.profit,
      dispatcherEstimate: job.estimate ?? null,
      technicianEstimate: job.technician_estimate ?? null,
      isPaid,
      finalPrice: receipt?.total_amount ?? (isPaid ? pricing.total : null),
      basePrice: pricing.basePrice,
      repairsTotal: pricing.repairsTotal,
    };

    if (archived) jobObj.archived = true;
    jobObj.sourceDisplay = formatJobSourceLabel(jobObj);

    res.json({ job: jobObj, repairs, financials, archived });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job", error: err.message });
  }
}

// PUT /api/jobs/:id
async function updateJob(req, res) {
  try {
    const { assignedTechnician, job_status } = req.body;
    const update = pick(req.body, ADMIN_EDITABLE_JOB_FIELDS);

    // Get the current job to check if technician is being newly assigned
    const currentJob = await Job.findById(req.params.id).populate("source", "mainSourceName");
    if (!currentJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Location is frozen once the job is completed (the visit already happened).
    // Every other status — including cancelled and on_hold — stays editable.
    if (
      Object.prototype.hasOwnProperty.call(req.body, "location") &&
      currentJob.job_status === "completed"
    ) {
      return res
        .status(400)
        .json({ message: "Cannot change location on a completed job" });
    }

    if (isSourceLockedJob(currentJob)) {
      const sourceTouched = Object.prototype.hasOwnProperty.call(req.body, "source");
      const subSourceTouched = Object.prototype.hasOwnProperty.call(req.body, "subSource");
      if (sourceTouched || subSourceTouched) {
        const currentSourceId = String(currentJob.source?._id || currentJob.source || "");
        const nextSourceId = sourceTouched ? String(req.body.source || "") : currentSourceId;
        const currentSubSource = currentJob.subSource || "";
        const nextSubSource = subSourceTouched ? String(req.body.subSource || "") : currentSubSource;
        const sourceChanged = sourceTouched && nextSourceId !== currentSourceId;
        const subSourceChanged = subSourceTouched && nextSubSource !== currentSubSource;
        if (sourceChanged || subSourceChanged) {
          return res.status(403).json({
            message: "Source cannot be changed for jobs created via Technician App or Business Portal",
          });
        }
      }
      delete update.source;
      delete update.subSource;
    }

    // If technician is being assigned and job was pending, update status to "assigned"
    const isNewTechnicianAssignment = assignedTechnician && 
      !currentJob.assignedTechnician && 
      currentJob.job_status === "pending";
    
    if (isNewTechnicianAssignment) {
      update.job_status = "assigned";
      update.assigned_at = new Date();
    }

    if (job_status === "on_hold" && currentJob.job_status !== "on_hold") {
      return res.status(400).json({
        message: "Use POST /api/jobs/:id/hold with a required reason",
      });
    }
    if (
      currentJob.job_status === "on_hold" &&
      job_status &&
      job_status !== "on_hold" &&
      job_status !== "cancelled"
    ) {
      return res.status(400).json({
        message: "Use POST /api/jobs/:id/resume to leave hold",
      });
    }

    // Handle job cancellation
    const isBeingCancelled = job_status === 'cancelled' && currentJob.job_status !== 'cancelled';
    if (isBeingCancelled) {
      update.cancelled_at = new Date();
      
      // Reset the linked SOS request if exists
      if (currentJob.sos_request_id) {
        await SOSRequest.findByIdAndUpdate(currentJob.sos_request_id, {
          status: 'cancelled'
        });
        console.log(`SOS ${currentJob.sos_request_id} cancelled due to job cancellation`);
      }
      
      // Reset technician status to Online/Available
      if (currentJob.assignedTechnician) {
        const nextStatus = await resolveTechnicianStatusAfterJob(
          currentJob.assignedTechnician,
          currentJob._id
        );
        await setTechnicianStatus(currentJob.assignedTechnician, nextStatus);
        console.log(`Technician ${currentJob.assignedTechnician} status reset to ${nextStatus}`);
      }
    }

    // If admin edits customer/vehicle fields after a signature, invalidate it
    const signedFields = [
      "clientName",
      "clientMobileNumber",
      "clientEmail",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "licensePlate",
      "vinNumber",
      "issue",
      "location",
    ];
    const touchesSigned =
      currentJob.customerSignatureUrl &&
      signedFields.some((f) => Object.prototype.hasOwnProperty.call(req.body, f));
    if (touchesSigned) {
      update.customerSignatureUrl = "";
      update.customerSignedAt = null;
      update.customerSignatureInvalidatedAt = new Date();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "location")) {
      const locationStr = String(req.body.location).trim();
      const geo = await resolveJobLocationToGeoPointRequired(locationStr);
      update.location =
        formatGeoPointAsLocationString(geo) || locationStr;
      update.locationCoordinates = geo;
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "clientName") ||
      Object.prototype.hasOwnProperty.call(req.body, "clientMobileNumber")
    ) {
      const merged = {
        clientName: Object.prototype.hasOwnProperty.call(req.body, "clientName")
          ? req.body.clientName
          : currentJob.clientName,
        clientMobileNumber: Object.prototype.hasOwnProperty.call(req.body, "clientMobileNumber")
          ? req.body.clientMobileNumber
          : currentJob.clientMobileNumber,
      };
      Object.assign(update, computeJobSearchFields(merged));
    }

    // $unset cannot be mixed into findByIdAndUpdate plain update object alongside other fields
    // when using a spread of req.body — handle via separate update if needed.
    let job;
    if (update.$unset) {
      const { $unset, ...setFields } = update;
      job = await Job.findByIdAndUpdate(
        req.params.id,
        { $set: setFields, $unset },
        { new: true, runValidators: true }
      )
        .populate('assignedTechnician', 'firstName lastName phone profilePicture')
        .populate('source', 'mainSourceName');
    } else {
      job = await Job.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
        .populate('assignedTechnician', 'firstName lastName phone profilePicture')
        .populate('source', 'mainSourceName');
    }

    const becameCompleted =
      job_status === "completed" && currentJob.job_status !== "completed";
    if (becameCompleted) {
      try {
        const { accruePartnerFromCompletedJob } = require("../../../clicks-shared/services/partnerService");
        await accruePartnerFromCompletedJob(job);
      } catch (partnerErr) {
        console.error("Partner accrual failed:", partnerErr.message);
      }
    }
    
    // Notify technician if newly assigned
    if (isNewTechnicianAssignment && assignedTechnician) {
      try {
        const customerTechApiUrl = process.env.CUSTOMER_TECH_API_URL || 'http://localhost:5001';
        await axios.post(
          `${customerTechApiUrl}/api/sos/notify-technician`,
          { job_id: job._id.toString() },
          { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
        );
        console.log(`Technician ${assignedTechnician} notified about job ${job._id}`);
      } catch (notifyError) {
        console.error('Failed to notify technician:', notifyError.message);
      }
    }

    // Diff like against like: `job` comes back with assignedTechnician populated
    // while `currentJob` holds a raw ObjectId, which otherwise reports a phantom
    // technician reassignment on every update.
    const jobForDiff = job && typeof job.toObject === "function" ? job.toObject() : job;
    if (jobForDiff && jobForDiff.assignedTechnician && jobForDiff.assignedTechnician._id) {
      jobForDiff.assignedTechnician = jobForDiff.assignedTechnician._id;
    }
    const allChanges = computeJobChanges(currentJob, jobForDiff);
    const dispatchKeys = [
      "assignedTechnician",
      "job_status",
      "assigned_at",
    ];
    const cancelKeys = ["job_status", "cancelled_at"];

    if (isBeingCancelled) {
      const cancelChanges = {};
      for (const key of cancelKeys) {
        if (allChanges[key]) cancelChanges[key] = allChanges[key];
      }
      await recordAudit({
        req,
        action: "job.cancel",
        entityType: "job",
        entityId: job._id,
        changes: cancelChanges,
      });
    }

    if (isNewTechnicianAssignment) {
      const dispatchChanges = {};
      for (const key of dispatchKeys) {
        if (allChanges[key]) dispatchChanges[key] = allChanges[key];
      }
      await recordAudit({
        req,
        action: "job.dispatch",
        entityType: "job",
        entityId: job._id,
        changes: dispatchChanges,
      });
    }

    let updateChanges = { ...allChanges };
    if (isBeingCancelled) {
      updateChanges = omitChangeKeys(updateChanges, cancelKeys);
    }
    if (isNewTechnicianAssignment) {
      updateChanges = omitChangeKeys(updateChanges, dispatchKeys);
    }

    if (Object.keys(updateChanges).length > 0) {
      await recordAudit({
        req,
        action: "job.update",
        entityType: "job",
        entityId: job._id,
        changes: updateChanges,
      });
    }

    res.json({ job, signatureCleared: Boolean(touchesSigned) });

  } catch (err) {
    // runValidators surfaces bad enums/casts as ValidationError/CastError —
    // that is a bad request, not a server fault.
    if (err.status === 400) {
      return res.status(400).json({ message: err.message, error: err.message });
    }
    if (err.name === "ValidationError" || err.name === "CastError") {
      return res.status(400).json({ message: "Invalid job update", error: err.message });
    }
    res.status(500).json({ message: "Failed to update job", error: err.message });
  }
}

// DELETE /api/jobs/:id
async function deleteJob(req, res) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await recordAudit({
      req,
      action: "job.delete",
      entityType: "job",
      entityId: job._id,
      changes: {
        clientName: serializeAuditValue(job.clientName),
        clientMobileNumber: serializeAuditValue(job.clientMobileNumber),
        job_status: serializeAuditValue(job.job_status),
        assignedTechnician: serializeAuditValue(job.assignedTechnician),
      },
    });

    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete job", error: err.message });
  }
}

// GET /api/jobs/:id/repairs
async function getJobRepairs(req, res) {
  try {
    const { RepairProcedure } = require("../../../clicks-shared/models");
    const repairs = await RepairProcedure.find({ job_id: req.params.id })
      .populate('technician_id', 'firstName lastName')
      .sort({ created_at: 1 });
    res.json({ repairs });
  } catch (err) {
    res.status(500).json({ message: "Failed to get repairs", error: err.message });
  }
}

// POST /api/jobs/import — bulk import historical jobs from XLSX
async function importJobs(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "No Excel file uploaded. Use form field 'file'." });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ message: "Excel file has no sheets" });
    }
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (!rows.length) {
      return res.status(400).json({ message: "Excel sheet is empty" });
    }

    // Optional preview-only mode (map first N rows without writing)
    if (req.query.preview === "1" || req.query.preview === "true") {
      const previewLimit = Math.min(Number(req.query.limit) || 10, 50);
      const preview = [];
      for (let i = 0; i < Math.min(rows.length, previewLimit); i++) {
        const { doc, error, techName } = mapHistoricalRow(rows[i]);
        preview.push({
          row: i + 2,
          legacy_id: rows[i]?.id ?? null,
          techName,
          error,
          mapped: doc
            ? {
                clientName: doc.clientName,
                clientMobileNumber: doc.clientMobileNumber,
                issue: doc.issue,
                location: doc.location,
                dateTime: doc.dateTime,
                jobType: doc.jobType,
                job_status: doc.job_status,
                price: doc.price,
                payment_method: doc.payment_method || null,
                vehicleModel: doc.vehicleModel,
                licensePlate: doc.licensePlate,
              }
            : null,
        });
      }
      return res.json({ totalRows: rows.length, preview });
    }

    const result = await importHistoricalJobs({
      Job,
      Source,
      Technician,
      rows,
    });

    res.json({
      message: "Import completed",
      totalRows: rows.length,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors.slice(0, 100),
      errorCount: result.errors.length,
    });
  } catch (err) {
    console.error("Job import failed:", err);
    res.status(500).json({ message: "Failed to import jobs", error: err.message });
  }
}

async function applyAdminTechnicianPresence(technicianId, excludeJobId, forceOnJob = false) {
  if (!technicianId) return;
  const nextStatus = forceOnJob
    ? "On Job"
    : await resolveTechnicianStatusAfterJob(technicianId, excludeJobId);
  await setTechnicianStatus(technicianId, nextStatus);
  return nextStatus;
}

// POST /api/jobs/:id/hold
async function holdJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    clearPendingHoldRequest(job, { adminId: req.user?.id });

    await putJobOnHold(job, {
      reason: req.body?.reason,
      scheduledReturnAt: req.body?.scheduled_return_at,
      heldBy: "admin",
    });

    await applyAdminTechnicianPresence(job.assignedTechnician, job._id);

    await recordAudit({
      req,
      action: "job.hold",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("on_hold"),
        hold_reason: serializeAuditValue(job.hold_reason),
        status_before_hold: serializeAuditValue(job.status_before_hold),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Job put on hold",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to put job on hold",
      error: err.message,
    });
  }
}

// POST /api/jobs/:id/resume
async function resumeJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await resumeJobFromHold(job);

    const restoredBusy = TECH_BUSY_JOB_STATUSES.includes(job.job_status);
    await applyAdminTechnicianPresence(job.assignedTechnician, job._id, restoredBusy);

    await recordAudit({
      req,
      action: "job.resume",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue(job.job_status),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Job resumed",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to resume job",
      error: err.message,
    });
  }
}

// POST /api/jobs/:id/hold-request/approve
async function approveHoldRequestJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await approveHoldRequest(job, {
      adminId: req.user?.id,
      scheduledReturnAt: req.body?.scheduled_return_at,
    });

    await applyAdminTechnicianPresence(job.assignedTechnician, job._id);

    await recordAudit({
      req,
      action: "job.hold_request.approve",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("on_hold"),
        hold_reason: serializeAuditValue(job.hold_reason),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Hold request approved",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to approve hold request",
      error: err.message,
    });
  }
}

// POST /api/jobs/:id/hold-request/reject
async function rejectHoldRequestJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await rejectHoldRequest(job, {
      adminId: req.user?.id,
      note: req.body?.note,
    });

    await recordAudit({
      req,
      action: "job.hold_request.reject",
      entityType: "job",
      entityId: job._id,
      changes: {
        hold_request_status: serializeAuditValue("rejected"),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Hold request rejected",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to reject hold request",
      error: err.message,
    });
  }
}

// POST /api/jobs/:id/complete — dispatch override (no payment/signature gate)
async function completeJob(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.job_status === "completed") {
      return res.status(400).json({ message: "Job is already completed" });
    }
    if (job.job_status === "cancelled") {
      return res.status(400).json({ message: "Cannot complete a cancelled job" });
    }
    if (!ADMIN_COMPLETABLE_JOB_STATUSES.includes(job.job_status)) {
      return res.status(400).json({
        message: `Cannot complete job with status: ${job.job_status}`,
      });
    }

    clearPendingHoldRequest(job, { adminId: req.user?.id });

    const notes =
      typeof req.body?.completion_notes === "string"
        ? req.body.completion_notes.trim().slice(0, 2000)
        : "";
    const jobReference =
      typeof req.body?.job_reference === "string"
        ? req.body.job_reference.trim().slice(0, 64)
        : "";

    const prevStatus = job.job_status;
    job.job_status = "completed";
    job.completed_at = new Date();
    if (notes) job.completion_notes = notes;
    if (jobReference) job.job_reference = jobReference;
    if (prevStatus === "on_hold" || job.hold_reason) {
      job.status_before_hold = null;
      job.hold_reason = "";
      job.scheduled_return_at = null;
    }

    await job.save();

    try {
      const { creditTechnicianForJob } = require("../../../clicks-shared/services/technicianCredit");
      await creditTechnicianForJob(job);
    } catch (creditErr) {
      console.error("Admin complete: technician credit failed:", creditErr.message);
    }

    if (job.payment_status === "paid") {
      try {
        const { RepairProcedure, Receipt } = require("../../../clicks-shared/models");
        const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
        const existing = await Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
        if (!existing) {
          const repairs = await RepairProcedure.find({ job_id: job._id });
          const pricing = computeJobPricing(job, repairs);
          await Receipt.create({
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
          });
        }
      } catch (receiptErr) {
        console.error("Admin complete: receipt creation failed:", receiptErr.message);
      }
    }

    try {
      const { accruePartnerFromCompletedJob } = require("../../../clicks-shared/services/partnerService");
      const populatedForPartner = await Job.findById(job._id).populate("source", "mainSourceName");
      await accruePartnerFromCompletedJob(populatedForPartner);
    } catch (partnerErr) {
      console.error("Partner accrual failed:", partnerErr.message);
    }

    await applyAdminTechnicianPresence(job.assignedTechnician, job._id);

    await recordAudit({
      req,
      action: "job.complete",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("completed"),
        completed_at: serializeAuditValue(job.completed_at),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Job marked as completed",
      job: populated,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to complete job",
      error: err.message,
    });
  }
}

module.exports = {
  getJobs,
  createJob,
  getJobById,
  updateJob,
  deleteJob,
  getJobRepairs,
  importJobs,
  holdJob,
  resumeJob,
  approveHoldRequestJob,
  rejectHoldRequestJob,
  completeJob,
};
