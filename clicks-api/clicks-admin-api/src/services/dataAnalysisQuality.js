const mongoose = require("mongoose");
const Job = require("clicks-shared/models/Job");
const Lead = require("clicks-shared/models/Lead");
const IssueAlias = require("clicks-shared/models/IssueAlias");
const { JOB_TYPES } = require("clicks-shared/constants/jobTypes");
const { getIssueById } = require("clicks-shared/constants/jobIssueCatalog");
const { getAreaById } = require("clicks-shared/constants/qatarAreas");
const {
  normalizeJobVehicle,
  vehicleIsCatalogSafe,
  normalizeJobIssue,
  normalizeJobType,
  normalizeLocationArea,
  normalizePlate,
} = require("clicks-shared/utils/dataCleaning");
const { recordAudit } = require("../utils/auditLog");
const {
  parseFilters,
  buildJobMatch,
} = require("./dataAnalysisFilters");
const {
  loadAliases,
  groupRaw,
  bumpAnalysisCache,
  resolveCanonicalMatch,
} = require("./dataAnalysisService");

const QUALITY_FIELDS = new Set([
  "issue",
  "vehicle",
  "jobType",
  "customerName",
  "location",
  "plate",
]);

function suggestionDiffers(rawLabel, suggestedLabel) {
  return String(rawLabel || "").trim().toLowerCase() !== String(suggestedLabel || "").trim().toLowerCase();
}

function clusterFrom(field, raw, suggested, count, revenue) {
  return {
    field,
    raw,
    suggested,
    jobCount: count,
    revenue: Math.round((revenue || 0) * 100) / 100,
    confidence: suggested.confidence ?? 0,
    method: suggested.method || "unmatched",
    needsReview:
      suggested.method === "unmatched" ||
      (suggested.confidence ?? 0) < 0.85 ||
      suggestionDiffers(suggested.compareRaw, suggested.compareCanonical),
  };
}

async function buildClusters(field, match, aliases) {
  if (field === "issue") {
    const rows = await groupRaw(match, "$issue", 2000);
    return rows.map((row) => {
      const hit = normalizeJobIssue(row._id || "", "", aliases.issue);
      return clusterFrom(
        "issue",
        { issue: row._id || "" },
        {
          issueId: hit.canonicalIssueId,
          issue: hit.canonicalIssueLabel,
          jobType: hit.suggestedJobType,
          confidence: hit.confidence,
          method: hit.method,
          compareRaw: row._id || "",
          compareCanonical: hit.canonicalIssueLabel,
        },
        row.count,
        row.revenue
      );
    });
  }

  if (field === "vehicle") {
    const rows = await groupRaw(match, { make: "$vehicleMake", model: "$vehicleModel" }, 800);
    return rows.map((row) => {
      const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
      const rawLabel = `${row._id?.make || ""} ${row._id?.model || ""}`.trim();
      const canonLabel = `${hit.canonicalMake || ""} ${hit.canonicalModel || ""}`.trim();
      return clusterFrom(
        "vehicle",
        { vehicleMake: row._id?.make || "", vehicleModel: row._id?.model || "" },
        {
          vehicleMake: hit.canonicalMake,
          vehicleModel: hit.canonicalModel,
          vehicleYear: hit.canonicalYear,
          confidence: hit.confidence,
          method: hit.method,
          compareRaw: rawLabel,
          compareCanonical: canonLabel,
        },
        row.count,
        row.revenue
      );
    });
  }

  if (field === "jobType") {
    const rows = await groupRaw(match, "$jobType", 80);
    return rows.map((row) => {
      const hit = normalizeJobType(row._id || "");
      return clusterFrom(
        "jobType",
        { jobType: row._id || "" },
        {
          jobType: hit.canonicalJobType,
          confidence: hit.confidence,
          method: hit.method,
          compareRaw: row._id || "",
          compareCanonical: hit.canonicalJobType,
        },
        row.count,
        row.revenue
      );
    });
  }

  if (field === "customerName") {
    const rows = await Job.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            phone: { $ifNull: ["$search_phone", ""] },
            name: { $ifNull: ["$clientName", ""] },
          },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$price", 0] } },
        },
      },
      { $match: { "_id.phone": { $nin: [null, ""] } } },
      { $sort: { count: -1 } },
      { $limit: 800 },
    ]);
    const byPhone = new Map();
    for (const row of rows) {
      const list = byPhone.get(row._id.phone) || [];
      list.push(row);
      byPhone.set(row._id.phone, list);
    }
    const clusters = [];
    for (const [phone, list] of byPhone) {
      if (list.length < 2) continue;
      const top = list[0];
      for (const row of list.slice(1)) {
        clusters.push(
          clusterFrom(
            "customerName",
            { clientName: row._id.name, phoneKey: phone },
            {
              clientName: top._id.name,
              phoneKey: phone,
              confidence: 0.6,
              method: "duplicateName",
              compareRaw: row._id.name,
              compareCanonical: top._id.name,
            },
            row.count,
            row.revenue
          )
        );
      }
    }
    return clusters;
  }

  if (field === "location") {
    const rows = await groupRaw(match, "$location", 800);
    return rows.map((row) => {
      const hit = normalizeLocationArea(row._id || "", null, aliases.area);
      return clusterFrom(
        "location",
        { location: row._id || "" },
        {
          areaId: hit.areaId,
          areaLabel: hit.areaLabel,
          confidence: hit.method === "unmatched" ? 0 : 0.8,
          method: hit.method,
          compareRaw: row._id || "",
          compareCanonical: hit.areaLabel,
        },
        row.count,
        row.revenue
      );
    });
  }

  const rows = await groupRaw(match, "$licensePlate", 500);
  return rows.map((row) => {
    const hit = normalizePlate(row._id || "");
    return clusterFrom(
      "plate",
      { licensePlate: row._id || "" },
      {
        licensePlate: hit.canonicalPlate,
        confidence: hit.isEmpty ? 0 : 1,
        method: hit.isEmpty ? "unmatched" : hit.canonicalPlate === (row._id || "").trim() ? "exact" : "alias",
        compareRaw: row._id || "",
        compareCanonical: hit.canonicalPlate,
      },
      row.count,
      row.revenue
    );
  });
}

async function listQuality(query) {
  const filters = parseFilters(query);
  const field = QUALITY_FIELDS.has(filters.field) ? filters.field : "issue";
  const aliases = await loadAliases();
  const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
  const clusters = (await buildClusters(field, match, aliases))
    .filter((row) => row.needsReview)
    .sort((a, b) => b.jobCount - a.jobCount);
  const start = (filters.page - 1) * filters.limit;
  return {
    field,
    items: clusters.slice(start, start + filters.limit),
    total: clusters.length,
    page: filters.page,
    limit: filters.limit,
  };
}

function applyFilterFromRaw(field, raw = {}) {
  if (field === "issue") return { issue: raw.issue ?? "" };
  if (field === "vehicle") {
    return {
      vehicleMake: raw.vehicleMake ?? "",
      vehicleModel: raw.vehicleModel ?? "",
    };
  }
  if (field === "jobType") return { jobType: raw.jobType ?? "" };
  if (field === "customerName") {
    return {
      search_phone: raw.phoneKey ?? "",
      clientName: raw.clientName ?? "",
    };
  }
  if (field === "location") return { location: raw.location ?? "" };
  if (field === "plate") return { licensePlate: raw.licensePlate ?? "" };
  return {};
}

function canonicalUpdate(field, canonical = {}) {
  if (field === "issue") {
    const issue = getIssueById(canonical.issueId);
    if (!issue || issue.id === "unmapped") {
      throw Object.assign(new Error("Pick a catalog issue before applying"), { status: 400 });
    }
    const update = { issue: canonical.issue || issue?.label };
    if (canonical.jobType && JOB_TYPES.includes(canonical.jobType)) {
      update.jobType = canonical.jobType;
    } else if (issue?.jobType) {
      update.jobType = issue.jobType;
    }
    return update;
  }
  if (field === "vehicle") {
    if (!vehicleIsCatalogSafe(canonical.vehicleMake, canonical.vehicleModel)) {
      throw Object.assign(new Error("Canonical make/model must exist in the vehicle catalog"), {
        status: 400,
      });
    }
    const update = {
      vehicleMake: canonical.vehicleMake,
      vehicleModel: canonical.vehicleModel || "",
    };
    if (canonical.vehicleYear != null && canonical.vehicleYear !== "") {
      update.vehicleYear = Number(canonical.vehicleYear);
    }
    return update;
  }
  if (field === "jobType") {
    if (!JOB_TYPES.includes(canonical.jobType)) {
      throw Object.assign(new Error("Canonical job type must be a current catalog value"), {
        status: 400,
      });
    }
    return { jobType: canonical.jobType };
  }
  if (field === "customerName") {
    if (!String(canonical.clientName || "").trim()) {
      throw Object.assign(new Error("Canonical customer name is required"), { status: 400 });
    }
    return { clientName: String(canonical.clientName).trim() };
  }
  if (field === "plate") {
    const plate = normalizePlate(canonical.licensePlate);
    if (!plate.canonicalPlate) {
      throw Object.assign(new Error("Canonical plate is required"), { status: 400 });
    }
    return { licensePlate: plate.canonicalPlate };
  }
  throw Object.assign(
    new Error("Location text is not overwritten — add an area alias instead"),
    { status: 400 }
  );
}

async function previewQuality(body = {}, query = {}) {
  const filters = parseFilters({ ...query, ...body });
  const field = QUALITY_FIELDS.has(body.field || filters.field)
    ? body.field || filters.field
    : "issue";
  const aliases = await loadAliases();
  const match = {
    ...(await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases)),
    ...applyFilterFromRaw(field, body.raw || {}),
  };
  const matchedCount = await Job.countDocuments(match);
  const samples = await Job.find(match)
    .select("job_reference clientName issue vehicleMake vehicleModel jobType licensePlate")
    .limit(8)
    .lean();
  let update = null;
  let error = "";
  try {
    update = field === "location" ? null : canonicalUpdate(field, body.canonical || {});
  } catch (err) {
    error = err.message;
  }
  return {
    field,
    matchedCount,
    wouldChange: update,
    error,
    samples: samples.map((job) => ({
      id: String(job._id),
      jobReference: job.job_reference || "",
      clientName: job.clientName,
      issue: job.issue,
      vehicle: `${job.vehicleMake || ""} ${job.vehicleModel || ""}`.trim(),
      jobType: job.jobType,
      licensePlate: job.licensePlate || "",
    })),
  };
}

async function applyQuality(req) {
  const body = req.body || {};
  const filters = parseFilters({ ...req.query, ...body });
  const field = QUALITY_FIELDS.has(body.field) ? body.field : "";
  if (!field) {
    const err = new Error("field is required");
    err.status = 400;
    throw err;
  }
  if (field === "location") {
    const err = new Error("Location rows are cleaned by adding an alias, not by rewriting addresses");
    err.status = 400;
    throw err;
  }
  if ((body.matchedCount || 0) > 5000 && body.confirmLarge !== true) {
    const err = new Error("This apply touches more than 5000 jobs. Set confirmLarge=true to continue.");
    err.status = 400;
    throw err;
  }

  const aliases = await loadAliases();
  const match = {
    ...(await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases)),
    ...applyFilterFromRaw(field, body.raw || {}),
  };
  const update = canonicalUpdate(field, body.canonical || {});
  const result = await Job.updateMany(match, { $set: update });

  let leadsUpdated = 0;
  if (body.alsoUpdateLeads && (field === "vehicle" || field === "issue")) {
    const leadMatch = {};
    if (field === "vehicle") {
      leadMatch.vehicleMake = body.raw?.vehicleMake ?? "";
      leadMatch.vehicleModel = body.raw?.vehicleModel ?? "";
      const leadUpdate = {
        vehicleMake: update.vehicleMake,
        vehicleModel: update.vehicleModel,
      };
      const leadResult = await Lead.updateMany(leadMatch, { $set: leadUpdate });
      leadsUpdated = leadResult.modifiedCount || 0;
    } else if (field === "issue") {
      const leadResult = await Lead.updateMany(
        { inquiry: body.raw?.issue ?? "" },
        { $set: { inquiry: update.issue } }
      );
      leadsUpdated = leadResult.modifiedCount || 0;
    }
  }

  bumpAnalysisCache();
  await recordAudit({
    req,
    action: "data_analysis.apply",
    entityType: "DataAnalysis",
    entityId: new mongoose.Types.ObjectId(),
    changes: {
      field,
      raw: body.raw || {},
      canonical: update,
      modifiedCount: result.modifiedCount || 0,
      matchedCount: result.matchedCount || 0,
      leadsUpdated,
    },
  });

  return {
    field,
    modifiedCount: result.modifiedCount || 0,
    matchedCount: result.matchedCount || 0,
    leadsUpdated,
    update,
  };
}

async function addAlias(req) {
  const body = req.body || {};
  const field = body.field === "vehicle" || body.field === "area" ? body.field : "issue";
  const alias = String(body.alias || "").trim();
  if (!alias) {
    const err = new Error("alias is required");
    err.status = 400;
    throw err;
  }
  const doc = {
    field,
    alias,
    created_by: req.user?.id || null,
  };
  if (field === "issue") {
    if (!getIssueById(body.canonicalIssueId)) {
      const err = new Error("canonicalIssueId must be a catalog issue");
      err.status = 400;
      throw err;
    }
    doc.canonicalIssueId = body.canonicalIssueId;
  } else if (field === "vehicle") {
    if (!vehicleIsCatalogSafe(body.canonicalMake, body.canonicalModel)) {
      const err = new Error("canonical make/model must exist in the vehicle catalog");
      err.status = 400;
      throw err;
    }
    doc.canonicalMake = body.canonicalMake;
    doc.canonicalModel = body.canonicalModel || "";
  } else if (!getAreaById(body.areaId)) {
    const err = new Error("areaId must be a known Qatar area");
    err.status = 400;
    throw err;
  } else {
    doc.areaId = body.areaId;
  }

  const saved = await IssueAlias.findOneAndUpdate(
    { field, alias },
    { $set: doc },
    { upsert: true, new: true }
  );
  bumpAnalysisCache();
  await recordAudit({
    req,
    action: "data_analysis.alias",
    entityType: "IssueAlias",
    entityId: saved._id,
    changes: { field, alias, canonical: doc },
  });
  return { alias: saved };
}

module.exports = {
  listQuality,
  previewQuality,
  applyQuality,
  addAlias,
};
