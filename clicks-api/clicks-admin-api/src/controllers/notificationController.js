const mongoose = require("mongoose");
const Notification = require("clicks-shared/models/Notification");

function adminObjectId(adminId) {
  return new mongoose.Types.ObjectId(adminId);
}

function serializeNotification(doc, adminId) {
  const readBy = (doc.read_by || []).map((id) => String(id));
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body || "",
    data: doc.data || {},
    read: readBy.includes(String(adminId)),
    createdAt: doc.createdAt,
  };
}

exports.listNotifications = async (req, res) => {
  try {
    const adminId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const cursor = req.query.cursor;

    const filter = { audience: "admin" };
    if (cursor) {
      const sep = cursor.lastIndexOf("_");
      if (sep > 0) {
        const createdAt = new Date(cursor.slice(0, sep));
        const id = cursor.slice(sep + 1);
        if (!Number.isNaN(createdAt.getTime()) && mongoose.Types.ObjectId.isValid(id)) {
          filter.$or = [
            { createdAt: { $lt: createdAt } },
            { createdAt, _id: { $lt: new mongoose.Types.ObjectId(id) } },
          ];
        }
      }
    }

    const rows = await Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? `${new Date(last.createdAt).toISOString()}_${last._id}` : null;

    res.json({
      notifications: page.map((row) => serializeNotification(row, adminId)),
      nextCursor,
    });
  } catch (err) {
    console.error("listNotifications error:", err);
    res.status(500).json({ message: "Failed to load notifications" });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const adminOid = adminObjectId(req.user.id);
    const count = await Notification.countDocuments({
      audience: "admin",
      read_by: { $nin: [adminOid] },
    });
    res.json({ count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: "Failed to load unread count" });
  }
};

exports.markRead = async (req, res) => {
  try {
    const adminOid = adminObjectId(req.user.id);
    const { ids, all } = req.body || {};

    if (all === true) {
      await Notification.updateMany(
        { audience: "admin", read_by: { $nin: [adminOid] } },
        { $addToSet: { read_by: adminOid } }
      );
    } else if (Array.isArray(ids) && ids.length) {
      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length) {
        await Notification.updateMany(
          { audience: "admin", _id: { $in: validIds } },
          { $addToSet: { read_by: adminOid } }
        );
      }
    } else {
      return res.status(400).json({ message: "Provide ids[] or all: true" });
    }

    res.json({ message: "ok" });
  } catch (err) {
    console.error("markRead error:", err);
    res.status(500).json({ message: "Failed to mark notifications read" });
  }
};
