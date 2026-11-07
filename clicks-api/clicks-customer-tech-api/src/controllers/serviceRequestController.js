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
    membership_cover: o.membership_cover || "none",
    membership_subscription_id:
      o.membership_subscription_id?.toString() || null,
    membership_discount_percent: Number(o.membership_discount_percent || 0),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/** Resubmits of the same booking inside this window return the original. */
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;

function parseClientRequestId(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 64) : null;
}

async function populateForResponse(id) {
  return ServiceRequest.findById(id)
    .populate("customer_id", "first_name last_name phone_number email")
    .populate({
      path: "customer_vehicle_id",
      populate: [
        { path: "vehicle_make", select: "makeName" },
        { path: "vehicle_model", select: "modelName" },
      ],
    });
}

async function respondExisting(res, existing) {
  const populated = await populateForResponse(existing._id);
  return res.status(200).json({
    message: "Service request already received",
    duplicate: true,
    service_request: mapServiceRequest(populated || existing),
  });
}

/**
 * Same customer, same vehicle (or both skipped), same timing and slot,
 * submitted within DEDUPE_WINDOW_MS — a timed-out resubmit, not a second
 * booking (scenario 53).
 */
function findRecentDuplicate({ customerId, vehicleId, timing, scheduledFor }) {
  const filter = {
    customer_id: customerId,
    timing,
    status: { $in: ["pending", "assigned"] },
    createdAt: { $gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    customer_vehicle_id: vehicleId || null,
  };
  if (timing === "scheduled") filter.scheduled_for = scheduledFor;
  return ServiceRequest.findOne(filter).sort({ createdAt: -1 });
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
    const clientRequestId = parseClientRequestId(req.body?.client_request_id);

    // Idempotent replay: answer with the request this key already created,
    // before any rule that would now 409 because that request exists.
    if (clientRequestId) {
      const replay = await ServiceRequest.findOne({
        customer_id,
        client_request_id: clientRequestId,
      });
      if (replay) return respondExisting(res, replay);
    }

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

    const { assertInQatar } = require("../../../clicks-shared/utils/qatarCoverage");
    assertInQatar(latitude, longitude);

    const skipVehicle =
      skipVehicleRaw === true ||
      skipVehicleRaw === "true" ||
      (!customer_vehicle_id && skipVehicleRaw !== false);

    if (timingValue === "scheduled") {
      const { assertDispatchWindow } = require("../../../clicks-shared/utils/dispatchWindow");
      scheduledFor = assertDispatchWindow(scheduledFor);
    }

    // Timed-out resubmit without a key (older client) — same answer.
    const duplicate = await findRecentDuplicate({
      customerId: customer_id,
      vehicleId: skipVehicle ? null : customer_vehicle_id,
      timing: timingValue,
      scheduledFor,
    }).catch(() => null);
    if (duplicate) return respondExisting(res, duplicate);

    const {
      assertCustomerCanBook,
    } = require("../../../clicks-shared/utils/customerBookingGuard");
    await assertCustomerCanBook({
      customerId: customer_id,
      timing: timingValue,
      customerVehicleId: skipVehicle ? null : customer_vehicle_id,
    });

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
      // Ownership check: the vehicle must belong to the authenticated customer,
      // otherwise a stranger's plate/details leak back in the 201 response.
      vehicle = await CustomerVehicle.findOne({
        _id: customer_vehicle_id,
        customer_id,
      })
        .populate("vehicle_make")
        .populate("vehicle_model");
      if (!vehicle) {
        return res.status(404).json({
          error: "Vehicle not found",
          code: "SERVICE_VEHICLE_NOT_FOUND",
        });
      }
    }

    const {
      resolveCover,
      stampRequestMembership,
    } = require("../../../clicks-shared/services/membershipEntitlement");
    const cover = await resolveCover({
      customerId: customer_id,
      vehicleId: vehicle?._id,
      serviceType,
    });
    const requestFields = {
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
      client_request_id: clientRequestId,
    };
    stampRequestMembership(requestFields, cover);

    let doc;
    try {
      doc = await ServiceRequest.create(requestFields);
    } catch (createErr) {
      // Two submits with the same key raced past the replay check.
      if (createErr?.code === 11000 && clientRequestId) {
        const winner = await ServiceRequest.findOne({
          customer_id,
          client_request_id: clientRequestId,
        });
        if (winner) return respondExisting(res, winner);
      }
      throw createErr;
    }

    const populated = await populateForResponse(doc._id);

    const payload = mapServiceRequest(populated);

    // Only a genuinely new request creates a Lead (duplicates return above).
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
    const status = err.status || 500;
    res.status(status).json({
      error: err.message || "Failed to create service request",
      code: err.code,
      details: err.message,
    });
  }
}

async function getActiveServiceRequest(req, res) {
  try {
    const {
      findActiveServiceRequest,
    } = require("../../../clicks-shared/utils/customerBookingGuard");
    // Finished jobs no longer count, and a scheduled booking only counts from
    // its active window (scenarios 54, 55).
    const found = await findActiveServiceRequest(req.user.id);
    const active = found
      ? await found.populate({
          path: "customer_vehicle_id",
          populate: [
            { path: "vehicle_make" },
            { path: "vehicle_model" },
          ],
        })
      : null;

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
    if (doc.status === "cancelled") {
      return res.json({
        message: "Service request cancelled",
        service_request: mapServiceRequest(doc),
      });
    }

    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: id, customer_id, status: "pending" },
      {
        $set: {
          status: "cancelled",
          cancel_reason: String(reason).slice(0, 500),
          cancelled_at: new Date(),
        },
      },
      { new: true }
    );
    if (!updated) {
      const current = await ServiceRequest.findById(id).select("status job_id");
      if (current?.job_id && current.status === "assigned") {
        // A job exists now — cancel that instead (same free/fee rules).
        return res.status(409).json({
          error: "A job has been created for this request — cancel the job instead",
          code: "SERVICE_REQUEST_HAS_JOB",
          job_id: String(current.job_id),
        });
      }
      return res.status(400).json({
        error: "Only pending service requests can be cancelled",
        code: "SERVICE_REQUEST_NOT_CANCELLABLE",
      });
    }

    const notify = req.app.get("notifyAdminServiceRequestCancelled");
    if (typeof notify === "function") {
      notify({
        service_request_id: updated._id.toString(),
        customer_id,
      });
    }

    res.json({
      message: "Service request cancelled",
      service_request: mapServiceRequest(updated),
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
