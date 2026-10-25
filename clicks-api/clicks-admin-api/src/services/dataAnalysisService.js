const Job = require("clicks-shared/models/Job");
const IssueAlias = require("clicks-shared/models/IssueAlias");
const { getCachedPayload } = require("clicks-shared/utils/payloadCache");
const { listJobIssues, getIssueById } = require("clicks-shared/constants/jobIssueCatalog");
const { QATAR_AREAS } = require("clicks-shared/constants/qatarAreas");
const {
  normalizeJobVehicle,
  normalizeJobIssue,
  normalizeJobType,
  normalizeCustomerKey,
  pickDisplayName,
  normalizeLocationArea,
  normalizePlate,
} = require("clicks-shared/utils/dataCleaning");
const { parseFilters, buildJobMatch, sourceNameMap, cacheKey } = require("./dataAnalysisFilters");

const TTL_MS = 90000;
let cacheEpoch = 0;

function bumpAnalysisCache() {
  cacheEpoch += 1;
}

async function loadAliases() {
  const rows = await IssueAlias.find({}).lean();
  return {
    issue: rows
      .filter((r) => r.field === "issue")
      .map((r) => ({ alias: r.alias, canonicalIssueId: r.canonicalIssueId })),
    area: rows
      .filter((r) => r.field === "area")
      .map((r) => ({ alias: r.alias, areaId: r.areaId })),
  };
}

async function cached(name, filters, compute) {
  return getCachedPayload(
    `${cacheKey(name, filters)}:e${cacheEpoch}`,
    TTL_MS,
    compute
  );
}

async function groupRaw(match, groupId, limit = 500) {
  return Job.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupId,
        count: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$price", 0] } },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
}

function mergeCanonical(rawRows, keyFn, extra = {}) {
  const buckets = new Map();
  for (const row of rawRows) {
    const mapped = keyFn(row);
    const key = mapped.key;
    const current = buckets.get(key) || {
      ...mapped.base,
      count: 0,
      revenue: 0,
      rawValues: [],
      rawCount: 0,
    };
    current.count += row.count;
    current.revenue += row.revenue;
    current.rawCount += 1;
    if (current.rawValues.length < 12) {
      current.rawValues.push({
        raw: mapped.raw,
        count: row.count,
        revenue: row.revenue,
      });
    }
    buckets.set(key, current);
  }
  const items = [...buckets.values()].sort((a, b) => b.count - a.count);
  return { items, totalJobs: items.reduce((sum, row) => sum + row.count, 0), ...extra };
}

function pct(part, whole) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

async function resolveCanonicalMatch(match, filters, aliases) {
  const extra = {};
  if (filters.canonicalIssueId) {
    const rows = await groupRaw(match, "$issue", 2000);
    extra.issue = {
      $in: rows
        .filter((row) => normalizeJobIssue(row._id || "", "", aliases.issue).canonicalIssueId === filters.canonicalIssueId)
        .map((row) => row._id),
    };
  }
  if (filters.canonicalMake || filters.canonicalModel) {
    const rows = await groupRaw(match, { make: "$vehicleMake", model: "$vehicleModel" }, 800);
    const allowed = rows.filter((row) => {
      const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
      if (filters.canonicalMake && hit.canonicalMake !== filters.canonicalMake) return false;
      if (filters.canonicalModel && hit.canonicalModel !== filters.canonicalModel) return false;
      return true;
    });
    extra.$or = allowed.map((row) => ({
      vehicleMake: row._id?.make || "",
      vehicleModel: row._id?.model || "",
    }));
    if (!extra.$or.length) extra.$or = [{ _id: { $exists: false } }];
  }
  if (filters.canonicalJobType) {
    const rows = await groupRaw(match, "$jobType", 80);
    extra.jobType = {
      $in: rows
        .filter((row) => normalizeJobType(row._id || "").canonicalJobType === filters.canonicalJobType)
        .map((row) => row._id),
    };
  }
  if (filters.areaId) {
    const rows = await groupRaw(match, "$location", 800);
    extra.location = {
      $in: rows
        .filter((row) => normalizeLocationArea(row._id || "", null, aliases.area).areaId === filters.areaId)
        .map((row) => row._id),
    };
  }
  return { ...match, ...extra };
}

async function context() {
  const [aliases, sources] = await Promise.all([loadAliases(), sourceNameMap()]);
  return { aliases, sources };
}

async function getOverview(query) {
  const filters = parseFilters(query);
  return cached("overview", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const [totals, customers, issueRows, vehicleRows, plateRows, coordRows] = await Promise.all([
      Job.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            jobs: { $sum: 1 },
            revenue: { $sum: { $ifNull: ["$price", 0] } },
          },
        },
      ]),
      Job.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ["$search_phone", ""] }, count: { $sum: 1 } } },
        { $match: { _id: { $nin: [null, ""] } } },
      ]),
      groupRaw(match, "$issue", 2000),
      groupRaw(match, { make: "$vehicleMake", model: "$vehicleModel" }, 800),
      Job.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ["$licensePlate", ""] }, count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ["$locationCoordinates.coordinates", []] } }, 1] },
                "has",
                "missing",
              ],
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const jobs = totals[0]?.jobs || 0;
    const revenue = totals[0]?.revenue || 0;
    const uniqueCustomers = customers.length;
    const repeatCustomers = customers.filter((row) => row.count >= 2).length;

    const issues = mergeCanonical(issueRows, (row) => {
      const hit = normalizeJobIssue(row._id || "", "", aliases.issue);
      return {
        key: hit.canonicalIssueId,
        raw: row._id || "",
        base: {
          id: hit.canonicalIssueId,
          label: hit.canonicalIssueLabel,
          jobType: hit.suggestedJobType,
          method: hit.method,
        },
      };
    });
    const vehicles = mergeCanonical(vehicleRows, (row) => {
      const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
      const key = `${hit.canonicalMake}|${hit.canonicalModel}` || "unmapped";
      return {
        key: hit.canonicalMake ? key : "unmapped",
        raw: `${row._id?.make || ""} ${row._id?.model || ""}`.trim(),
        base: {
          make: hit.canonicalMake || "Unmapped",
          model: hit.canonicalModel || "",
          method: hit.method,
        },
      };
    });

    const unmatchedIssues = issues.items
      .filter((row) => row.id === "unmapped")
      .reduce((sum, row) => sum + row.count, 0);
    const unmatchedVehicles = vehicles.items
      .filter((row) => row.make === "Unmapped")
      .reduce((sum, row) => sum + row.count, 0);
    const missingPlate = plateRows
      .filter((row) => !normalizePlate(row._id).canonicalPlate)
      .reduce((sum, row) => sum + row.count, 0);
    const missingCoords = coordRows.find((row) => row._id === "missing")?.count || 0;

    return {
      generatedAt: new Date().toISOString(),
      jobs,
      revenue: Math.round(revenue * 100) / 100,
      avgTicket: jobs ? Math.round((revenue / jobs) * 100) / 100 : 0,
      uniqueCustomers,
      repeatCustomers,
      repeatRate: pct(repeatCustomers, uniqueCustomers),
      coverage: {
        issueMatched: pct(jobs - unmatchedIssues, jobs),
        vehicleMatched: pct(jobs - unmatchedVehicles, jobs),
        hasPlate: pct(jobs - missingPlate, jobs),
        hasCoords: pct(jobs - missingCoords, jobs),
      },
      topIssues: issues.items.slice(0, 5),
      topMakes: mergeCanonical(vehicleRows, (row) => {
        const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
        return {
          key: hit.canonicalMake || "unmapped",
          raw: row._id?.make || "",
          base: { make: hit.canonicalMake || "Unmapped" },
        };
      }).items.slice(0, 5),
    };
  });
}

async function getIssues(query) {
  const filters = parseFilters(query);
  return cached("issues", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const [issueRows, vehicleRows, locationRows] = await Promise.all([
      groupRaw(match, "$issue", 2000),
      groupRaw(match, { issue: "$issue", make: "$vehicleMake", model: "$vehicleModel" }, 1200),
      groupRaw(match, { issue: "$issue", location: "$location" }, 1200),
    ]);
    const merged = mergeCanonical(issueRows, (row) => {
      const hit = normalizeJobIssue(row._id || "", "", aliases.issue);
      return {
        key: filters.view === "raw" ? `raw:${row._id || ""}` : hit.canonicalIssueId,
        raw: row._id || "",
        base: {
          id: filters.view === "raw" ? row._id || "blank" : hit.canonicalIssueId,
          label: filters.view === "raw" ? row._id || "(blank)" : hit.canonicalIssueLabel,
          jobType: hit.suggestedJobType,
          method: hit.method,
          confidence: hit.confidence,
        },
      };
    });
    const total = merged.totalJobs || 1;
    for (const item of merged.items) {
      item.percentage = pct(item.count, total);
      const makes = mergeCanonical(
        vehicleRows.filter((row) =>
          item.rawValues.some((raw) => raw.raw === (row._id?.issue || ""))
        ),
        (row) => {
          const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
          return {
            key: hit.canonicalMake || "unmapped",
            raw: row._id?.make || "",
            base: { make: hit.canonicalMake || "Unmapped" },
          };
        }
      );
      item.topMake = makes.items[0]?.make || "";
      const areas = mergeCanonical(
        locationRows.filter((row) =>
          item.rawValues.some((raw) => raw.raw === (row._id?.issue || ""))
        ),
        (row) => {
          const hit = normalizeLocationArea(row._id?.location || "", null, aliases.area);
          return {
            key: hit.areaId,
            raw: row._id?.location || "",
            base: { areaId: hit.areaId, areaLabel: hit.areaLabel },
          };
        }
      );
      item.topArea = areas.items[0]?.areaLabel || "";
    }
    return { items: merged.items, totalJobs: merged.totalJobs };
  });
}

async function getVehicles(query) {
  const filters = parseFilters(query);
  return cached("vehicles", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const [vehicleRows, issueRows, yearRows] = await Promise.all([
      groupRaw(match, { make: "$vehicleMake", model: "$vehicleModel" }, 800),
      groupRaw(match, { make: "$vehicleMake", model: "$vehicleModel", issue: "$issue" }, 1500),
      groupRaw(match, "$vehicleYear", 40),
    ]);
    const models = mergeCanonical(vehicleRows, (row) => {
      const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
      const key =
        filters.view === "raw"
          ? `raw:${row._id?.make || ""}|${row._id?.model || ""}`
          : `${hit.canonicalMake || "unmapped"}|${hit.canonicalModel || ""}`;
      return {
        key,
        raw: `${row._id?.make || ""} ${row._id?.model || ""}`.trim(),
        base: {
          make: filters.view === "raw" ? row._id?.make || "Unmapped" : hit.canonicalMake || "Unmapped",
          model: filters.view === "raw" ? row._id?.model || "" : hit.canonicalModel || "",
          method: hit.method,
          confidence: hit.confidence,
        },
      };
    });
    for (const item of models.items) {
      const issues = mergeCanonical(
        issueRows.filter((row) => {
          const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
          return (
            (hit.canonicalMake || "Unmapped") === item.make &&
            (hit.canonicalModel || "") === item.model
          );
        }),
        (row) => {
          const hit = normalizeJobIssue(row._id?.issue || "", "", aliases.issue);
          return {
            key: hit.canonicalIssueId,
            raw: row._id?.issue || "",
            base: { id: hit.canonicalIssueId, label: hit.canonicalIssueLabel },
          };
        }
      );
      item.topIssue = issues.items[0]?.label || "";
    }
    const years = yearRows
      .map((row) => ({
        year: row._id == null || row._id === "" ? "Unknown" : Number(row._id) || String(row._id),
        count: row.count,
        revenue: row.revenue,
      }))
      .sort((a, b) => String(b.year).localeCompare(String(a.year)));
    const makes = mergeCanonical(vehicleRows, (row) => {
      const hit = normalizeJobVehicle({ make: row._id?.make, model: row._id?.model });
      return {
        key: hit.canonicalMake || "unmapped",
        raw: row._id?.make || "",
        base: { make: hit.canonicalMake || "Unmapped" },
      };
    });
    return { makes: makes.items, models: models.items, years, totalJobs: models.totalJobs };
  });
}

async function getCustomers(query) {
  const filters = parseFilters(query);
  return cached(`customers:${filters.page}:${filters.limit}`, filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const rows = await Job.aggregate([
      { $match: match },
      { $sort: { dateTime: -1 } },
      {
        $group: {
          _id: { $ifNull: ["$search_phone", ""] },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$price", 0] } },
          lastJob: { $first: "$dateTime" },
          lastIssue: { $first: "$issue" },
          lastMake: { $first: "$vehicleMake" },
          lastModel: { $first: "$vehicleModel" },
          names: { $addToSet: "$clientName" },
          customerId: { $first: "$customer_id" },
        },
      },
      { $match: { _id: { $nin: [null, ""] } } },
      { $sort: { count: -1, lastJob: -1 } },
    ]);
    const items = rows.map((row) => {
      const names = (row.names || []).filter(Boolean);
      const nameCounts = {};
      for (const name of names) nameCounts[name] = (nameCounts[name] || 0) + 1;
      const issue = normalizeJobIssue(row.lastIssue || "", "", aliases.issue);
      const vehicle = normalizeJobVehicle({ make: row.lastMake, model: row.lastModel });
      return {
        phoneKey: row._id,
        displayName: pickDisplayName(nameCounts) || names[0] || "",
        nameVariants: names,
        nameVariantCount: names.length,
        jobs: row.count,
        revenue: Math.round((row.revenue || 0) * 100) / 100,
        lastJob: row.lastJob,
        topIssue: issue.canonicalIssueLabel,
        topMake: vehicle.canonicalMake || row.lastMake || "",
        topModel: vehicle.canonicalModel || row.lastModel || "",
        customerId: row.customerId ? String(row.customerId) : "",
        duplicateName: names.length > 1,
      };
    });
    const start = (filters.page - 1) * filters.limit;
    return {
      items: items.slice(start, start + filters.limit),
      total: items.length,
      page: filters.page,
      limit: filters.limit,
    };
  });
}

async function getServices(query) {
  const filters = parseFilters(query);
  return cached("services", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const [typeRows, nestedRows] = await Promise.all([
      groupRaw(match, "$jobType", 80),
      groupRaw(match, { jobType: "$jobType", issue: "$issue" }, 1500),
    ]);
    const services = mergeCanonical(typeRows, (row) => {
      const hit = normalizeJobType(row._id || "");
      return {
        key: filters.view === "raw" ? `raw:${row._id || ""}` : hit.canonicalJobType || "unmapped",
        raw: row._id || "",
        base: {
          jobType: filters.view === "raw" ? row._id || "(blank)" : hit.canonicalJobType || "Unmapped",
          method: hit.method,
        },
      };
    });
    for (const item of services.items) {
      item.issues = mergeCanonical(
        nestedRows.filter((row) => {
          const type = normalizeJobType(row._id?.jobType || "");
          return (type.canonicalJobType || "Unmapped") === item.jobType || row._id?.jobType === item.jobType;
        }),
        (row) => {
          const hit = normalizeJobIssue(row._id?.issue || "", row._id?.jobType, aliases.issue);
          return {
            key: hit.canonicalIssueId,
            raw: row._id?.issue || "",
            base: { id: hit.canonicalIssueId, label: hit.canonicalIssueLabel },
          };
        }
      ).items.slice(0, 8);
    }
    return { items: services.items, totalJobs: services.totalJobs };
  });
}

async function getSources(query) {
  const filters = parseFilters(query);
  return cached("sources", filters, async () => {
    const { aliases, sources } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const [sourceRows, subRows, issueRows] = await Promise.all([
      groupRaw(match, "$source", 80),
      groupRaw(match, { source: "$source", subSource: "$subSource" }, 200),
      groupRaw(match, { source: "$source", issue: "$issue" }, 800),
    ]);
    const items = sourceRows.map((row) => {
      const sourceId = row._id ? String(row._id) : "";
      const issues = mergeCanonical(
        issueRows.filter((issueRow) => String(issueRow._id?.source || "") === sourceId),
        (issueRow) => {
          const hit = normalizeJobIssue(issueRow._id?.issue || "", "", aliases.issue);
          return {
            key: hit.canonicalIssueId,
            raw: issueRow._id?.issue || "",
            base: { id: hit.canonicalIssueId, label: hit.canonicalIssueLabel },
          };
        }
      );
      return {
        sourceId,
        name: sources.get(sourceId) || "Unknown",
        count: row.count,
        revenue: Math.round((row.revenue || 0) * 100) / 100,
        topIssue: issues.items[0]?.label || "",
        subSources: subRows
          .filter((sub) => String(sub._id?.source || "") === sourceId)
          .map((sub) => ({
            subSource: sub._id?.subSource || "",
            count: sub.count,
            revenue: Math.round((sub.revenue || 0) * 100) / 100,
          })),
      };
    });
    return { items, totalJobs: items.reduce((sum, row) => sum + row.count, 0) };
  });
}

async function getTime(query) {
  const filters = parseFilters(query);
  return cached("time", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const rows = await Job.aggregate([
      { $match: match },
      {
        $addFields: {
          qatarDate: {
            $add: [{ $ifNull: ["$completed_at", "$dateTime"] }, 3 * 60 * 60 * 1000],
          },
        },
      },
      {
        $group: {
          _id: {
            hour: { $hour: "$qatarDate" },
            weekday: { $dayOfWeek: "$qatarDate" },
          },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$price", 0] } },
        },
      },
    ]);
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, revenue: 0 }));
    const weekdays = Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      count: 0,
      revenue: 0,
    }));
    for (const row of rows) {
      const hour = Number(row._id?.hour);
      const weekday = Number(row._id?.weekday);
      if (Number.isFinite(hour) && hours[hour]) {
        hours[hour].count += row.count;
        hours[hour].revenue += row.revenue;
      }
      if (Number.isFinite(weekday) && weekdays[weekday - 1]) {
        weekdays[weekday - 1].count += row.count;
        weekdays[weekday - 1].revenue += row.revenue;
      }
    }
    return { hours, weekdays };
  });
}

async function getLocations(query) {
  const filters = parseFilters(query);
  return cached("locations", filters, async () => {
    const { aliases } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const rows = await groupRaw(match, "$location", 800);
    const merged = mergeCanonical(rows, (row) => {
      const hit = normalizeLocationArea(row._id || "", null, aliases.area);
      return {
        key: filters.view === "raw" ? `raw:${row._id || ""}` : hit.areaId,
        raw: row._id || "",
        base: {
          areaId: filters.view === "raw" ? row._id || "blank" : hit.areaId,
          areaLabel: filters.view === "raw" ? row._id || "(blank)" : hit.areaLabel,
          method: hit.method,
          hasCoords: hit.hasCoords,
        },
      };
    });
    return {
      items: merged.items,
      unmatched: merged.items.filter((row) => row.areaId === "unmapped" || row.method === "unmatched"),
      catalog: QATAR_AREAS.map((row) => ({ id: row.id, label: row.label })),
      totalJobs: merged.totalJobs,
    };
  });
}

const CROSSTAB_AXES = new Set(["issue", "make", "model", "jobType", "source", "area", "hour"]);

function axisKey(axis, job, aliases, sources) {
  if (axis === "issue") {
    const hit = normalizeJobIssue(job.issue || "", job.jobType, aliases.issue);
    return { key: hit.canonicalIssueId, label: hit.canonicalIssueLabel };
  }
  if (axis === "make" || axis === "model") {
    const hit = normalizeJobVehicle({ make: job.vehicleMake, model: job.vehicleModel });
    if (axis === "make") return { key: hit.canonicalMake || "unmapped", label: hit.canonicalMake || "Unmapped" };
    return {
      key: `${hit.canonicalMake}|${hit.canonicalModel}`,
      label: [hit.canonicalMake, hit.canonicalModel].filter(Boolean).join(" ") || "Unmapped",
    };
  }
  if (axis === "jobType") {
    const hit = normalizeJobType(job.jobType);
    return { key: hit.canonicalJobType || "unmapped", label: hit.canonicalJobType || "Unmapped" };
  }
  if (axis === "source") {
    const id = job.source ? String(job.source) : "";
    return { key: id || "unknown", label: sources.get(id) || "Unknown" };
  }
  if (axis === "area") {
    const hit = normalizeLocationArea(job.location, job.locationCoordinates, aliases.area);
    return { key: hit.areaId, label: hit.areaLabel };
  }
  if (axis === "hour") {
    const dt = job.completed_at || job.dateTime;
    const hour = dt ? new Date(new Date(dt).getTime() + 3 * 60 * 60 * 1000).getUTCHours() : -1;
    return { key: String(hour), label: `${hour}:00` };
  }
  return { key: "unknown", label: "Unknown" };
}

async function getCrosstabs(query) {
  const filters = parseFilters(query);
  const rowsAxis = CROSSTAB_AXES.has(filters.rows) ? filters.rows : "issue";
  const colsAxis = CROSSTAB_AXES.has(filters.cols) ? filters.cols : "make";
  return cached(`crosstab:${rowsAxis}:${colsAxis}`, filters, async () => {
    const { aliases, sources } = await context();
    const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
    const jobs = await Job.find(match)
      .select("issue jobType vehicleMake vehicleModel source location locationCoordinates completed_at dateTime price")
      .lean()
      .limit(8000);
    const cells = new Map();
    const rowLabels = new Map();
    const colLabels = new Map();
    for (const job of jobs) {
      const row = axisKey(rowsAxis, job, aliases, sources);
      const col = axisKey(colsAxis, job, aliases, sources);
      rowLabels.set(row.key, row.label);
      colLabels.set(col.key, col.label);
      const key = `${row.key}||${col.key}`;
      const current = cells.get(key) || { rowKey: row.key, colKey: col.key, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += Number(job.price) || 0;
      cells.set(key, current);
    }
    return {
      rowsAxis,
      colsAxis,
      rows: [...rowLabels.entries()].map(([key, label]) => ({ key, label })),
      cols: [...colLabels.entries()].map(([key, label]) => ({ key, label })),
      cells: [...cells.values()].sort((a, b) => b.count - a.count).slice(0, 400),
      sampled: jobs.length,
    };
  });
}

async function getJobs(query) {
  const filters = parseFilters(query);
  const { aliases, sources } = await context();
  const match = await resolveCanonicalMatch(await buildJobMatch(filters), filters, aliases);
  const [rows, total] = await Promise.all([
    Job.find(match)
      .select(
        "job_reference clientName clientMobileNumber search_phone issue jobType vehicleMake vehicleModel vehicleYear source dateTime completed_at price job_status location licensePlate"
      )
      .sort({ dateTime: -1 })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit)
      .lean(),
    Job.countDocuments(match),
  ]);
  return {
    items: rows.map((job) => {
      const issue = normalizeJobIssue(job.issue, job.jobType, aliases.issue);
      const vehicle = normalizeJobVehicle({
        make: job.vehicleMake,
        model: job.vehicleModel,
        year: job.vehicleYear,
      });
      const type = normalizeJobType(job.jobType, issue);
      const customer = normalizeCustomerKey(job.clientName, job.clientMobileNumber);
      return {
        id: String(job._id),
        jobReference: job.job_reference || "",
        dateTime: job.dateTime,
        clientName: job.clientName,
        phoneKey: customer.phoneKey,
        rawIssue: job.issue || "",
        canonicalIssue: issue.canonicalIssueLabel,
        rawVehicle: `${job.vehicleMake || ""} ${job.vehicleModel || ""}`.trim(),
        canonicalVehicle: [vehicle.canonicalMake, vehicle.canonicalModel].filter(Boolean).join(" "),
        rawJobType: job.jobType || "",
        canonicalJobType: type.canonicalJobType,
        sourceName: sources.get(job.source ? String(job.source) : "") || "",
        price: job.price,
        status: job.job_status,
        location: job.location || "",
      };
    }),
    total,
    page: filters.page,
    limit: filters.limit,
  };
}

async function getCatalogs() {
  return {
    issues: listJobIssues(),
    areas: QATAR_AREAS.map((row) => ({ id: row.id, label: row.label })),
  };
}

module.exports = {
  parseFilters,
  bumpAnalysisCache,
  loadAliases,
  getOverview,
  getIssues,
  getVehicles,
  getCustomers,
  getServices,
  getSources,
  getTime,
  getLocations,
  getCrosstabs,
  getJobs,
  getCatalogs,
  groupRaw,
  buildJobMatch,
  resolveCanonicalMatch,
  getIssueById,
};
