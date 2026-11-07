const {
  CustomerSubscription,
} = require("../../../clicks-shared/models");

function serialize(sub) {
  const o = sub.toObject ? sub.toObject() : sub;
  const status =
    typeof sub.resolveStatus === "function" ? sub.resolveStatus() : o.status;
  const customer =
    o.customer_id && typeof o.customer_id === "object" ? o.customer_id : null;
  const vehicle =
    o.customer_vehicle_id && typeof o.customer_vehicle_id === "object"
      ? o.customer_vehicle_id
      : null;
  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    status,
    interval: o.interval,
    durationMonths: o.durationMonths,
    priceQar: o.priceQar,
    planCode: o.planCode,
    planName: o.planName,
    discountPercent: o.discountPercent,
    included: o.included || [],
    usage: o.usage || [],
    startDate: o.startDate,
    endDate: o.endDate,
    source: o.source,
    customer: customer
      ? {
          id: customer._id.toString(),
          phone: customer.phone_number || "",
          name:
            `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        }
      : null,
    vehicle: vehicle
      ? {
          id: vehicle._id.toString(),
          plate: vehicle.plate_number || "",
        }
      : null,
    createdAt: o.createdAt,
  };
}

async function listSubscriptions(req, res) {
  try {
    const { page = 1, limit = 50, search = "", status, interval } = req.query;
    const match = {};
    if (status) match.status = status;
    if (interval === "month" || interval === "year") match.interval = interval;
    if (search) {
      match.$or = [
        { planName: { $regex: search, $options: "i" } },
        { planCode: { $regex: search, $options: "i" } },
      ];
    }
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      CustomerSubscription.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("customer_id", "first_name last_name phone_number")
        .populate("customer_vehicle_id", "plate_number"),
      CustomerSubscription.countDocuments(match),
    ]);
    res.json({
      subscriptions: rows.map(serialize),
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to list customer memberships",
      error: err.message,
    });
  }
}

async function getSubscription(req, res) {
  try {
    const sub = await CustomerSubscription.findById(req.params.id)
      .populate("customer_id", "first_name last_name phone_number")
      .populate("customer_vehicle_id", "plate_number");
    if (!sub) return res.status(404).json({ message: "Membership not found" });
    res.json({ subscription: serialize(sub) });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch membership",
      error: err.message,
    });
  }
}

module.exports = {
  listSubscriptions,
  getSubscription,
};
