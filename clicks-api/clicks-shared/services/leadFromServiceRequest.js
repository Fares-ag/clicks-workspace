const Lead = require("../models/Lead");
const Source = require("../models/Source");

async function resolveAppSource() {
  let source = await Source.findOne({
    mainSourceName: { $regex: /^app$/i },
    isActive: { $ne: false },
  });
  if (!source) {
    source = await Source.findOne({
      mainSourceName: { $regex: /^mobile$/i },
      isActive: { $ne: false },
    });
  }
  if (!source) {
    source = await Source.findOne({ isActive: { $ne: false } }).sort({ createdAt: 1 });
  }
  return source;
}

/**
 * Create (or return existing) Lead linked to a ServiceRequest.
 * Never throws — logs and returns null on failure.
 */
async function ensureLeadFromServiceRequest(populatedSr) {
  try {
    if (!populatedSr?._id) return null;

    const existing = await Lead.findOne({
      service_request_id: populatedSr._id,
    });
    if (existing) return existing;

    const source = await resolveAppSource();
    if (!source) {
      console.warn("ensureLeadFromServiceRequest: no Source found for app channel");
      return null;
    }

    const customer =
      populatedSr.customer_id && typeof populatedSr.customer_id === "object"
        ? populatedSr.customer_id
        : null;
    if (!customer) {
      console.warn("ensureLeadFromServiceRequest: missing customer on SR");
      return null;
    }

    const vehicle =
      populatedSr.customer_vehicle_id &&
      typeof populatedSr.customer_vehicle_id === "object"
        ? populatedSr.customer_vehicle_id
        : null;

    const coords = populatedSr.location?.coordinates || [];
    const [longitude, latitude] = coords;
    const locationStr =
      latitude != null && longitude != null
        ? `${latitude}, ${longitude}`
        : "";

    const clientName =
      `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
      "Unknown";

    return await Lead.create({
      clientName,
      clientMobileNumber: customer.phone_number || "",
      clientEmail: customer.email || "",
      inquiry: populatedSr.service_type || "Service request",
      serviceType: populatedSr.service_type || "",
      timing: populatedSr.timing || undefined,
      preferredDateTime: populatedSr.scheduled_for || null,
      location: locationStr,
      vehicleMake: vehicle?.vehicle_make?.makeName || "",
      vehicleModel: vehicle?.vehicle_model?.modelName || "",
      vehicleYear: vehicle?.year || null,
      licensePlate: vehicle?.plate_number || "",
      customer_id: customer._id,
      customer_vehicle_id: vehicle?._id || null,
      source: source._id,
      subSource: "mobile",
      service_request_id: populatedSr._id,
      status: "new",
    });
  } catch (err) {
    console.error("ensureLeadFromServiceRequest failed:", err.message);
    return null;
  }
}

module.exports = { ensureLeadFromServiceRequest, resolveAppSource };
