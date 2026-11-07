const mongoose = require("mongoose");
const Source = require("clicks-shared/models/Source");
const { isHiddenSourceName } = require("clicks-shared/utils/systemSources");
const { startOfQatarDay, endOfQatarDay } = require("../utils/qatarDay");

function parseYmd(value) {
  const text = String(value || "").slice(0, 10);
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function asObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

function parseFilters(query = {}) {
  let from = parseYmd(query.from);
  let to = parseYmd(query.to);
  const excludeHistorical =
    query.excludeHistoricalImport == null ||
    query.excludeHistoricalImport === "" ||
    String(query.excludeHistoricalImport) !== "false";

  let jobStatus = String(query.jobStatus || "completed").trim();
  if (jobStatus === "all") jobStatus = "all";

  if (from && to && from.getTime() > to.getTime()) {
    const swapped = from;
    from = to;
    to = swapped;
  }

  return {
    from,
    to,
    jobStatus,
    sourceId: asObjectId(query.sourceId),
    canonicalJobType: String(query.canonicalJobType || "").trim(),
    canonicalIssueId: String(query.canonicalIssueId || "").trim(),
    canonicalMake: String(query.canonicalMake || "").trim(),
    canonicalModel: String(query.canonicalModel || "").trim(),
    areaId: String(query.areaId || "").trim(),
    businessId: asObjectId(query.businessId),
    excludeHistoricalImport: excludeHistorical,
    view: String(query.view || "canonical").trim() === "raw" ? "raw" : "canonical",
    rawIssue: query.rawIssue != null ? String(query.rawIssue) : "",
    rawMake: query.rawMake != null ? String(query.rawMake) : "",
    rawModel: query.rawModel != null ? String(query.rawModel) : "",
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 20)),
    facet: String(query.facet || "").trim(),
    rows: String(query.rows || "").trim(),
    cols: String(query.cols || "").trim(),
    field: String(query.field || "issue").trim(),
    dataset: String(query.dataset || "issues").trim(),
  };
}

const SOURCE_TTL_MS = 60000;
let sourceCache = { at: 0, rows: null };

async function loadSources() {
  const now = Date.now();
  if (sourceCache.rows && now - sourceCache.at < SOURCE_TTL_MS) return sourceCache.rows;
  const rows = await Source.find({}, "mainSourceName").lean();
  sourceCache = { at: now, rows };
  return rows;
}

async function hiddenSourceIds() {
  return (await loadSources())
    .filter((row) => isHiddenSourceName(row.mainSourceName))
    .map((row) => row._id);
}

async function sourceNameMap() {
  const map = new Map();
  for (const row of await loadSources()) {
    map.set(String(row._id), row.mainSourceName || "Unknown");
  }
  return map;
}

function dateFieldForStatus(jobStatus) {
  return jobStatus === "completed" ? "completed_at" : "dateTime";
}

async function buildJobMatch(filters) {
  const match = {};
  if (filters.jobStatus && filters.jobStatus !== "all") {
    match.job_status = filters.jobStatus;
  }
  if (filters.businessId) match.business_id = filters.businessId;

  if (filters.from || filters.to) {
    const range = {};
    if (filters.from) range.$gte = startOfQatarDay(filters.from);
    if (filters.to) range.$lte = endOfQatarDay(filters.to);
    if (dateFieldForStatus(filters.jobStatus) === "completed_at") {
      match.completed_at = range;
    } else {
      match.dateTime = range;
    }
  }

  if (filters.excludeHistoricalImport) {
    match.legacy_id = { $exists: false };
    if (filters.sourceId) {
      const hidden = await hiddenSourceIds();
      const blocked = hidden.some((id) => String(id) === String(filters.sourceId));
      match.source = blocked ? { $in: [] } : filters.sourceId;
    }
  } else if (filters.sourceId) {
    match.source = filters.sourceId;
  }

  if (filters.rawIssue) match.issue = filters.rawIssue;
  if (filters.rawMake) match.vehicleMake = filters.rawMake;
  if (filters.rawModel) match.vehicleModel = filters.rawModel;

  return match;
}

function cacheKey(prefix, filters) {
  return `clicks:admin:payload:data-analysis:${prefix}:${JSON.stringify(filters)}`;
}

function toCsvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => toCsvCell(row[key])).join(","));
  }
  return lines.join("\n");
}

module.exports = {
  parseFilters,
  asObjectId,
  buildJobMatch,
  sourceNameMap,
  cacheKey,
  rowsToCsv,
};
