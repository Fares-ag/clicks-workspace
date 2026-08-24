const AdminAuditLog = require("../../../clicks-shared/models/AdminAuditLog");

async function listAuditLog(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const { entity_id, admin_id, action } = req.query;

    const filter = {};
    if (entity_id) filter.entity_id = entity_id;
    if (admin_id) filter.admin_id = admin_id;
    if (action) filter.action = action;

    const [rows, total] = await Promise.all([
      AdminAuditLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("admin_id", "firstName lastName email role")
        .lean(),
      AdminAuditLog.countDocuments(filter),
    ]);

    res.json({
      logs: rows.map((row) => ({
        id: row._id,
        admin_id: row.admin_id?._id?.toString?.() || row.admin_id?.toString?.(),
        admin: row.admin_id && typeof row.admin_id === "object"
          ? {
              id: row.admin_id._id?.toString(),
              firstName: row.admin_id.firstName,
              lastName: row.admin_id.lastName,
              email: row.admin_id.email,
              role: row.admin_id.role,
            }
          : null,
        admin_role: row.admin_role,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id?.toString?.(),
        changes: row.changes,
        ip: row.ip,
        at: row.at,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch audit log",
      error: err.message,
    });
  }
}

module.exports = { listAuditLog };
