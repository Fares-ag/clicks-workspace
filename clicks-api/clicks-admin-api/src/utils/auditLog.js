const AdminAuditLog = require("../../../clicks-shared/models/AdminAuditLog");

const MAX_CHANGES_BYTES = 8192;

const JOB_AUDIT_FIELDS = [
  "clientName",
  "clientMobileNumber",
  "clientEmail",
  "issue",
  "location",
  "locationCoordinates",
  "job_status",
  "assignedTechnician",
  "price",
  "source",
  "subSource",
  "jobType",
  "dateTime",
  "payment_status",
  "assigned_at",
  "cancelled_at",
  "vehicleMake",
  "vehicleModel",
  "vehicleYear",
  "licensePlate",
  "vinNumber",
  "estimate",
  "technician_estimate",
  "task_description",
  "customerSignatureUrl",
  "customerSignedAt",
  "customerSignatureInvalidatedAt",
  "completed_at",
  "payment_method",
  // Not writable from PUT /api/jobs/:id (see ADMIN_EDITABLE_JOB_FIELDS), but
  // diffed so that any future path that does write them leaves a trail.
  "paid_at",
  "business_id",
  "partner_id",
  "finance_status",
  "finance_revenue",
  "finance_cost_total",
  "finance_net_profit",
  "finance_audited_by",
  "finance_audited_at",
];

function getClientIp(req) {
  if (!req) return "";
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.ip || "";
}

function serializeAuditValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value._id != null && Object.keys(value).length <= 3) {
      return String(value._id);
    }
    if (Array.isArray(value)) {
      return value.map(serializeAuditValue);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeAuditValue(v);
    }
    return out;
  }
  return value;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff selected fields between two plain documents.
 * @returns {Record<string, { from: *, to: * }>}
 */
function computeChanges(before, after, fieldNames = []) {
  const beforeObj =
    before && typeof before.toObject === "function" ? before.toObject() : before || {};
  const afterObj =
    after && typeof after.toObject === "function" ? after.toObject() : after || {};

  const changes = {};
  for (const field of fieldNames) {
    const from = serializeAuditValue(beforeObj[field]);
    const to = serializeAuditValue(afterObj[field]);
    if (!valuesEqual(from, to)) {
      changes[field] = { from, to };
    }
  }
  return changes;
}

function computeJobChanges(before, after, extraFields = []) {
  const fields = [...new Set([...JOB_AUDIT_FIELDS, ...extraFields])];
  return computeChanges(before, after, fields);
}

function capChanges(changes) {
  if (changes == null) return changes;
  try {
    const serialized = JSON.stringify(changes);
    if (Buffer.byteLength(serialized, "utf8") <= MAX_CHANGES_BYTES) {
      return changes;
    }
    return {
      _truncated: true,
      _byteLength: Buffer.byteLength(serialized, "utf8"),
      _preview: serialized.slice(0, Math.max(0, MAX_CHANGES_BYTES - 128)),
    };
  } catch (err) {
    return { _truncated: true, _error: "changes_not_serializable" };
  }
}

/**
 * Append an admin audit row. Never throws — failures are logged only.
 */
async function recordAudit({ req, action, entityType, entityId, changes }) {
  try {
    const adminId = req?.user?.id || req?.user?._id;
    if (!adminId) {
      console.error("AdminAuditLog skipped: missing admin id on req.user");
      return;
    }

    await AdminAuditLog.create({
      admin_id: adminId,
      admin_role: req.user?.role || "",
      action,
      entity_type: entityType,
      entity_id: entityId,
      changes: capChanges(changes),
      ip: getClientIp(req),
    });
  } catch (err) {
    console.error("AdminAuditLog record failed:", err.message);
  }
}

function omitChangeKeys(changes, keys) {
  if (!changes || typeof changes !== "object") return {};
  const out = { ...changes };
  for (const key of keys) {
    delete out[key];
  }
  return out;
}

module.exports = {
  JOB_AUDIT_FIELDS,
  computeChanges,
  computeJobChanges,
  capChanges,
  recordAudit,
  omitChangeKeys,
  serializeAuditValue,
};
