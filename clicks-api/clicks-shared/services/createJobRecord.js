const Job = require("../models/Job");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const {
  resolveJobLocationToGeoPointRequired,
} = require("../utils/resolveJobLocation");
const { formatGeoPointAsLocationString } = require("../utils/parseJobLocation");

/**
 * Validate and persist a Job from an admin-style payload.
 * Handles SOS/SR side effects and optional technician notify via callback.
 */
async function createJobRecord(body, { notifyTechnicianFn } = {}) {
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

  if (!clientName || !clientMobileNumber || !location || !dateTime || !jobType || price == null || price === "" || !source) {
    const err = new Error("Missing required fields");
    err.status = 400;
    throw err;
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
    price: Number(price),
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

  jobData.locationCoordinates = await resolveJobLocationToGeoPointRequired(
    jobData.location
  );
  jobData.location =
    formatGeoPointAsLocationString(jobData.locationCoordinates) ||
    jobData.location;

  const job = await Job.create(jobData);

  const populatedJob = await Job.findById(job._id)
    .populate("assignedTechnician", "firstName lastName phone profilePicture currentLocation")
    .populate("customer_id", "first_name last_name phone_number");

  if (sos_request_id) {
    try {
      await SOSRequest.findByIdAndUpdate(sos_request_id, {
        status: "accepted",
        assigned_technician: assignedTechnician,
        accepted_at: new Date(),
        job_id: job._id,
      });
    } catch (e) {
      console.error("Error updating SOS:", e.message);
    }
  }

  if (service_request_id) {
    try {
      await ServiceRequest.findByIdAndUpdate(service_request_id, {
        status: "assigned",
        job_id: job._id,
      });
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
