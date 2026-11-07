const Job = require("../models/Job");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../utils/parseJobLocation");
const { applyCanonicalJobFields } = require("../utils/dataCleaning");
const { createJobLinkedToSos } = require("./linkSosToJob");

/** SOS pin as a GeoJSON point, or null when the SOS has no usable coordinates. */
function sosGeoPoint(sos) {
  const coords = sos?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

/**
 * Validate and persist a Job from an admin-style payload.
 * Handles SOS/SR side effects and optional technician notify via callback.
 *
 * @param {object} body
 * @param {{ notifyTechnicianFn?: Function, adminId?: string }} [opts]
 *   adminId: the dispatcher creating the job. For SOS jobs they must hold the
 *   SOS claim (see linkSosToJob).
 */
async function createJobRecord(body, { notifyTechnicianFn, adminId } = {}) {
  const {
    customer_id,
    customer_vehicle_id,
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
    dateTime,
    jobType,
    assignedTechnician,
    price,
    source,
    subSource,
    job_status,
    sos_request_id,
    service_request_id,
    lead_id,
    business_id,
    businessName,
    businessCutType,
    businessCutPercent,
  } = body;

  if (!clientName || !clientMobileNumber || !location || !dateTime || !jobType || !source) {
    const err = new Error("Missing required fields");
    err.status = 400;
    throw err;
  }
  let parsedPrice;
  if (price != null && price !== "") {
    parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      const err = new Error("Invalid price");
      err.status = 400;
      throw err;
    }
  }
  if (!issue || !String(issue).trim()) {
    const err = new Error("Issue description is mandatory");
    err.status = 400;
    throw err;
  }

  let finalStatus = job_status;
  if (!finalStatus) {
    finalStatus = assignedTechnician ? "assigned" : "pending";
  }

  const jobData = {
    customer_id: customer_id || null,
    customer_vehicle_id: customer_vehicle_id || null,
    clientName,
    clientMobileNumber,
    clientEmail: clientEmail || "",
    vehicleMake: vehicleMake || "",
    vehicleModel: vehicleModel || "",
    vehicleYear: vehicleYear != null && vehicleYear !== "" ? Number(vehicleYear) : null,
    licensePlate: licensePlate || "",
    vinNumber: vinNumber || "",
    issue: String(issue).trim(),
    location: String(location).trim(),
    dateTime,
    jobType,
    assignedTechnician: assignedTechnician || null,
    source,
    subSource: subSource || "",
    job_status: finalStatus,
    payment_status: "unpaid",
    assigned_at: assignedTechnician ? new Date() : null,
    sos_request_id: sos_request_id || null,
    service_request_id: service_request_id || null,
    lead_id: lead_id || null,
    business_id: business_id || null,
    businessName: businessName || null,
    businessCutType: businessCutType || undefined,
    businessCutPercent:
      businessCutPercent != null ? Number(businessCutPercent) : undefined,
    created_by_business_user: body.created_by_business_user || null,
  };
  if (parsedPrice != null) {
    jobData.price = parsedPrice;
  }
  applyCanonicalJobFields(jobData);

  if (service_request_id) {
    try {
      const sr = await ServiceRequest.findById(service_request_id);
      if (sr) {
        const {
          stampJobMembership,
        } = require("./membershipEntitlement");
        stampJobMembership(jobData, {
          cover: sr.membership_cover || "none",
          discountPercent: sr.membership_discount_percent || 0,
          subscription_id: sr.membership_subscription_id || null,
          subscription: sr.membership_subscription_id
            ? { _id: sr.membership_subscription_id }
            : null,
        });
      }
    } catch (e) {
      console.error("Error stamping job membership:", e.message);
    }
  }

  // SOS jobs: the customer's GPS pin is the authoritative coordinate
  // (scenario 34). Whatever dispatch typed is kept as a label, unless they
  // explicitly ask to use the typed location (the customer moved).
  let sosPoint = null;
  if (sos_request_id && body.use_typed_location !== true) {
    const sos = await SOSRequest.findById(sos_request_id).select("location").lean();
    sosPoint = sosGeoPoint(sos);
  }
  if (sosPoint) {
    jobData.location_label = jobData.location.slice(0, 500);
    jobData.locationCoordinates = sosPoint;
  } else {
    jobData.locationCoordinates = await resolveJobLocationToGeoPointRequired(
      jobData.location
    );
  }
  jobData.location =
    formatGeoPointAsLocationString(jobData.locationCoordinates) ||
    jobData.location;

  // SOS jobs link atomically: the SOS is claimed for this job before the job
  // exists, so a double submit or a racing cancel cannot create a second job
  // or resurrect a cancelled SOS (scenarios 42-44).
  const job = sos_request_id
    ? (await createJobLinkedToSos({ sosId: sos_request_id, adminId, jobData })).job
    : await Job.create(jobData);

  const populatedJob = await Job.findById(job._id)
    .populate("assignedTechnician", "firstName lastName phone profilePicture currentLocation")
    .populate("customer_id", "first_name last_name phone_number");

  if (service_request_id) {
    try {
      // Never resurrect a finished request.
      await ServiceRequest.updateOne(
        { _id: service_request_id, status: { $nin: ["cancelled", "completed"] } },
        { $set: { status: "assigned", job_id: job._id } }
      );
    } catch (e) {
      console.error("Error updating ServiceRequest:", e.message);
    }
  }

  if (assignedTechnician && typeof notifyTechnicianFn === "function") {
    try {
      await notifyTechnicianFn(job._id.toString());
    } catch (e) {
      console.error("Failed to notify technician:", e.message);
    }
  }

  return { job, populatedJob };
}

module.exports = { createJobRecord };
