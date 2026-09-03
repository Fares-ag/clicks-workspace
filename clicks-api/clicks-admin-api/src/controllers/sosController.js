const mongoose = require("mongoose");
const axios = require("axios");
const SOSRequest = require("../models/SOSRequest");
const Customer = require("../models/Customer");
const CustomerVehicle = require("../../../clicks-shared/models/CustomerVehicle");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { objectId } = require("../../../clicks-shared/utils/coerce");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");
const { computeChanges, recordAudit } = require("../utils/auditLog");

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

  const or = [
    { status: termRegex },
    { cancel_reason: termRegex },
  ];
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

function mapSos(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const customer = o.customer_id && typeof o.customer_id === "object" ? o.customer_id : null;
  const vehicle =
    o.customer_vehicle_id && typeof o.customer_vehicle_id === "object"
      ? o.customer_vehicle_id
      : null;
  const claimed =
    o.claimed_by && typeof o.claimed_by === "object" ? o.claimed_by : null;
  const job =
    o.job_id && typeof o.job_id === "object" ? o.job_id : null;
  const jobId = job?._id?.toString() || o.job_id?.toString() || null;
  const jobStatus = job?.job_status || null;

  const [longitude, latitude] = o.location?.coordinates || [0, 0];

  return {
    sos_id: o._id.toString(),
    _id: o._id.toString(),
    status: o.status,
    job_status: jobStatus,
    display_status: jobId && jobStatus ? jobStatus : o.status,
    customer_id: customer?._id?.toString() || o.customer_id?.toString(),
    customer_vehicle_id:
      vehicle?._id?.toString() || o.customer_vehicle_id?.toString(),
    customer: customer
      ? {
          id: customer._id.toString(),
          name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Unknown",
          phone: customer.phone_number || "Unknown",
        }
      : null,
    vehicle: vehicle
      ? {
          id: vehicle._id.toString(),
          make: vehicle.vehicle_make?.makeName || vehicle.vehicle_make || "Unknown",
          model: vehicle.vehicle_model?.modelName || vehicle.vehicle_model || "Unknown",
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
    expires_at: o.broadcast_expires_at,
    broadcast_started_at: o.broadcast_started_at,
    in_call_at: o.in_call_at,
    claimed_by: claimed
      ? {
          id: claimed._id.toString(),
          name: `${claimed.firstName || ""} ${claimed.lastName || ""}`.trim() || claimed.email,
          email: claimed.email,
        }
      : o.claimed_by
        ? { id: o.claimed_by.toString() }
        : null,
    claimed_at: o.claimed_at,
    cancel_reason: o.cancel_reason,
    job_id: jobId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

const getSOSRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const status = req.query.status;
    const search = (req.query.search || "").trim();

    const filter = {};
    if (status) {
      filter.status = status;
    }

    // The search has to be part of the Mongo filter: filtering the page in
    // JavaScript after skip/limit hid every match that was not on the current
    // page and left total/pages counting the unfiltered set.
    if (search) {
      const searchFilter = await buildSearchFilter(search);
      if (searchFilter) {
        Object.assign(filter, searchFilter);
      }
    }

    let query = SOSRequest.find(filter)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .populate("claimed_by", "firstName lastName email")
      .populate("job_id", "job_status")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const [rows, total] = await Promise.all([
      query.exec(),
      cachedCount(SOSRequest, filter, { ttlMs: 15000, key: `sos:${status || "all"}:${search}` }),
    ]);

    const requests = rows.map(mapSos);

    res.json({
      requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to list SOS requests", details: err.message });
  }
};

const getSOSById = async (req, res) => {
  try {
    const sos = await SOSRequest.findById(req.params.id)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .populate("claimed_by", "firstName lastName email")
      .populate("job_id", "job_status");

    if (!sos) {
      return res.status(404).json({ error: "SOS not found" });
    }
    res.json({ request: mapSos(sos) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch SOS", details: err.message });
  }
};

const claimSOS = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const claimerId = new mongoose.Types.ObjectId(String(adminId));
    const now = new Date();

    // Claim atomically: the availability guard is part of the write, so two
    // dispatchers racing on the same SOS cannot both come back with a 200.
    // in_call_at/claimed_at are stamped only when still unset, which keeps the
    // original claim time when the same dispatcher re-claims.
    const sos = await SOSRequest.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: ["pending", "in_call"] },
        $or: [{ claimed_by: null }, { claimed_by: claimerId }],
      },
      [
        {
          $set: {
            status: "in_call",
            claimed_by: claimerId,
            in_call_at: { $ifNull: ["$in_call_at", now] },
            claimed_at: { $ifNull: ["$claimed_at", now] },
          },
        },
      ],
      { new: false }
    );

    if (!sos) {
      // Nothing was written — re-read to report why the claim did not land.
      const existing = await SOSRequest.findById(req.params.id).select(
        "status claimed_by"
      );
      if (!existing) {
        return res.status(404).json({ error: "SOS not found" });
      }
      if (!["pending", "in_call"].includes(existing.status)) {
        return res.status(409).json({
          error: "SOS is no longer available",
          code: "SOS_UNAVAILABLE",
          status: existing.status,
        });
      }
      if (existing.claimed_by && String(existing.claimed_by) !== String(adminId)) {
        return res.status(409).json({
          error: "SOS already claimed by another dispatcher",
          code: "SOS_ALREADY_CLAIMED",
          claimed_by: existing.claimed_by.toString(),
        });
      }
      return res.status(409).json({
        error: "SOS is no longer available",
        code: "SOS_UNAVAILABLE",
        status: existing.status,
      });
    }

    // `sos` is the pre-image returned by the atomic update, so it doubles as the
    // "before" side of the audit diff; the "after" side is what was just written.
    const prior = {
      status: sos.status,
      claimed_by: sos.claimed_by,
      claimed_at: sos.claimed_at,
      in_call_at: sos.in_call_at,
    };
    const applied = {
      status: "in_call",
      claimed_by: claimerId,
      claimed_at: sos.claimed_at || now,
      in_call_at: sos.in_call_at || now,
    };

    await recordAudit({
      req,
      action: "sos.claim",
      entityType: "sos",
      entityId: sos._id,
      changes: computeChanges(prior, applied, [
        "status",
        "claimed_by",
        "claimed_at",
        "in_call_at",
      ]),
    });

    const populated = await SOSRequest.findById(sos._id)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .populate("claimed_by", "firstName lastName email")
      .populate("job_id", "job_status");

    try {
      const customerTechApiUrl =
        process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
      await axios.post(
        `${customerTechApiUrl}/api/sos/notify-claim`,
        {
          sos_id: sos._id.toString(),
          admin_id: String(adminId),
          customer_id: String(sos.customer_id),
        },
        { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
      );
    } catch (notifyErr) {
      console.error("Failed to notify SOS claim over socket:", notifyErr.message);
    }

    res.json({
      message: "SOS claimed",
      request: mapSos(populated),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to claim SOS", details: err.message });
  }
};

module.exports = {
  getSOSRequests,
  getSOSById,
  claimSOS,
};
