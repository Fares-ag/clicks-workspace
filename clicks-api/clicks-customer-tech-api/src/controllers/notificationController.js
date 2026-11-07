const mongoose = require("mongoose");
const Notification = require("../../../clicks-shared/models/Notification");
const {
  serializeCustomerNotification,
} = require("../services/notificationRecordService");

// Cleared rows are hidden, not deleted: the inbox is the record of what the
// customer was told (scenario 73), and its dedupe keys must survive a clear.
function customerFilter(userId) {
  return { audience: "customer", customer_id: userId, cleared_at: null };
}

function pageParams(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

const listCustomer = async (req, res) => {
  try {
    const filter = customerFilter(req.user.id);
    const { page, limit, skip } = pageParams(req.query);
    const [rows, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    res.json({
      notifications: rows.map(serializeCustomerNotification),
      pagination: { page, pages, total, limit },
      unreadCount,
      count: unreadCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load notifications", details: err.message });
  }
};

const unreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      ...customerFilter(req.user.id),
      read: false,
    });
    res.json({ count, unreadCount: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to load unread count", details: err.message });
  }
};

const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(customerFilter(req.user.id), { $set: { read: true } });
    res.json({ message: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notifications read", details: err.message });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ error: "Notification not found" });
    }
    const row = await Notification.findOneAndUpdate(
      { ...customerFilter(req.user.id), _id: id },
      { $set: { read: true } },
      { new: true }
    );
    if (!row) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: serializeCustomerNotification(row) });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification read", details: err.message });
  }
};

const clearAll = async (req, res) => {
  try {
    await Notification.updateMany(customerFilter(req.user.id), {
      $set: { cleared_at: new Date(), read: true },
    });
    res.json({ message: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear notifications", details: err.message });
  }
};

/** POST /api/notifications/internal/deliver (admin API outbox). */
const deliverInternal = async (req, res) => {
  try {
    const { deliverCustomerNotification } = require("../../../clicks-shared/services/notifyCustomer");
    const result = await deliverCustomerNotification(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("[notifications] internal deliver failed:", err.message);
    res.status(status).json({ message: err.message || "Delivery failed" });
  }
};

module.exports = {
  deliverInternal,
  listCustomer,
  unreadCount,
  markAllRead,
  markRead,
  clearAll,
};
