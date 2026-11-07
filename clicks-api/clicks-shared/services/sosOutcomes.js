const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");

function outcomeError(message, status = 400, code) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

const CLOSABLE = new Set(["pending", "in_call"]);

async function scheduleSosAsBooking({
  sosId,
  serviceType,
  scheduledFor,
  vehicleId,
} = {}) {
  const sos = await SOSRequest.findById(sosId);
  if (!sos) throw outcomeError("SOS not found", 404);
  if (!CLOSABLE.has(sos.status)) {
    throw outcomeError(`Cannot schedule SOS in status ${sos.status}`);
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

  const coords = Array.isArray(sos.location?.coordinates)
    ? sos.location.coordinates
    : [51.531, 25.2854];

  const serviceRequest = await ServiceRequest.create({
    customer_id: sos.customer_id,
    ...(vehicleId || sos.customer_vehicle_id
      ? { customer_vehicle_id: vehicleId || sos.customer_vehicle_id }
      : {}),
    service_type: type,
    timing: "scheduled",
    scheduled_for: when,
    location: { type: "Point", coordinates: coords },
    status: "pending",
    origin_sos_id: sos._id,
  });

  sos.status = "scheduled";
  sos.outcome = "scheduled";
  sos.service_type = type;
  sos.scheduled_request_id = serviceRequest._id;
  await sos.save();

  return { sos, serviceRequest };
}

async function closeSosAsNotAJob({ sosId, reason } = {}) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) throw outcomeError("reason is required");

  const sos = await SOSRequest.findById(sosId);
  if (!sos) throw outcomeError("SOS not found", 404);
  if (!CLOSABLE.has(sos.status)) {
    throw outcomeError(`Cannot close SOS in status ${sos.status}`);
  }

  sos.status = "not_a_job";
  sos.outcome = "not_a_job";
  sos.outcome_reason = trimmed.slice(0, 2000);
  await sos.save();
  return { sos };
}

module.exports = {
  scheduleSosAsBooking,
  closeSosAsNotAJob,
};
