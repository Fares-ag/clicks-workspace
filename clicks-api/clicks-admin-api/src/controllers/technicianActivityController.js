const TechnicianActivityLog = require("../../../clicks-shared/models/TechnicianActivityLog");
const Technician = require("../../../clicks-shared/models/Technician");
const {
  TECHNICIAN_ACTIVITY_CATEGORIES,
  technicianActivityEventOptions,
  technicianActivityLabel,
  technicianActivitySeverity,
} = require("../../../clicks-shared/constants/technicianActivityEvents");
const { str, objectId } = require("../../../clicks-shared/utils/coerce");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");

const MAX_EXPORT_ROWS = 5000;

/**
 * Build the Mongo filter for the Technician Logs list.
 *
 * `search` matches the identifier typed at login (so a failed attempt from an
 * unknown number is findable) and any technician whose name or phone matches.
 */
async function buildFilter(query) {
  const filter = {};

  const technicianId = objectId(query.technician_id);
  if (technicianId) filter.technician_id = technicianId;

  const event = str(query.event, { maxLength: 64 });
  if (event) filter.event = event;

  const category = str(query.category, { maxLength: 32 });
  if (category) filter.category = category;

  const outcome = str(query.outcome, { maxLength: 16 });
  if (outcome) filter.outcome = outcome;

  const jobId = objectId(query.job_id);
  if (jobId) filter.job_id = jobId;

  const from = query.from ? new Date(str(query.from, { maxLength: 40 })) : null;
  const to = query.to ? new Date(str(query.to, { maxLength: 40 })) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    filter.at = {};
    if (from && !Number.isNaN(from.getTime())) filter.at.$gte = from;
    if (to && !Number.isNaN(to.getTime())) filter.at.$lte = to;
  }

  const search = str(query.search, { maxLength: 64 }).trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    const matches = await Technician.find({
      $or: [
        { firstName: rx },
        { lastName: rx },
        { phone: rx },
        { email: rx },
      ],
    })
      .select("_id")
      .limit(50)
      .lean();
    const ids = matches.map((t) => t._id);
    const clauses = [{ identifier: rx }, { technician_name: rx }, { message: rx }];
    if (ids.length) clauses.push({ technician_id: { $in: ids } });
    // Combine with the other filters rather than replacing them.
    filter.$and = [...(filter.$and || []), { $or: clauses }];
  }

  return filter;
}

function serializeRow(row) {
  const tech = row.technician_id;
  const populated = tech && typeof tech === "object" && tech._id;
  return {
    id: row._id?.toString(),
    at: row.at,
    event: row.event,
    event_label: technicianActivityLabel(row.event),
    severity: technicianActivitySeverity(row.event),
    category: row.category,
    category_label: TECHNICIAN_ACTIVITY_CATEGORIES[row.category] || row.category,
    outcome: row.outcome,
    message: row.message,
    status_code: row.status_code,
    technician: populated
      ? {
          id: tech._id.toString(),
          name:
            `${tech.firstName || ""} ${tech.lastName || ""}`.trim() ||
            row.technician_name ||
            "",
          phone: tech.phone || "",
          currentStatus: tech.currentStatus || "",
        }
      : row.technician_name || row.identifier
        ? { id: null, name: row.technician_name || "", phone: row.identifier || "" }
        : null,
    technician_id: populated ? tech._id.toString() : row.technician_id?.toString() || null,
    identifier: row.identifier || "",
    job_id: row.job_id?.toString() || null,
    job_reference: row.job_reference || "",
    metadata: row.metadata || null,
    ip: row.ip || "",
    user_agent: row.user_agent || "",
    app_version: row.app_version || "",
    platform: row.platform || "",
    coordinates:
      Array.isArray(row.coordinates?.coordinates) &&
      row.coordinates.coordinates.length >= 2
        ? {
            latitude: row.coordinates.coordinates[1],
            longitude: row.coordinates.coordinates[0],
          }
        : null,
  };
}

// GET /api/technician-activity
async function listTechnicianActivity(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
    const limit = capAdminLimit(req.query.limit, 25, 100);
    const filter = await buildFilter(req.query);

    const [rows, total] = await Promise.all([
      TechnicianActivityLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("technician_id", "firstName lastName phone currentStatus")
        .lean(),
      TechnicianActivityLog.countDocuments(filter),
    ]);

    res.json({
      logs: rows.map(serializeRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch technician activity",
      error: err.message,
    });
  }
}

// GET /api/technician-activity/filters — options for the admin dropdowns.
async function getTechnicianActivityFilters(_req, res) {
  try {
    res.json({
      categories: Object.entries(TECHNICIAN_ACTIVITY_CATEGORIES).map(
        ([value, label]) => ({ value, label })
      ),
      events: technicianActivityEventOptions(),
      outcomes: [
        { value: "success", label: "Success" },
        { value: "failure", label: "Failure" },
        { value: "blocked", label: "Blocked" },
      ],
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch activity filters",
      error: err.message,
    });
  }
}

// GET /api/technician-activity/summary?technician_id=&days=
// Counts per event for the header strip / technician profile.
async function getTechnicianActivitySummary(req, res) {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || "7", 10) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = await buildFilter({ ...req.query, from: since.toISOString() });

    const [byEvent, total] = await Promise.all([
      TechnicianActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: "$event", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 40 },
      ]),
      TechnicianActivityLog.countDocuments(filter),
    ]);

    res.json({
      days,
      total,
      events: byEvent.map((row) => ({
        event: row._id,
        label: technicianActivityLabel(row._id),
        severity: technicianActivitySeverity(row._id),
        count: row.count,
      })),
      failed_logins: byEvent
        .filter((row) => row._id === "auth.login.failed")
        .reduce((sum, row) => sum + row.count, 0),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch activity summary",
      error: err.message,
    });
  }
}

// GET /api/technician-activity/export — CSV of the current filter.
async function exportTechnicianActivity(req, res) {
  try {
    const filter = await buildFilter(req.query);
    const rows = await TechnicianActivityLog.find(filter)
      .sort({ at: -1 })
      .limit(MAX_EXPORT_ROWS)
      .populate("technician_id", "firstName lastName phone")
      .lean();

    const header = [
      "at",
      "technician",
      "phone",
      "event",
      "outcome",
      "message",
      "job_reference",
      "ip",
      "app_version",
      "platform",
    ];
    const escape = (value) => {
      const text = value == null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [header.join(",")];
    for (const row of rows) {
      const item = serializeRow(row);
      lines.push(
        [
          new Date(item.at).toISOString(),
          item.technician?.name || "",
          item.technician?.phone || item.identifier || "",
          item.event_label,
          item.outcome,
          item.message,
          item.job_reference,
          item.ip,
          item.app_version,
          item.platform,
        ]
          .map(escape)
          .join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="technician-activity-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    res.status(500).json({
      message: "Failed to export technician activity",
      error: err.message,
    });
  }
}

module.exports = {
  listTechnicianActivity,
  getTechnicianActivityFilters,
  getTechnicianActivitySummary,
  exportTechnicianActivity,
};
