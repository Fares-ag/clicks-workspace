const axios = require("axios");
const SOSRequest = require("../models/SOSRequest");

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

  const [longitude, latitude] = o.location?.coordinates || [0, 0];

  return {
    sos_id: o._id.toString(),
    _id: o._id.toString(),
    status: o.status,
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
    job_id: o.job_id?.toString() || null,
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
    } else {
      // Default inbox: actionable + recently expired (last 7 days)
      filter.$or = [
        { status: { $in: ["pending", "in_call"] } },
        {
          status: "expired",
          updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      ];
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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const [rows, total] = await Promise.all([
      query.exec(),
      SOSRequest.countDocuments(filter),
    ]);

    let requests = rows.map(mapSos);

    if (search) {
      const q = search.toLowerCase();
      requests = requests.filter((r) => {
        const hay = [
          r.customer?.name,
          r.customer?.phone,
          r.vehicle?.plate,
          r.sos_id,
          r.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

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
      .populate("claimed_by", "firstName lastName email");

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
    const sos = await SOSRequest.findById(req.params.id);
    if (!sos) {
      return res.status(404).json({ error: "SOS not found" });
    }
    if (!["pending", "in_call"].includes(sos.status)) {
      return res.status(409).json({
        error: "SOS is no longer available",
        code: "SOS_UNAVAILABLE",
        status: sos.status,
      });
    }
    if (sos.claimed_by && String(sos.claimed_by) !== String(adminId)) {
      return res.status(409).json({
        error: "SOS already claimed by another dispatcher",
        code: "SOS_ALREADY_CLAIMED",
        claimed_by: sos.claimed_by.toString(),
      });
    }

    const now = new Date();
    sos.status = "in_call";
    sos.in_call_at = sos.in_call_at || now;
    sos.claimed_by = adminId;
    sos.claimed_at = sos.claimed_at || now;
    await sos.save();

    const populated = await SOSRequest.findById(sos._id)
      .populate("customer_id", "first_name last_name phone_number email")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .populate("claimed_by", "firstName lastName email");

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
