const ServiceRequest = require("../models/ServiceRequest");
const Lead = require("../models/Lead");
const Customer = require("../models/Customer");
const CustomerVehicle = require("../../../clicks-shared/models/CustomerVehicle");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { objectId } = require("../../../clicks-shared/utils/coerce");

// Cap on how many customer/vehicle ids a single search may expand into, so a
// very broad term cannot build an unbounded $in list.
const SEARCH_MATCH_LIMIT = 500;

/**
 * Translate the free-text list search into a Mongo filter fragment so that
 * skip/limit and countDocuments both see it. Matching customers/vehicles are
 * resolved first because the searchable name/phone/plate live on those
 * collections.
 */
async function buildSearchFilter(search) {
  const tokens = String(search).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  const customerConditions = tokens.map((token) => {
    const rx = new RegExp(escapeRegex(token), "i");
    return { $or: [{ first_name: rx }, { last_name: rx }, { phone_number: rx }] };
  });
  const termRegex = new RegExp(escapeRegex(search), "i");

  const [customers, vehicles] = await Promise.all([
    Customer.find({ $and: customerConditions })
      .select("_id")
      .limit(SEARCH_MATCH_LIMIT)
      .lean(),
    CustomerVehicle.find({ plate_number: termRegex })
      .select("_id")
      .limit(SEARCH_MATCH_LIMIT)
      .lean(),
  ]);

  const or = [{ service_type: termRegex }];
  if (customers.length) {
    or.push({ customer_id: { $in: customers.map((c) => c._id) } });
  }
  if (vehicles.length) {
    or.push({ customer_vehicle_id: { $in: vehicles.map((v) => v._id) } });
  }
  const asId = objectId(search);
  if (asId) {
    or.push({ _id: asId });
  }
  return { $or: or };
}

function mapServiceRequest(doc, leadBySrId = {}) {
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
    service_request_id: o._id.toString(),
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
    lead_id:
      leadBySrId[o._id?.toString()] ||
      o.lead_id?.toString?.() ||
      null,
    cancel_reason: o.cancel_reason || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

const getServiceRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const status = req.query.status;
    const timing = req.query.timing;
    const search = (req.query.search || "").trim();

    const filter = {};
    if (status) {
      filter.status = status;
    } else {
      filter.status = { $in: ["pending", "assigned"] };
    }
    if (timing === "immediate" || timing === "scheduled") {
      filter.timing = timing;
    }

    // The search has to be part of the Mongo filter: filtering the page in
    // JavaScript after skip/limit hid every match that was not on the current
    // page and reported the page's own length as the total.
    if (search) {
      const searchFilter = await buildSearchFilter(search);
      if (searchFilter) {
        Object.assign(filter, searchFilter);
      }
    }

    let query = ServiceRequest.find(filter)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .sort(
        timing === "scheduled" || !timing
          ? { scheduled_for: 1, createdAt: -1 }
          : { createdAt: -1 }
      )
      .skip((page - 1) * limit)
      .limit(limit);

    const docs = await query;
    const srIds = docs.map((d) => d._id);
    const leads = await Lead.find({
      service_request_id: { $in: srIds },
    }).select("_id service_request_id");
    const leadBySrId = Object.fromEntries(
      leads.map((l) => [l.service_request_id.toString(), l._id.toString()])
    );

    const total = await ServiceRequest.countDocuments(filter);

    res.json({
      requests: docs.map((d) => mapServiceRequest(d, leadBySrId)),
      pagination: { page, limit, total },
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch service requests",
      details: err.message,
    });
  }
};

const getServiceRequestById = async (req, res) => {
  try {
    const doc = await ServiceRequest.findById(req.params.id)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      });
    if (!doc) {
      return res.status(404).json({ error: "Service request not found" });
    }
    const linkedLead = await Lead.findOne({
      service_request_id: doc._id,
    }).select("_id");
    const leadBySrId = linkedLead
      ? { [doc._id.toString()]: linkedLead._id.toString() }
      : {};
    res.json({ request: mapServiceRequest(doc, leadBySrId) });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch service request",
      details: err.message,
    });
  }
};

module.exports = {
  getServiceRequests,
  getServiceRequestById,
  mapServiceRequest,
};
