const {
  ServiceRequest,
  SOSRequest,
  Customer,
  CustomerVehicle,
} = require("../../../clicks-shared/models");
const {
  ensureLeadFromServiceRequest,
} = require("../../../clicks-shared/services/leadFromServiceRequest");

function mapServiceRequest(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const customer =
    o.customer_id && typeof o.customer_id === "object" ? o.customer_id : null;
  const vehicle =
    o.customer_vehicle_id && typeof o.customer_vehicle_id === "object"
      ? o.customer_vehicle_id
      : null;
  const [longitude, latitude] = o.location?.coordinates || [0, 0];

  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    status: o.status,
    service_type: o.service_type,
    timing: o.timing,
    scheduled_for: o.scheduled_for || null,
    customer_id: customer?._id?.toString() || o.customer_id?.toString(),
    customer_vehicle_id:
      vehicle?._id?.toString() || o.customer_vehicle_id?.toString() || null,
    customer: customer
      ? {
          id: customer._id.toString(),
          name:
            `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
            "Unknown",
          phone: customer.phone_number || "Unknown",
        }
      : null,
    vehicle: vehicle
      ? {
          id: vehicle._id.toString(),
          make: vehicle.vehicle_make?.makeName || "Unknown",
          model: vehicle.vehicle_model?.modelName || "Unknown",
          year: vehicle.year || "Unknown",
          color: vehicle.vehicle_color || "Unknown",
          plate: vehicle.plate_number || "Unknown",
        }
      : null,
    location: {
      latitude,
      longitude,
      coordinates: `${latitude}, ${longitude}`,
    },
    job_id: o.job_id?.toString() || null,
    cancel_reason: o.cancel_reason || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function createServiceRequest(req, res) {
  try {
    const customer_id = String(req.user.id);
    const {
      customer_vehicle_id,
      latitude,
      longitude,
      service_type,
      timing,
      scheduled_for,
      skip_vehicle: skipVehicleRaw,
    } = req.body;

    const serviceType =
      typeof service_type === "string" && service_type.trim()
        ? service_type.trim()
        : null;
    if (!serviceType) {
      return res.status(400).json({
        error: "service_type is required",
        code: "SERVICE_TYPE_REQUIRED",
      });
    }

    const timingValue = timing === "scheduled" ? "scheduled" : "immediate";
    let scheduledFor = null;
    if (timingValue === "scheduled") {
      scheduledFor = scheduled_for ? new Date(scheduled_for) : null;
      if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
        return res.status(400).json({
          error: "scheduled_for is required for scheduled requests",
          code: "SCHEDULED_FOR_REQUIRED",
        });
      }
      if (scheduledFor.getTime() < Date.now() - 60_000) {
        return res.status(400).json({
          error: "scheduled_for must be in the future",
          code: "SCHEDULED_FOR_PAST",
        });
      }
    }

    if (
      latitude == null ||
      longitude == null ||
      Number.isNaN(Number(latitude)) ||
      Number.isNaN(Number(longitude))
    ) {
      return res.status(400).json({
        error: "Location is required",
        code: "SERVICE_LOCATION_REQUIRED",
      });
    }

    const skipVehicle =
      skipVehicleRaw === true ||
      skipVehicleRaw === "true" ||
      (!customer_vehicle_id && skipVehicleRaw !== false);

    if (timingValue === "immediate") {
      const activeSos = await SOSRequest.findOne({
        customer_id,
        status: { $in: ["pending", "in_call"] },
      });
      if (activeSos) {
        return res.status(409).json({
          error: "You already have an active SOS request",
          code: "SOS_ALREADY_ACTIVE",
          sos_id: activeSos._id.toString(),
        });
      }

      const pendingImmediate = await ServiceRequest.findOne({
        customer_id,
        timing: "immediate",
        status: "pending",
      });
      if (pendingImmediate) {
        return res.status(409).json({
          error: "You already have a pending service request",
          code: "SERVICE_REQUEST_ALREADY_ACTIVE",
          service_request_id: pendingImmediate._id.toString(),
        });
      }
    }

    const customer = await Customer.findById(customer_id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    let vehicle = null;
    if (!skipVehicle) {
      if (!customer_vehicle_id) {
        return res.status(400).json({
          error: "Please select a vehicle or choose Skip vehicle",
          code: "SERVICE_VEHICLE_REQUIRED",
        });
      }
      vehicle = await CustomerVehicle.findById(customer_vehicle_id)
        .populate("vehicle_make")
        .populate("vehicle_model");
      if (!vehicle) {
        return res.status(404).json({
          error: "Vehicle not found",
          code: "SERVICE_VEHICLE_NOT_FOUND",
        });
      }
    }

    const doc = await ServiceRequest.create({
      customer_id,
      ...(vehicle ? { customer_vehicle_id: vehicle._id } : {}),
      service_type: serviceType,
      timing: timingValue,
      scheduled_for: scheduledFor,
      location: {
        type: "Point",
        coordinates: [Number(longitude), Number(latitude)],
      },
      status: "pending",
    });

    const populated = await ServiceRequest.findById(doc._id)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      });

    const payload = mapServiceRequest(populated);

    await ensureLeadFromServiceRequest(populated);

    const notify = req.app.get("notifyAdminServiceRequest");
    if (typeof notify === "function") {
      notify(payload);
    }

    res.status(201).json({
      message: "Service request created",
      service_request: payload,
    });
  } catch (err) {
    console.error("createServiceRequest error:", err);
    res.status(500).json({
      error: "Failed to create service request",
      details: err.message,
    });
  }
}

async function getActiveServiceRequest(req, res) {
  try {
    const customer_id = req.user.id;
    const active = await ServiceRequest.findOne({
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
      active_service_request: active ? mapServiceRequest(active) : null,
      has_active_service_request: !!active,
    });
  } catch (err) {
    res.status(500).json({
      error: "Fetch active service request failed",
      details: err.message,
    });
  }
}

async function cancelServiceRequest(req, res) {
  try {
    const customer_id = String(req.user.id);
    const { id } = req.params;
    const reason = req.body?.reason || "cancelled_by_customer";

    const doc = await ServiceRequest.findById(id);
    if (!doc) {
      return res.status(404).json({ error: "Service request not found" });
    }
    if (String(doc.customer_id) !== customer_id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (doc.status !== "pending") {
      return res.status(400).json({
        error: "Only pending service requests can be cancelled",
        code: "SERVICE_REQUEST_NOT_CANCELLABLE",
      });
    }

    doc.status = "cancelled";
    doc.cancel_reason = reason;
    await doc.save();

    const notify = req.app.get("notifyAdminServiceRequestCancelled");
    if (typeof notify === "function") {
      notify({
        service_request_id: doc._id.toString(),
        customer_id,
      });
    }

    res.json({
      message: "Service request cancelled",
      service_request: mapServiceRequest(doc),
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to cancel service request",
      details: err.message,
    });
  }
}

module.exports = {
  createServiceRequest,
  getActiveServiceRequest,
  cancelServiceRequest,
  mapServiceRequest,
};
