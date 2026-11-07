const Job = require("../models/Job");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const { TECH_SESSION_ACTIVE_STATUSES } = require("../constants/jobStatuses");

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
    payment_status: { $ne: "paid" },
  }).sort({ createdAt: -1 });
}

function findLiveJob(customerId) {
  if (!customerId) return Promise.resolve(null);
  return Job.findOne({
    customer_id: customerId,
    job_status: { $in: TECH_SESSION_ACTIVE_STATUSES },
  }).sort({ createdAt: -1 });
}

function findActiveSos(customerId) {
  if (!customerId) return Promise.resolve(null);
  return SOSRequest.findOne({
    customer_id: customerId,
    status: { $in: ["pending", "in_call"] },
  }).sort({ createdAt: -1 });
}

function findActiveServiceRequest(customerId) {
  if (!customerId) return Promise.resolve(null);
  return ServiceRequest.findOne({
    customer_id: customerId,
    status: { $in: ["pending", "assigned"] },
  }).sort({ createdAt: -1 });
}

function upcomingBookingsForCustomer(customerId) {
  if (!customerId) return Promise.resolve([]);
  return ServiceRequest.find({
    customer_id: customerId,
    timing: "scheduled",
    status: { $in: ["pending", "assigned"] },
  })
    .sort({ scheduled_for: 1 })
    .limit(20)
    .lean();
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

async function assertCustomerCanBook({ customerId } = {}) {
  const live = await findLiveJob(customerId);
  if (live) {
    throw bookingError(
      "You already have an active job",
      409,
      "LIVE_JOB_ACTIVE"
    );
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
 * SOS may run alongside a live job when it is for a different vehicle (or skip vehicle).
 * Service bookings still use assertCustomerCanBook (one live job per customer).
 */
async function assertCustomerCanCreateSos({
  customerId,
  customerVehicleId,
  skipVehicle,
} = {}) {
  const unpaid = await findUnpaidJob(customerId);
  if (unpaid) {
    throw bookingError(
      "A previous job is still unpaid",
      409,
      "UNPAID_JOB_HOLD"
    );
  }

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

async function buildCustomerSession({ customerId } = {}) {
  const [activeSos, liveJob, unpaidJob, activeServiceRequest] = await Promise.all([
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
  ]);

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
    has_active_session: !!(
      activeSos ||
      liveJob ||
      unpaidJob ||
      activeServiceRequest
    ),
    can_book_sos: !unpaidJob && !activeSos,
    sos_blocked_vehicle_id: liveJob ? liveJobVehicleId(liveJob) : null,
  };
}

module.exports = {
  findUnpaidJob,
  findLiveJob,
  findActiveSos,
  findActiveServiceRequest,
  upcomingBookingsForCustomer,
  assertCustomerCanBook,
  assertCustomerCanCreateSos,
  liveJobVehicleId,
  buildCustomerSession,
  sessionKind,
  bookingError,
};
