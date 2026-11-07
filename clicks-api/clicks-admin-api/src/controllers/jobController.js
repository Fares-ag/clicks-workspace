const Job = require("../models/Job");
const Technician = require("../models/Technician");
const Source = require("../models/Source");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const xlsx = require("xlsx");
const { postToTechApi } = require("../utils/techApiNotify");
const { notifyCustomerSafe } = require("../../../clicks-shared/services/notifyCustomer");
const {
  mapHistoricalRow,
  importHistoricalJobs,
} = require("../../../clicks-shared/utils/historicalJobImport");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../../../clicks-shared/utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../../../clicks-shared/utils/parseJobLocation");
const { createJobRecord } = require("../../../clicks-shared/services/createJobRecord");
const { applyCanonicalJobFields } = require("../../../clicks-shared/utils/dataCleaning");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const {
  putJobOnHold,
  resumeJobFromHold,
  resolveTechnicianStatusAfterJob,
  approveHoldRequest,
  rejectHoldRequest,
  clearPendingHoldRequest,
  holdCustomerPayload,
  resumeCustomerPayload,
} = require("../../../clicks-shared/services/jobHold");
const {
  sendJobToGarage,
  markGarageReady,
  assertCanResume,
  garageCustomerPayload,
} = require("../../../clicks-shared/services/jobGarage");
const { TECH_BUSY_JOB_STATUSES, ADMIN_COMPLETABLE_JOB_STATUSES } = require("../../../clicks-shared/constants/jobStatuses");
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
const {
  buildAdminJobListFilters,
  buildAdminJobStatsBaseFilters,
} = require("../../../clicks-shared/utils/adminJobListFilters");
const { ONGOING_JOB_STATUSES } = require("../../../clicks-shared/constants/jobStatuses");
const {
  COMPLETED,
  sumCompletedRevenue,
} = require("../../../clicks-shared/utils/dashboardRevenue");
const { startOfQatarDay, endOfQatarDay } = require("../utils/qatarDay");
const { reassignJob: reassignJobRecord } = require("../../../clicks-shared/services/jobReassign");
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

function mergeJobQueries(base, extra) {
  if (!base || Object.keys(base).length === 0) return { ...extra };
  return { $and: [base, extra] };
}

function applyJobSearchToQuery(query, search) {
  if (!str(search).trim()) return query;
  const searchFilter = buildPrefixSearchFilter(search, {
    phoneField: "search_phone",
    nameField: "search_name",
    businessNameField: "businessName",
  });
  if (!searchFilter) return query;
  const term = str(search, { maxLength: 64 }).trim();
  const clauses = searchFilter.$or ? [...searchFilter.$or] : [searchFilter];
  if (term) {
    clauses.push({ job_reference: new RegExp(`^${escapeRegex(term)}`, "i") });
  }
  const searchClause = { $or: clauses };
  if (Object.keys(query).length) {
    return { $and: [query, searchClause] };
  }
  return searchClause;
}

// GET /api/jobs/stats — KPI counts for the job list (respects date/search filters)
async function getJobListStats(req, res) {
  try {
    const { search = "" } = req.query;
    const needsTechRoster = Boolean(
      str(req.query.technician).trim() || str(req.query.technicianId).trim()
    );
    const techRosterForFilter = needsTechRoster ? await getSlimTechnicianRoster() : [];

    const { query: baseQuery, filterKeyParts } = buildAdminJobStatsBaseFilters(
      req.query,
      { techRoster: techRosterForFilter }
    );
    const query = applyJobSearchToQuery({ ...baseQuery }, search);
    const hasDateFilter = Boolean(
      str(req.query.dateFrom).trim() || str(req.query.dateTo).trim()
    );
    const cacheKey = `clicks:admin:payload:job-stats:${str(search)}|${filterKeyParts.join(",")}`;

    const payload = await getCachedPayload(cacheKey, 15000, async () => {
      const count = (extra) =>
        cachedCount(Job, mergeJobQueries(query, extra), {
          ttlMs: 15000,
          key: `${cacheKey}:${JSON.stringify(extra)}`,
        });

      const [
        pending,
        ongoing,
        onHold,
        cancelled,
        atGarage,
        returning,
      ] = await Promise.all([
        count({ job_status: "pending" }),
        count({ job_status: { $in: ONGOING_JOB_STATUSES } }),
        count({ job_status: "on_hold" }),
        count({ job_status: "cancelled" }),
        count({ "garage.phase": "at_garage" }),
        count({ "garage.phase": "returning" }),
      ]);

      let completedToday;
      let revenueToday;
      if (hasDateFilter) {
        completedToday = await count({ job_status: { $in: COMPLETED } });
        revenueToday = await sumCompletedRevenue(Job, query);
      } else {
        const todayStart = startOfQatarDay();
        const todayEnd = endOfQatarDay();
        completedToday = await count({
          job_status: { $in: COMPLETED },
          completed_at: { $gte: todayStart, $lte: todayEnd },
        });
        revenueToday = await sumCompletedRevenue(Job, {
          ...query,
          completed_at: { $gte: todayStart, $lte: todayEnd },
        });
      }

      return {
        scopedByFilters: hasDateFilter || filterKeyParts.length > 0,
        scopedByDate: hasDateFilter,
        jobs: {
          pending,
          ongoing,
          onHold,
          cancelled,
          atGarage,
          returning,
          completedToday,
        },
        earnings: {
          today: revenueToday,
          currency: "QAR",
        },
      };
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job stats", error: err.message });
  }
}

// GET /api/jobs
async function getJobs(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const limitNum = capAdminLimit(limit, 10, 100);

    const needsTechRoster = Boolean(
      str(req.query.technician).trim() || str(req.query.technicianId).trim()
    );
    const techRosterForFilter = needsTechRoster ? await getSlimTechnicianRoster() : [];

    const {
      query: filterQuery,
      filterKeyParts,
      hasListFilters,
    } = buildAdminJobListFilters(req.query, { techRoster: techRosterForFilter });

    let query = { ...filterQuery };

    if (search) {
      query = applyJobSearchToQuery(query, search);
    }

    const hasFilter = Boolean(str(search).trim() || hasListFilters);
    const countKey = `admin_jobs:${str(search)}|${filterKeyParts.join(",")}`;
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
    // Through the outbox (5 s timeout, retried; scenario 68).
    const notifyTechnicianFn = async (jobId) => {
      await postToTechApi("/api/sos/notify-technician", { job_id: String(jobId) });
    };

    const { populatedJob } = await createJobRecord(req.body, {
      notifyTechnicianFn: req.body.assignedTechnician
        ? notifyTechnicianFn
        : undefined,
      // SOS jobs: the dispatcher must hold the SOS claim (atomic link).
      adminId: req.user?.id || req.user?._id,
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
      ...(err.code ? { code: err.code } : {}),
      ...(err.job_id ? { job_id: err.job_id } : {}),
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
        select: "firstName lastName phone profilePicture currentStatus assignedVehicle currentLocation lastLocationAt",
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
      .populate("reassignment_history.from_technician", "firstName lastName")
      .populate("reassignment_history.to_technician", "firstName lastName")
      .populate("reassignment_history.reassigned_by", "firstName lastName email")
      .lean();

    let archived = false;
    if (!job) {
      job = await JobArchive.findById(req.params.id)
        .populate({
          path: "assignedTechnician",
          select: "firstName lastName phone profilePicture currentStatus assignedVehicle currentLocation lastLocationAt",
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

    // Terminal transitions have dedicated endpoints that run the shared
    // services (SOS outcome, ServiceRequest state, notifications, refund
    // decision). A generic PUT skipped all of that (scenarios 50, 51).
    if (
      (job_status === "cancelled" || job_status === "completed") &&
      job_status !== currentJob.job_status
    ) {
      return res.status(400).json({
        message:
          job_status === "cancelled"
            ? "Use POST /api/jobs/:id/cancel to cancel a job"
            : "Use POST /api/jobs/:id/complete to complete a job",
        code: "USE_DEDICATED_ENDPOINT",
      });
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

    const priorTechId = currentJob.assignedTechnician
      ? String(currentJob.assignedTechnician._id || currentJob.assignedTechnician)
      : "";
    const nextTechRaw = Object.prototype.hasOwnProperty.call(req.body, "assignedTechnician")
      ? req.body.assignedTechnician
      : undefined;
    if (nextTechRaw !== undefined && priorTechId) {
      const nextTechId = nextTechRaw ? String(nextTechRaw) : "";
      if (nextTechId !== priorTechId) {
        return res.status(400).json({
          message:
            "Use POST /api/jobs/:id/reassign to move this job to another technician",
        });
      }
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

    // Cancellation is rejected above (POST /api/jobs/:id/cancel owns it);
    // kept as a constant so the audit split below stays unchanged.
    const isBeingCancelled = false;

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
      update.issue != null ||
      update.vehicleMake != null ||
      update.vehicleModel != null ||
      update.jobType != null ||
      update.licensePlate != null
    ) {
      const cleaned = {
        issue: update.issue != null ? update.issue : currentJob.issue,
        vehicleMake: update.vehicleMake != null ? update.vehicleMake : currentJob.vehicleMake,
        vehicleModel: update.vehicleModel != null ? update.vehicleModel : currentJob.vehicleModel,
        vehicleYear: update.vehicleYear != null ? update.vehicleYear : currentJob.vehicleYear,
        jobType: update.jobType != null ? update.jobType : currentJob.jobType,
        licensePlate: update.licensePlate != null ? update.licensePlate : currentJob.licensePlate,
      };
      applyCanonicalJobFields(cleaned);
      if (update.issue != null) update.issue = cleaned.issue;
      if (update.vehicleMake != null || update.vehicleModel != null) {
        update.vehicleMake = cleaned.vehicleMake;
        update.vehicleModel = cleaned.vehicleModel;
        if (cleaned.vehicleYear != null) update.vehicleYear = cleaned.vehicleYear;
      }
      if (update.jobType != null) update.jobType = cleaned.jobType;
      if (update.licensePlate != null) update.licensePlate = cleaned.licensePlate;
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
      await postToTechApi("/api/sos/notify-technician", { job_id: job._id.toString() });
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

// POST /api/jobs/:id/cancel
//
// Dispatcher cancel (scenarios 50, 51). Runs the shared cancel service — the
// same one the customer and technician paths use — so the SOS outcome, the
// ServiceRequest state and the technician's presence are all updated, then
// tells the customer and technician through the customer/tech API.
// A PAID job needs { refund: "full"|"partial"|"none", refund_amount?, reason }.
async function cancelJobByAdmin(req, res) {
  try {
    const { cancelJob } = require("../../../clicks-shared/services/cancelJob");
    const { callInternalNotify } = require("../../../clicks-shared/services/jobReassign");
    const body = req.body || {};
    const reason = str(body.reason, { maxLength: 500 }).trim();
    if (!reason) {
      return res.status(400).json({
        message: "A cancellation reason is required",
        code: "CANCEL_REASON_REQUIRED",
      });
    }
    const refundDecision = str(body.refund || body.refund_decision, { maxLength: 16 }).trim();
    // Refund decisions move money: Super Admin / Admin only. Without one the
    // service refuses a paid job, so dispatchers can't cancel paid jobs.
    const { FULL_ACCESS } = require("../middleware/rbac");
    if (refundDecision && !FULL_ACCESS.has(req.user?.role)) {
      return res.status(403).json({
        message: "Only an Admin can cancel a paid job with a refund decision",
        code: "REFUND_DECISION_FORBIDDEN",
      });
    }

    const result = await cancelJob({
      jobId: req.params.id,
      actor: "admin",
      actorId: req.user?.id || req.user?._id,
      reason,
      refund: refundDecision
        ? {
            decision: refundDecision,
            amount: body.refund_amount,
            reason: str(body.refund_reason, { maxLength: 1000 }).trim() || reason,
          }
        : undefined,
    });

    if (result.alreadyCancelled) {
      return res.json({
        message: "Job already cancelled",
        job: result.job,
        already_cancelled: true,
      });
    }

    // cancelJob already told the customer (notifyCustomer -> outbox). The
    // tech API still tells the technician and refreshes the Live Map.
    await callInternalNotify("/api/sos/notify-job-cancelled", {
      job_id: String(result.job._id),
      customer_id: result.job.customer_id ? String(result.job.customer_id) : null,
      technician_id: result.technicianId,
      technician_status: result.technicianNextStatus,
      payload: result.payload,
    });

    await recordAudit({
      req,
      action: "job.cancel",
      entityType: "job",
      entityId: result.job._id,
      changes: {
        job_status: { from: result.before.job_status, to: "cancelled" },
        cancelled_at: { from: null, to: serializeAuditValue(result.job.cancelled_at) },
        cancellation_reason: { from: "", to: reason },
        ...(result.refund
          ? {
              refund_decision: { from: null, to: result.refund.decision },
              refund_amount: { from: null, to: result.refund.amount },
              refund_reason: { from: "", to: result.refund.reason },
            }
          : {}),
      },
    });

    const job = await Job.findById(result.job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");
    res.json({
      message: "Job cancelled",
      job,
      refund: result.refund || null,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("Admin cancel failed:", err);
    res.status(status).json({
      message: err.message || "Failed to cancel job",
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
  }
}

// POST /api/jobs/:id/reassign
async function reassignJob(req, res) {
  try {
    const technicianId = req.body?.technician_id || req.body?.technicianId;
    const reason = req.body?.reason;
    const reasonNote = req.body?.reason_note || req.body?.reasonNote || "";

    const result = await reassignJobRecord({
      jobId: req.params.id,
      technicianId,
      reason,
      reasonNote,
      adminId: req.user?.id || req.user?._id,
    });

    const job = await Job.findById(result.job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("reassignment_history.from_technician", "firstName lastName")
      .populate("reassignment_history.to_technician", "firstName lastName")
      .populate("source", "mainSourceName");

    await recordAudit({
      req,
      action: "job.reassign",
      entityType: "job",
      entityId: job._id,
      changes: {
        from_technician: serializeAuditValue(result.fromTechnicianId),
        to_technician: serializeAuditValue(result.toTechnicianId),
        reason: serializeAuditValue(result.reason),
        reason_note: serializeAuditValue(result.reasonNote),
      },
    });

    res.json({
      message: "Job reassigned successfully",
      job,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to reassign job",
      error: err.message,
    });
  }
}

// DELETE /api/jobs/:id
/**
 * Soft delete: the job moves to the archive collection (still readable via
 * GET /api/jobs/:id) with deleted_at/deleted_by, instead of being destroyed.
 * Refused once money is involved — a paid or refunded job, or one with a card
 * checkout still open, stays in the books; cancel or refund it instead.
 */
async function deleteJob(req, res) {
  try {
    const { PaymentAttempt } = require("../../../clicks-shared/models");
    const JobArchive = require("../../../clicks-shared/models/JobArchive");
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (["paid", "partially_refunded", "refunded"].includes(job.payment_status)) {
      return res.status(409).json({
        message: "A paid job cannot be deleted. Cancel or refund it instead.",
        code: "JOB_PAID",
      });
    }
    const moneyAttempt = await PaymentAttempt.exists({
      job_id: job._id,
      status: { $in: ["pending", "paid", "partially_refunded", "refunded"] },
    });
    if (moneyAttempt) {
      return res.status(409).json({
        message: "This job has a card payment on record and cannot be deleted.",
        code: "JOB_HAS_PAYMENT",
      });
    }

    const archived = job.toObject();
    archived.deleted_at = new Date();
    archived.deleted_by = req.user?.id || null;
    const session = await Job.db.startSession();
    try {
      await session.withTransaction(async () => {
        await JobArchive.create([archived], { session });
        await Job.deleteOne({ _id: job._id }, { session });
      });
    } catch (txnErr) {
      const { isReplicaSetTransactionError } = require("../../../clicks-shared/utils/mongoTransactions");
      if (!isReplicaSetTransactionError(txnErr)) throw txnErr;
      await JobArchive.create(archived);
      await Job.deleteOne({ _id: job._id });
    } finally {
      await session.endSession();
    }

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
        soft_deleted: true,
      },
    });

    res.json({ message: "Job deleted", archived: true });
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

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobOnHold", holdCustomerPayload(job));
    }

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

    assertCanResume(job);
    await resumeJobFromHold(job);

    const restoredBusy = TECH_BUSY_JOB_STATUSES.includes(job.job_status);
    await applyAdminTechnicianPresence(job.assignedTechnician, job._id, restoredBusy);

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobResumed", resumeCustomerPayload(job));
    }

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

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobOnHold", holdCustomerPayload(job));
    }

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

    const set = {};
    if (job.hold_request?.status) set.hold_request = job.hold_request;
    if (notes) set.completion_notes = notes;
    if (jobReference) set.job_reference = jobReference;
    if (job.job_status === "on_hold" || job.hold_reason) {
      set.status_before_hold = null;
      set.hold_reason = "";
      set.scheduled_return_at = null;
    }

    // Same money path as the technician: credit, receipt, membership
    // consumption, zero-due → paid by membership, partner accrual via outbox.
    const { completeJob: completeJobService } = require("../../../clicks-shared/services/completeJob");
    const { isCompletionCasMiss } = require("../../../clicks-shared/utils/mongoTransactions");
    let completed;
    try {
      // completeJob notifies the customer (jobCompleted), so an admin
      // completion reaches them like a technician's (scenario 76).
      completed = await completeJobService({
        jobId: job._id,
        fromStatuses: [job.job_status],
        set,
        completedBy: "admin",
      });
    } catch (completeErr) {
      if (isCompletionCasMiss(completeErr)) {
        const current = await Job.findById(job._id);
        return res.status(409).json({
          message: `Job changed while completing (now ${current?.job_status || "missing"})`,
        });
      }
      throw completeErr;
    }

    await applyAdminTechnicianPresence(completed.job.assignedTechnician, completed.job._id);

    await recordAudit({
      req,
      action: "job.complete",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("completed"),
        completed_at: serializeAuditValue(completed.job.completed_at),
        payment_status: serializeAuditValue(completed.job.payment_status),
        payment_method: serializeAuditValue(completed.job.payment_method),
      },
    });

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({
      message: "Job marked as completed",
      job: populated,
      receipt: completed.receipt,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to complete job",
      error: err.message,
    });
  }
}

async function sendAdminJobToGarage(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    clearPendingHoldRequest(job, { adminId: req.user?.id });
    await sendJobToGarage(job, {
      reason: req.body?.reason,
      garageName: req.body?.garage_name,
      expectedReadyAt: req.body?.expected_ready_at,
      heldBy: "admin",
    });

    await applyAdminTechnicianPresence(job.assignedTechnician, job._id);

    await recordAudit({
      req,
      action: "job.garage",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("on_hold"),
        "garage.phase": serializeAuditValue("at_garage"),
        hold_reason: serializeAuditValue(job.hold_reason),
      },
    });

    // Inbox + push + socket (scenario 52: this used to be socket-only).
    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobAtGarage", garageCustomerPayload(job, "at_garage"));
    }

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({ message: "Job sent to garage", job: populated });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to send job to garage",
      error: err.message,
    });
  }
}

async function markAdminGarageReady(req, res) {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await markGarageReady(job);
    await applyAdminTechnicianPresence(job.assignedTechnician, job._id, true);

    await recordAudit({
      req,
      action: "job.garage_ready",
      entityType: "job",
      entityId: job._id,
      changes: {
        job_status: serializeAuditValue("accepted"),
        "garage.phase": serializeAuditValue("returning"),
      },
    });

    if (job.customer_id) {
      await notifyCustomerSafe(job.customer_id, "jobGarageReady", garageCustomerPayload(job, "returning"));
    }

    const populated = await Job.findById(job._id)
      .populate("assignedTechnician", "firstName lastName phone profilePicture")
      .populate("source", "mainSourceName");

    res.json({ message: "Garage marked ready", job: populated });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to mark garage ready",
      error: err.message,
    });
  }
}

module.exports = {
  getJobs,
  getJobListStats,
  createJob,
  getJobById,
  updateJob,
  cancelJobByAdmin,
  reassignJob,
  deleteJob,
  getJobRepairs,
  importJobs,
  holdJob,
  resumeJob,
  approveHoldRequestJob,
  rejectHoldRequestJob,
  completeJob,
  sendAdminJobToGarage,
  markAdminGarageReady,
};
