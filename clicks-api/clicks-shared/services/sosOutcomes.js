const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");

function outcomeError(message, status = 400, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

const CLOSABLE = ["pending", "in_call"];

/**
 * Only an open SOS with no job may change outcome. The guard is part of the
 * update filter (scenario 43): a customer cancel, a job creation and a
 * schedule/close racing on the same SOS resolve to exactly one winner.
 */
function closableFilter(sosId) {
  return { _id: sosId, status: { $in: CLOSABLE }, job_id: null };
}

async function explainNotClosable(sosId, verb) {
  const current = await SOSRequest.findById(sosId).select("status job_id").lean();
  if (!current) return outcomeError("SOS not found", 404, "SOS_NOT_FOUND");
  if (current.job_id) {
    return outcomeError(
      `Cannot ${verb} SOS — a job already exists for it`,
      409,
      "SOS_ALREADY_HANDLED"
    );
  }
  return outcomeError(
    `Cannot ${verb} SOS in status ${current.status}`,
    409,
    "SOS_NOT_CLOSABLE"
  );
}

async function scheduleSosAsBooking({
  sosId,
  serviceType,
  scheduledFor,
  vehicleId,
} = {}) {
  const sos = await SOSRequest.findById(sosId);
  if (!sos) throw outcomeError("SOS not found", 404);
  if (!CLOSABLE.includes(sos.status)) {
    throw outcomeError(
      `Cannot schedule SOS in status ${sos.status}`,
      409,
      "SOS_NOT_CLOSABLE"
    );
  }

  const when = scheduledFor ? new Date(scheduledFor) : null;
  if (!when || Number.isNaN(when.getTime())) {
    throw outcomeError("scheduled_for is required", 400, "SCHEDULED_FOR_REQUIRED");
  }
  if (when.getTime() < Date.now() - 60_000) {
    throw outcomeError("scheduled_for must be in the future", 400, "SCHEDULED_FOR_PAST");
  }

  const type = String(serviceType || sos.service_type || "").trim();
  if (!type) {
    throw outcomeError("service_type is required", 400, "SERVICE_TYPE_REQUIRED");
  }

  // Claim the outcome first; only the winner creates the booking.
  const claimed = await SOSRequest.findOneAndUpdate(
    closableFilter(sosId),
    { $set: { status: "scheduled", outcome: "scheduled", service_type: type } },
    { new: true }
  );
  if (!claimed) throw await explainNotClosable(sosId, "schedule");

  const coords = Array.isArray(claimed.location?.coordinates)
    ? claimed.location.coordinates
    : [51.531, 25.2854];

  let serviceRequest;
  try {
    serviceRequest = await ServiceRequest.create({
      customer_id: claimed.customer_id,
      ...(vehicleId || claimed.customer_vehicle_id
        ? { customer_vehicle_id: vehicleId || claimed.customer_vehicle_id }
        : {}),
      service_type: type,
      timing: "scheduled",
      scheduled_for: when,
      location: { type: "Point", coordinates: coords },
      status: "pending",
      origin_sos_id: claimed._id,
    });
  } catch (err) {
    // Put the SOS back so dispatch can retry — never leave it "scheduled"
    // with no booking behind it.
    await SOSRequest.updateOne(
      { _id: sosId, status: "scheduled", scheduled_request_id: null },
      { $set: { status: sos.status, outcome: sos.outcome || null } }
    ).catch(() => {});
    throw err;
  }

  await SOSRequest.updateOne(
    { _id: sosId },
    { $set: { scheduled_request_id: serviceRequest._id } }
  );
  claimed.scheduled_request_id = serviceRequest._id;

  return { sos: claimed, serviceRequest };
}

async function closeSosAsNotAJob({ sosId, reason } = {}) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) throw outcomeError("reason is required");

  const sos = await SOSRequest.findOneAndUpdate(
    closableFilter(sosId),
    {
      $set: {
        status: "not_a_job",
        outcome: "not_a_job",
        outcome_reason: trimmed.slice(0, 2000),
      },
    },
    { new: true }
  );
  if (!sos) throw await explainNotClosable(sosId, "close");
  return { sos };
}

module.exports = {
  scheduleSosAsBooking,
  closeSosAsNotAJob,
  CLOSABLE_SOS_STATUSES: CLOSABLE,
};
