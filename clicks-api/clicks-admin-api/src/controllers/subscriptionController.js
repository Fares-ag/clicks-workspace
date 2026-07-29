const Subscription = require("../../../clicks-shared/models/Subscription");

function withResolvedStatus(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.status = typeof doc.resolveStatus === "function"
    ? doc.resolveStatus()
    : resolveStatusFromFields(obj);
  return obj;
}

function resolveStatusFromFields(obj, now = new Date()) {
  if (obj.status === "cancelled") return "cancelled";
  if (obj.endDate && new Date(obj.endDate) < now) return "expired";
  return "active";
}

function computeEndDate(startDate, durationMonths) {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + Number(durationMonths));
  return d;
}

async function listSubscriptions(req, res) {
  try {
    const { page = 1, limit = 50, search = "", status } = req.query;
    const match = {};
    if (search) {
      match.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { plateNumber: { $regex: search, $options: "i" } },
        { planName: { $regex: search, $options: "i" } },
      ];
    }
    if (status === "cancelled") match.status = "cancelled";

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [rows, total] = await Promise.all([
      Subscription.find(match).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Subscription.countDocuments(match),
    ]);

    let subscriptions = rows.map(withResolvedStatus);
    if (status === "active" || status === "expired") {
      subscriptions = subscriptions.filter((s) => s.status === status);
    }

    res.json({ subscriptions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ message: "Failed to list subscriptions", error: err.message });
  }
}

async function getSubscription(req, res) {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    res.json({ subscription: withResolvedStatus(sub) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subscription", error: err.message });
  }
}

async function createSubscription(req, res) {
  try {
    const {
      clientName,
      phone,
      plateNumber,
      vinNumber,
      planName,
      durationMonths,
      price,
      startDate,
    } = req.body;

    if (!clientName || !phone || !plateNumber || !planName || !durationMonths || price == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const start = startDate ? new Date(startDate) : new Date();
    const end = computeEndDate(start, durationMonths);

    const subscription = await Subscription.create({
      clientName: String(clientName).trim(),
      phone: String(phone).trim(),
      plateNumber: String(plateNumber).trim().toUpperCase(),
      vinNumber: vinNumber ? String(vinNumber).trim() : "",
      planName: String(planName).trim(),
      durationMonths: Number(durationMonths),
      price: Number(price),
      startDate: start,
      endDate: end,
      status: "active",
      created_by_admin: req.user?.id || req.user?._id || null,
    });

    res.status(201).json({
      message: "Subscription created",
      subscription: withResolvedStatus(subscription),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to create subscription", error: err.message });
  }
}

async function updateSubscription(req, res) {
  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const fields = [
      "clientName",
      "phone",
      "plateNumber",
      "vinNumber",
      "planName",
      "durationMonths",
      "price",
      "startDate",
      "status",
    ];
    for (const f of fields) {
      if (req.body[f] != null) {
        if (f === "plateNumber") sub[f] = String(req.body[f]).trim().toUpperCase();
        else if (f === "startDate") sub[f] = new Date(req.body[f]);
        else if (f === "durationMonths" || f === "price") sub[f] = Number(req.body[f]);
        else if (f === "status" && ["active", "expired", "cancelled"].includes(req.body[f])) {
          sub[f] = req.body[f];
        } else if (f !== "status") sub[f] = req.body[f];
      }
    }
    if (req.body.durationMonths != null || req.body.startDate != null) {
      sub.endDate = computeEndDate(sub.startDate, sub.durationMonths);
    }
    await sub.save();
    res.json({ message: "Subscription updated", subscription: withResolvedStatus(sub) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update subscription", error: err.message });
  }
}

async function cancelSubscription(req, res) {
  try {
    const sub = await Subscription.findByIdAndUpdate(
      req.params.id,
      { status: "cancelled" },
      { new: true }
    );
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    res.json({ message: "Subscription cancelled", subscription: withResolvedStatus(sub) });
  } catch (err) {
    res.status(500).json({ message: "Failed to cancel subscription", error: err.message });
  }
}

/** Lookup latest subscription for a plate (Add Job UI). */
async function lookupByPlate(req, res) {
  try {
    const plate = String(req.query.plate || "").trim().toUpperCase();
    if (!plate) {
      return res.status(400).json({ message: "plate query is required" });
    }
    const subs = await Subscription.find({ plateNumber: plate }).sort({ endDate: -1 }).limit(5);
    if (!subs.length) {
      return res.json({ found: false, status: "none", subscription: null });
    }
    const resolved = subs.map(withResolvedStatus);
    const active = resolved.find((s) => s.status === "active");
    const best = active || resolved[0];
    res.json({
      found: true,
      status: best.status,
      subscription: best,
      expiresAt: best.endDate,
    });
  } catch (err) {
    res.status(500).json({ message: "Lookup failed", error: err.message });
  }
}

module.exports = {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  lookupByPlate,
};
