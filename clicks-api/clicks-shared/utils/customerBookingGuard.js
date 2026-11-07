const Job = require("../models/Job");
const { SETTLED_PAYMENT_STATUSES } = require("../constants/jobStatuses");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const RepairProcedure = require("../models/RepairProcedure");
const { TECH_SESSION_ACTIVE_STATUSES } = require("../constants/jobStatuses");
const { computeJobPricing } = require("./jobPricing");

/**
 * A scheduled booking only becomes the customer's "active session" this long
 * before its slot (scenario 55). Before that Home shows an Upcoming card.
 */
const SCHEDULED_ACTIVE_WINDOW_MS = 60 * 60 * 1000;

const TERMINAL_JOB_STATUSES = ["completed", "cancelled"];

const SESSION_JOB_POPULATE = [
  {
    path: "assignedTechnician",
    select: "firstName lastName phone profilePicture currentLocation currentStatus",
  },
  {
    path: "customer_vehicle_id",
    populate: [
      { path: "vehicle_make" },
      { path: "vehicle_model" },
    ],
  },
  { path: "source" },
];

const VEHICLE_POPULATE = {
  path: "customer_vehicle_id",
  populate: [
    { path: "vehicle_make" },
    { path: "vehicle_model" },
  ],
};

function bookingError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function findUnpaidJob(customerId) {
  if (!customerId) return Promise.resolve(null);
  return Job.findOne({
    customer_id: customerId,
    job_status: "completed",
    payment_status: { $nin: SETTLED_PAYMENT_STATUSES },
  }).sort({ createdAt: -1 });
}

/**
 * Live job filter. A `pending` job (created by dispatch with no technician
 * yet) is live too — otherwise the customer lands on Home with nothing
 * showing and raises a second SOS (scenario 45). A pending job for a future
 * slot only becomes live inside the scheduled window.
 */
function liveJobFilter(customerId, now = new Date()) {
  const horizon = new Date(now.getTime() + SCHEDULED_ACTIVE_WINDOW_MS);
  return {
    customer_id: customerId,
    $or: [
      { job_status: { $in: TECH_SESSION_ACTIVE_STATUSES } },
      {
        job_status: "pending",
        $or: [{ dateTime: { $lte: horizon } }, { dateTime: null }],
      },
    ],
  };
}

function findLiveJob(customerId) {
  if (!customerId) return Promise.resolve(null);
  return Job.findOne(liveJobFilter(customerId)).sort({ createdAt: -1 });
}

function findActiveSos(customerId) {
  if (!customerId) return Promise.resolve(null);
  return SOSRequest.findOne({
    customer_id: customerId,
    status: { $in: ["pending", "in_call"] },
  }).sort({ createdAt: -1 });
}

function isFarFutureScheduled(sr, now = Date.now()) {
  if (!sr) return false;
  const isScheduled = sr.timing === "scheduled" || !!sr.scheduled_for;
  if (!isScheduled || !sr.scheduled_for) return false;
  return new Date(sr.scheduled_for).getTime() - now > SCHEDULED_ACTIVE_WINDOW_MS;
}

/**
 * Open (pending/assigned) requests whose linked job is NOT finished.
 * A request whose job already completed or was cancelled is healed to the
 * matching terminal state on the way past (scenario 54 — rows written before
 * the terminal-state fix existed).
 */
async function openServiceRequests(customerId, { limit = 20 } = {}) {
  const rows = await ServiceRequest.find({
    customer_id: customerId,
    status: { $in: ["pending", "assigned"] },
  })
    .sort({ createdAt: -1 })
    .limit(limit);
  if (!rows.length) return [];

  const jobIds = rows.map((r) => r.job_id).filter(Boolean);
  const finished = new Map();
  if (jobIds.length) {
    const jobs = await Job.find({
      _id: { $in: jobIds },
      job_status: { $in: TERMINAL_JOB_STATUSES },
    })
      .select("_id job_status")
      .lean();
    for (const j of jobs) finished.set(String(j._id), j.job_status);
  }

  const open = [];
  for (const row of rows) {
    const finishedStatus = row.job_id ? finished.get(String(row.job_id)) : null;
    if (finishedStatus) {
      const { markServiceRequestForJob } = require("../services/serviceRequestLifecycle");
      markServiceRequestForJob(row.job_id, finishedStatus).catch((err) => {
        console.error("[booking-guard] heal service request failed:", err.message);
      });
      continue;
    }
    open.push(row);
  }
  return open;
}

/**
 * The request that should drive the session: immediate requests, and
 * scheduled ones only from SCHEDULED_ACTIVE_WINDOW_MS before their slot.
 */
async function findActiveServiceRequest(customerId) {
  if (!customerId) return null;
  const open = await openServiceRequests(customerId);
  const now = Date.now();
  return open.find((sr) => !isFarFutureScheduled(sr, now)) || null;
}

/** Scheduled bookings that are still open (for Home / Activity / dispatch). */
async function upcomingBookingsForCustomer(customerId) {
  if (!customerId) return [];
  const open = await openServiceRequests(customerId);
  return open
    .filter((sr) => sr.timing === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.scheduled_for || 0).getTime() -
        new Date(b.scheduled_for || 0).getTime()
    )
    .map((sr) => (typeof sr.toObject === "function" ? sr.toObject() : sr));
}

function liveJobVehicleId(job) {
  if (!job) return null;
  const vehicle = job.customer_vehicle_id;
  if (vehicle == null) return null;
  if (typeof vehicle === "object" && vehicle._id != null) {
    return String(vehicle._id);
  }
  return String(vehicle);
}

/**
 * What the customer still owes on completed-but-unpaid jobs (scenario 91).
 * Shown on the SOS (dispatch collects it) — never a reason to refuse help.
 */
async function outstandingBalanceForCustomer(customerId) {
  if (!customerId) return { outstanding_balance: 0, outstanding_job_ids: [] };
  const jobs = await Job.find({
    customer_id: customerId,
    job_status: "completed",
    payment_status: { $nin: SETTLED_PAYMENT_STATUSES },
  })
    .select("_id price distance_km dateTime")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  if (!jobs.length) return { outstanding_balance: 0, outstanding_job_ids: [] };

  const repairs = await RepairProcedure.find({
    job_id: { $in: jobs.map((j) => j._id) },
  })
    .select("job_id price cost quantity")
    .lean();
  const byJob = new Map();
  for (const r of repairs) {
    const key = String(r.job_id);
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key).push(r);
  }

  let total = 0;
  for (const job of jobs) {
    const pricing = computeJobPricing(job, byJob.get(String(job._id)) || []);
    total += Number(pricing?.total) || 0;
  }
  return {
    outstanding_balance: Math.round(total * 100) / 100,
    outstanding_job_ids: jobs.map((j) => j._id),
  };
}

/**
 * Service bookings.
 *
 * - immediate: one live job per customer, and no unpaid completed job.
 * - scheduled: future work may be booked for any vehicle that has no live
 *   job (scenario 56); an unpaid job still blocks it.
 */
async function assertCustomerCanBook({
  customerId,
  timing = "immediate",
  customerVehicleId,
} = {}) {
  const live = await findLiveJob(customerId);
  if (live) {
    const blockedVehicleId = liveJobVehicleId(live);
    const sameVehicle =
      blockedVehicleId &&
      customerVehicleId &&
      String(customerVehicleId) === blockedVehicleId;
    if (timing !== "scheduled" || sameVehicle) {
      throw bookingError(
        sameVehicle && timing === "scheduled"
          ? "This vehicle already has an active job. Choose another vehicle."
          : "You already have an active job",
        409,
        sameVehicle && timing === "scheduled"
          ? "LIVE_JOB_VEHICLE_ACTIVE"
          : "LIVE_JOB_ACTIVE"
      );
    }
  }
  const unpaid = await findUnpaidJob(customerId);
  if (unpaid) {
    throw bookingError(
      "A previous job is still unpaid",
      409,
      "UNPAID_JOB_HOLD"
    );
  }
  return true;
}

/**
 * SOS may run alongside a live job when it is for a different vehicle (or
 * skip vehicle). An unpaid old job never blocks an emergency (scenario 91,
 * by decision) — the balance is stamped on the SOS instead.
 */
async function assertCustomerCanCreateSos({
  customerId,
  customerVehicleId,
  skipVehicle,
} = {}) {
  const live = await findLiveJob(customerId);
  if (!live || skipVehicle) return true;

  const blockedVehicleId = liveJobVehicleId(live);
  if (
    blockedVehicleId &&
    customerVehicleId &&
    String(customerVehicleId) === blockedVehicleId
  ) {
    throw bookingError(
      "This vehicle already has an active job. Choose another vehicle or skip vehicle for SOS.",
      409,
      "LIVE_JOB_VEHICLE_ACTIVE"
    );
  }
  return true;
}

function garagePhase(job) {
  return job?.garage?.phase ? String(job.garage.phase) : "";
}

function sessionKind({ activeSos, liveJob, unpaidJob, activeServiceRequest }) {
  if (activeSos?.status === "pending") return "pending_sos";
  if (activeSos?.status === "in_call") return "in_call";
  const phase = garagePhase(liveJob);
  if (phase === "at_garage") return "at_garage";
  if (phase === "returning") return "returning";
  if (liveJob?.job_status) return liveJob.job_status;
  if (unpaidJob) return "unpaid";
  if (
    activeServiceRequest &&
    (activeServiceRequest.timing === "scheduled" ||
      activeServiceRequest.scheduled_for)
  ) {
    return "scheduled";
  }
  if (activeServiceRequest) return "service_request";
  return null;
}

/** Rating prompts look back this far (a job finished last month is not asked about). */
const RATING_PROMPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The most recent paid, unrated job the app has not yet asked about
 * (scenario 76). The app prompts once and records rating_prompted_at.
 */
async function findRatingPromptJob(customerId) {
  return Job.findOne({
    customer_id: customerId,
    job_status: "completed",
    payment_status: { $in: SETTLED_PAYMENT_STATUSES },
    $and: [
      { $or: [{ rating: null }, { rating: { $exists: false } }] },
      { $or: [{ rating_prompted_at: null }, { rating_prompted_at: { $exists: false } }] },
    ],
    completed_at: { $gte: new Date(Date.now() - RATING_PROMPT_WINDOW_MS) },
  })
    .select("_id job_reference issue completed_at assignedTechnician payment_status")
    .populate({ path: "assignedTechnician", select: "firstName lastName profilePicture" })
    .sort({ completed_at: -1 })
    .lean();
}

async function buildCustomerSession({ customerId } = {}) {
  const { getSupportPhone } = require("../services/opsSettings");
  const { customerCancelPolicy } = require("./customerCancelPolicy");
  const [
    activeSos,
    liveJob,
    unpaidJob,
    activeServiceRequest,
    upcoming,
    outstanding,
    supportPhone,
    ratingPromptJob,
  ] = await Promise.all([
    findActiveSos(customerId).then((doc) =>
      doc ? doc.populate(VEHICLE_POPULATE) : null
    ),
    findLiveJob(customerId).then((doc) =>
      doc ? doc.populate(SESSION_JOB_POPULATE) : null
    ),
    findUnpaidJob(customerId).then((doc) =>
      doc ? doc.populate(SESSION_JOB_POPULATE) : null
    ),
    findActiveServiceRequest(customerId).then((doc) =>
      doc ? doc.populate(VEHICLE_POPULATE) : null
    ),
    upcomingBookingsForCustomer(customerId),
    outstandingBalanceForCustomer(customerId),
    getSupportPhone().catch(() => null),
    findRatingPromptJob(customerId).catch(() => null),
  ]);

  const activeId = activeServiceRequest ? String(activeServiceRequest._id) : null;
  const upcomingBookings = upcoming.filter((sr) => String(sr._id) !== activeId);

  return {
    session_kind: sessionKind({
      activeSos,
      liveJob,
      unpaidJob,
      activeServiceRequest,
    }),
    live_job: liveJob,
    unpaid_job: unpaidJob,
    active_sos: activeSos,
    active_job: liveJob || unpaidJob,
    active_service_request: activeServiceRequest,
    // Scheduled bookings outside the active window: Home shows the first as
    // an "Upcoming booking" card instead of opening the waiting screen.
    upcoming_booking: upcomingBookings[0] || null,
    upcoming_bookings: upcomingBookings,
    has_active_session: !!(
      activeSos ||
      liveJob ||
      unpaidJob ||
      activeServiceRequest
    ),
    // An unpaid balance no longer blocks an SOS; it is shown instead.
    can_book_sos: !activeSos,
    outstanding_balance: outstanding.outstanding_balance,
    outstanding_job_ids: outstanding.outstanding_job_ids,
    support_phone: supportPhone || null,
    sos_blocked_vehicle_id: liveJob ? liveJobVehicleId(liveJob) : null,
    // Fee note next to Cancel, from the rule the cancel endpoint enforces (S63).
    cancel_policy: liveJob ? customerCancelPolicy(liveJob) : null,
    // Paid, unrated, not yet asked: the app asks once on resume (S76).
    rating_prompt_job: ratingPromptJob || null,
  };
}

module.exports = {
  SCHEDULED_ACTIVE_WINDOW_MS,
  findUnpaidJob,
  findLiveJob,
  liveJobFilter,
  findActiveSos,
  findActiveServiceRequest,
  upcomingBookingsForCustomer,
  outstandingBalanceForCustomer,
  assertCustomerCanBook,
  assertCustomerCanCreateSos,
  liveJobVehicleId,
  buildCustomerSession,
  findRatingPromptJob,
  sessionKind,
  bookingError,
};
