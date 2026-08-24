/**
 * Shared mapping logic for importing historical jobs from the legacy Excel export.
 * Used by admin API import endpoint and the CLI script.
 */

const {
  normalizeLocationString,
  parseJobLocationToGeoPoint,
} = require("./parseJobLocation");
const { computeJobSearchFields } = require("./searchFields");

function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = excelEpoch.getTime() + value * 86400000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @deprecated prefer normalizeLocationString from parseJobLocation */
function normalizeLocation(raw) {
  return normalizeLocationString(raw);
}

/**
 * Historical rows are archive data, never live work — every legacy status maps
 * to a terminal status so imported jobs can never surface in dispatch queues or
 * a technician's active/session job lists.
 * Legacy A (accepted), S (started), P (pending) and H (hold) were all abandoned
 * in the old system; they are imported as cancelled.
 */
function mapStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  switch (s) {
    case "F":
    case "FF":
      return "completed";
    case "C":
    case "A":
    case "S":
    case "P":
    case "H":
    default:
      return "cancelled";
  }
}

function mapJobType(issue) {
  const i = String(issue || "").trim().toLowerCase();
  if (i === "tire repair") return "Tires";
  if (i === "change tire") return "tire_change";
  if (i === "lock door" || i === "key") return "keyless_car_opening";
  if (i === "gear" || i.includes("gearbox")) return "Gearbox";
  return "Engines";
}

function mapPaymentMethod(pmethod) {
  const p = String(pmethod || "").trim().toUpperCase();
  if (!p) return undefined;
  if (p === "CASH") return "cash";
  if (p === "QIB POS" || p === "LINK") return "card";
  return "card";
}

function buildCompletionNotes(techdesc, note) {
  const parts = [techdesc, note]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);
  const joined = parts.join("\n");
  return joined.slice(0, 2000);
}

const {
  matchLegacyVehicleFromCatalog,
} = require("./hatla2eeVehicleCatalog");

/** @deprecated use matchLegacyVehicleFromCatalog */
const parseLegacyVehicle = matchLegacyVehicleFromCatalog;

/**
 * Map one Excel row (object keyed by column headers) to a Job document payload.
 * Does not set assignedTechnician ObjectId or source — caller resolves those.
 *
 * @param {object} row
 * @returns {{ doc: object|null, error: string|null, techName: string|null }}
 */
function mapHistoricalRow(row) {
  const legacyId = row.id != null && row.id !== "" ? Number(row.id) : null;
  const clientName = String(row.cname ?? "").trim();
  const clientMobileNumber = String(row.cphone ?? "").trim();
  const location = normalizeLocationString(row.clocation);
  const locationCoordinates = parseJobLocationToGeoPoint(row.clocation);
  const issue = String(row.issue ?? "").trim() || "Unknown";
  const dateTime = parseDate(row.cdate);

  if (!clientName) {
    return { doc: null, error: "Missing client name", techName: null };
  }
  if (!clientMobileNumber) {
    return { doc: null, error: "Missing client phone", techName: null };
  }
  if (!location) {
    return { doc: null, error: "Missing location", techName: null };
  }
  if (!dateTime) {
    return { doc: null, error: "Missing or invalid date", techName: null };
  }

  const statusRaw = String(row.status || "").trim().toUpperCase();
  const job_status = mapStatus(statusRaw);
  const payment_method = mapPaymentMethod(row.pmethod);
  const price = Number(row.total);
  const safePrice = Number.isFinite(price) ? price : 0;

  const payment_status =
    payment_method && (statusRaw === "F" || statusRaw === "FF") ? "paid" : "unpaid";

  const accepted_at = parseDate(row.accepted);
  const arrived_at = parseDate(row.onlocation);
  const started_at = parseDate(row.started);
  const completed_at = parseDate(row.finished);

  const techName = row.techname != null ? String(row.techname).trim() : "";
  const canceledReason =
    row.canceled_reason != null && row.canceled_reason !== ""
      ? [String(row.canceled_reason)]
      : [];

  const { vehicleMake, vehicleModel, vehicleYear } = matchLegacyVehicleFromCatalog(row.cmodel);
  const licensePlate = row.cplateno != null ? String(row.cplateno).trim() : "";

  const doc = {
    ...(Number.isFinite(legacyId) ? { legacy_id: legacyId } : {}),
    clientName,
    clientMobileNumber,
    clientEmail: "",
    vehicleMake,
    vehicleModel,
    vehicleYear,
    licensePlate,
    vinNumber: "",
    issue,
    location,
    ...(locationCoordinates ? { locationCoordinates } : {}),
    dateTime,
    jobType: mapJobType(issue),
    price: safePrice,
    job_status,
    payment_status,
    payment_method,
    accepted_at: accepted_at || undefined,
    arrived_at: arrived_at || undefined,
    started_at: started_at || undefined,
    completed_at: completed_at || undefined,
    paid_at: payment_status === "paid" && completed_at ? completed_at : undefined,
    assigned_at: techName ? accepted_at || dateTime : undefined,
    completion_notes: buildCompletionNotes(row.techdesc, row.note),
    rejection_reasons: canceledReason,
    task_description: row.techdesc != null ? String(row.techdesc).trim() : "",
    legacyTechnicianName: techName || "",
    // insertMany skips JobSchema.pre("save"), so the admin prefix-search
    // digests have to be part of the inserted document.
    ...computeJobSearchFields({ clientName, clientMobileNumber }),
  };

  return { doc, error: null, techName: techName || null };
}

/**
 * Bulk-import mapped docs. Skips duplicates via legacy_id unique index.
 *
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Job
 * @param {import('mongoose').Model} opts.Source
 * @param {import('mongoose').Model} opts.Technician
 * @param {object[]} opts.rows - raw Excel row objects
 * @returns {Promise<{ imported: number, skipped: number, errors: Array<{row: number, legacy_id: *, message: string}> }>}
 */
async function importHistoricalJobs({ Job, Source, Technician, rows }) {
  let source = await Source.findOne({ mainSourceName: "Historical Import" });
  if (!source) {
    source = await Source.create({
      mainSourceName: "Historical Import",
      subSources: [],
      isActive: true,
    });
  }

  // Full name only, and only when it resolves to exactly one technician.
  // A first-name key silently credits every "Ahmed" row to the first Ahmed.
  const technicians = await Technician.find({}).select("_id firstName lastName").lean();
  const techByFullName = new Map();
  const ambiguousFullNames = new Set();
  for (const t of technicians) {
    const key = `${String(t.firstName || "").trim()} ${String(t.lastName || "").trim()}`
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (!key) continue;
    if (techByFullName.has(key)) {
      ambiguousFullNames.add(key);
      continue;
    }
    techByFullName.set(key, t._id);
  }
  for (const key of ambiguousFullNames) {
    techByFullName.delete(key);
  }

  const errors = [];
  const docs = [];
  const seenLegacy = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { doc, error, techName } = mapHistoricalRow(row);
    if (error || !doc) {
      errors.push({
        row: i + 2,
        legacy_id: row?.id ?? null,
        message: error || "Failed to map row",
      });
      continue;
    }

    if (doc.legacy_id != null) {
      if (seenLegacy.has(doc.legacy_id)) {
        errors.push({
          row: i + 2,
          legacy_id: doc.legacy_id,
          message: "Duplicate legacy_id in file",
        });
        continue;
      }
      seenLegacy.add(doc.legacy_id);
    }

    doc.source = source._id;
    if (techName) {
      const techId = techByFullName.get(
        techName.replace(/\s+/g, " ").trim().toLowerCase()
      );
      // No unique full-name match: leave assignedTechnician unset and keep the
      // sheet's name in legacyTechnicianName. Imported rows are always terminal,
      // so they never become a technician's active work either way.
      if (techId) {
        doc.assignedTechnician = techId;
      }
    }

    docs.push(doc);
  }

  if (docs.length === 0) {
    return { imported: 0, skipped: 0, errors };
  }

  // Skip rows that already exist by legacy_id
  const legacyIds = docs.map((d) => d.legacy_id).filter((id) => id != null);
  const existing = legacyIds.length
    ? await Job.find({ legacy_id: { $in: legacyIds } }).select("legacy_id").lean()
    : [];
  const existingSet = new Set(existing.map((e) => e.legacy_id));

  const toInsert = [];
  let skipped = 0;
  for (const doc of docs) {
    if (doc.legacy_id != null && existingSet.has(doc.legacy_id)) {
      skipped += 1;
      continue;
    }
    toInsert.push(doc);
  }

  let imported = 0;
  if (toInsert.length > 0) {
    try {
      const result = await Job.insertMany(toInsert, { ordered: false });
      imported = result.length;
    } catch (err) {
      // Partial success with ordered:false — count inserted + duplicate-key skips
      if (err.writeErrors && Array.isArray(err.writeErrors)) {
        const inserted = err.insertedDocs?.length ?? err.result?.nInserted ?? 0;
        imported = inserted;
        for (const we of err.writeErrors) {
          if (we.code === 11000) {
            skipped += 1;
          } else {
            errors.push({
              row: null,
              legacy_id: we.err?.op?.legacy_id ?? null,
              message: we.errmsg || we.message || "Insert failed",
            });
          }
        }
      } else if (err.code === 11000) {
        skipped += toInsert.length;
      } else {
        throw err;
      }
    }
  }

  return { imported, skipped, errors };
}

module.exports = {
  parseDate,
  normalizeLocation,
  mapStatus,
  mapJobType,
  mapPaymentMethod,
  parseLegacyVehicle,
  matchLegacyVehicleFromCatalog,
  mapHistoricalRow,
  importHistoricalJobs,
};
