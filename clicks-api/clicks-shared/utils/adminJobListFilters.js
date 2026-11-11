const { escapeRegex } = require("./escapeRegex");
const { str } = require("./coerce");
const { COMPLETED } = require("./dashboardRevenue");
const { ONGOING_JOB_STATUSES } = require("../constants/jobStatuses");

const QATAR_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfQatarDay(d = new Date()) {
  const shifted = new Date(new Date(d).getTime() + QATAR_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - QATAR_OFFSET_MS);
}

function endOfQatarDay(d = new Date()) {
  const shifted = new Date(new Date(d).getTime() + QATAR_OFFSET_MS);
  shifted.setUTCHours(23, 59, 59, 999);
  return new Date(shifted.getTime() - QATAR_OFFSET_MS);
}

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_HM = /^(\d{1,2}):(\d{2})$/;

function calendarDateAnchor(dateStr) {
  const m = str(dateStr, { maxLength: 10 }).trim().match(CALENDAR_DATE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

function qatarBoundsForCalendarDate(dateStr) {
  const anchor = calendarDateAnchor(dateStr);
  if (!anchor) return null;
  return { start: startOfQatarDay(anchor), end: endOfQatarDay(anchor) };
}

function parseTimeMinutes(timeStr) {
  const m = str(timeStr, { maxLength: 5 }).trim().match(TIME_HM);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function qatarMinutesExpr(dateField = "$dateTime") {
  return {
    $add: [
      { $multiply: [{ $hour: { date: dateField, timezone: "Asia/Qatar" } }, 60] },
      { $minute: { date: dateField, timezone: "Asia/Qatar" } },
    ],
  };
}

function mergeAnd(query, clause) {
  if (!clause) return;
  if (query.$and) {
    query.$and.push(clause);
  } else if (Object.keys(query).length > 0) {
    const existing = { ...query };
    Object.keys(query).forEach((k) => delete query[k]);
    query.$and = [existing, clause];
  } else {
    Object.assign(query, clause);
  }
}

const GARAGE_LIVE_PHASES = ["at_garage", "returning"];
const OPEN_JOB_STATUSES = ["pending", ...ONGOING_JOB_STATUSES, "on_hold"];
const PIPELINE_STATUS_KPIS = [
  "pending",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
];

/**
 * Event window that still includes legacy rows missing the dedicated timestamp.
 * Matches dashboard earnings-by-date (completed_at, else updatedAt).
 */
function eventWindowOr(field, start, end, fallbackField = "updatedAt") {
  return {
    $or: [
      { [field]: { $gte: start, $lte: end } },
      {
        $and: [
          { $or: [{ [field]: null }, { [field]: { $exists: false } }] },
          { [fallbackField]: { $gte: start, $lte: end } },
        ],
      },
    ],
  };
}

/** Today/event cards filter and sort on this timestamp, not scheduled dateTime. */
const KPI_EVENT = {
  createdToday: { field: "createdAt", sort: { createdAt: -1 } },
  completedToday: { field: "completed_at", sort: { completed_at: -1, _id: -1 } },
  revenueToday: { field: "completed_at", sort: { completed_at: -1, _id: -1 } },
  cancelledToday: { field: "cancelled_at", sort: { cancelled_at: -1, _id: -1 } },
  cancelled: { field: "cancelled_at", sort: { cancelled_at: -1, _id: -1 } },
  assigned: { field: "assigned_at", sort: { assigned_at: -1, _id: -1 } },
  accepted: { field: "accepted_at", sort: { accepted_at: -1, _id: -1 } },
  en_route: { field: "en_route_at", sort: { en_route_at: -1, _id: -1 } },
  arrived: { field: "arrived_at", sort: { arrived_at: -1, _id: -1 } },
  in_progress: { field: "started_at", sort: { started_at: -1, _id: -1 } },
  on_hold: { field: "on_hold_at", sort: { on_hold_at: -1, _id: -1 } },
  at_garage: { field: "garage.sent_at", sort: { "garage.sent_at": -1, _id: -1 } },
  returning: { field: "garage.ready_at", sort: { "garage.ready_at": -1, _id: -1 } },
  pending: { field: "dateTime", sort: { dateTime: 1 } },
  open: { field: "dateTime", sort: { dateTime: 1 } },
  unpaid: { field: "dateTime", sort: { dateTime: -1 } },
};

const TODAY_EVENT_KPIS = new Set([
  "createdToday",
  "completedToday",
  "revenueToday",
  "cancelledToday",
  "cancelled",
]);

function inRange(field, start, end) {
  if (!start || !end) return {};
  return { [field]: { $gte: start, $lte: end } };
}

/**
 * Mongo clause for a Job Management KPI card. List and /jobs/stats must use
 * the same helper so tapping a card always lists the jobs the number counted.
 */
function kpiClause(kpi, { rangeStart, rangeEnd, todayStart, todayEnd } = {}) {
  const key = str(kpi, { maxLength: 32 }).trim();
  const start = rangeStart || todayStart;
  const end = rangeEnd || todayEnd;
  switch (key) {
    case "open":
      return { job_status: { $in: OPEN_JOB_STATUSES } };
    case "pending":
    case "assigned":
    case "en_route":
    case "arrived":
    case "in_progress":
      return { job_status: key };
    case "accepted":
      return {
        job_status: "accepted",
        $nor: [{ "garage.phase": "returning" }],
      };
    case "ongoing":
      return {
        job_status: { $in: ONGOING_JOB_STATUSES },
        $nor: [{ "garage.phase": "returning" }],
      };
    case "on_hold":
      return {
        job_status: "on_hold",
        $nor: [{ "garage.phase": { $in: GARAGE_LIVE_PHASES } }],
      };
    case "at_garage":
      return { "garage.phase": "at_garage" };
    case "returning":
      return { "garage.phase": "returning" };
    case "completedToday":
    case "revenueToday":
      return {
        job_status: { $in: COMPLETED },
        ...inRange("completed_at", start, end),
      };
    case "cancelledToday":
    case "cancelled":
      return {
        job_status: "cancelled",
        ...inRange("cancelled_at", start, end),
      };
    case "createdToday":
      return inRange("createdAt", start, end);
    case "unpaid":
      return {
        payment_status: "unpaid",
        job_status: { $nin: ["cancelled"] },
      };
    default:
      return null;
  }
}

function resolveTechnicianFilter(technicianParam, technicianIdParam, techRoster) {
  const techId = str(technicianIdParam, { maxLength: 32 }).trim();
  if (techId) {
    return { assignedTechnician: techId };
  }

  const techName = str(technicianParam, { maxLength: 120 }).trim();
  if (!techName) return null;

  const normalized = techName.toLowerCase();
  const ids = (techRoster || [])
    .filter((t) => {
      const full = `${t.firstName || ""} ${t.lastName || ""}`.trim().toLowerCase();
      return full === normalized;
    })
    .map((t) => t._id);

  if (ids.length) {
    return { assignedTechnician: { $in: ids } };
  }

  return {
    legacyTechnicianName: new RegExp(`^${escapeRegex(techName)}`, "i"),
  };
}

/**
 * Builds Mongo query fragments for GET /api/jobs (admin list).
 * @returns {{ query: object, exprClauses: object[], filterKeyParts: string[] }}
 */
function buildAdminJobListFilters(rawQuery, { techRoster } = {}) {
  const {
    search = "",
    status,
    businessPortal,
    completedToday,
    technician,
    technicianId,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    paymentStatus,
    jobType,
    source,
    jobOrigin,
    garage,
    kpi,
  } = rawQuery;

  const query = {};
  const exprClauses = [];
  const filterKeyParts = [];

  const kpiKey = str(kpi, { maxLength: 32 }).trim();
  const fromBounds = dateFrom ? qatarBoundsForCalendarDate(dateFrom) : null;
  const toBounds = dateTo ? qatarBoundsForCalendarDate(dateTo) : null;
  const hasDateFilter = Boolean(fromBounds || toBounds);
  const rangeStart = hasDateFilter
    ? (fromBounds && fromBounds.start) || (toBounds && toBounds.start)
    : startOfQatarDay();
  const rangeEnd = hasDateFilter
    ? (toBounds && toBounds.end) || (fromBounds && fromBounds.end)
    : endOfQatarDay();
  const isEventKpi = TODAY_EVENT_KPIS.has(kpiKey);
  const filterCompletedToday =
    completedToday === "1" || completedToday === "true";

  if (kpiKey) {
    const clause = kpiClause(kpiKey, { rangeStart, rangeEnd });
    if (clause) mergeAnd(query, clause);
    filterKeyParts.push(`kpi:${kpiKey}`);
  } else if (filterCompletedToday) {
    mergeAnd(
      query,
      kpiClause("completedToday", {
        rangeStart: startOfQatarDay(),
        rangeEnd: endOfQatarDay(),
      })
    );
    filterKeyParts.push("completedToday");
  } else if (status === "ongoing") {
    mergeAnd(query, kpiClause("ongoing"));
    filterKeyParts.push("status:ongoing");
  } else if (status) {
    query.job_status = str(status, { maxLength: 32 });
    filterKeyParts.push(`status:${status}`);
  }

  if (businessPortal === "1" || businessPortal === "true") {
    query.business_id = { $exists: true, $ne: null };
    filterKeyParts.push("businessPortal");
  }

  const garagePhase = str(garage, { maxLength: 24 }).trim().toLowerCase();
  if (garagePhase === "at_garage" || garagePhase === "returning") {
    query["garage.phase"] = garagePhase;
    filterKeyParts.push(`garage:${garagePhase}`);
  }

  const origin = str(jobOrigin, { maxLength: 24 }).trim().toLowerCase();
  if (origin === "business") {
    query.business_id = { $exists: true, $ne: null };
    filterKeyParts.push("origin:business");
  } else if (origin === "technician") {
    query.created_by_technician = { $exists: true, $ne: null };
    filterKeyParts.push("origin:technician");
  } else if (origin === "dispatch") {
    mergeAnd(query, {
      $nor: [
        { business_id: { $exists: true, $ne: null } },
        { created_by_technician: { $exists: true, $ne: null } },
      ],
    });
    filterKeyParts.push("origin:dispatch");
  }

  const pay = str(paymentStatus, { maxLength: 16 }).trim().toLowerCase();
  if (pay === "paid" || pay === "unpaid") {
    query.payment_status = pay;
    filterKeyParts.push(`pay:${pay}`);
  }

  const type = str(jobType, { maxLength: 64 }).trim();
  if (type) {
    query.jobType = type;
    filterKeyParts.push(`type:${type}`);
  }

  const sourceId = str(source, { maxLength: 32 }).trim();
  if (sourceId) {
    query.source = sourceId;
    filterKeyParts.push(`source:${sourceId}`);
  }

  const techClause = resolveTechnicianFilter(technician, technicianId, techRoster);
  if (techClause) {
    Object.assign(query, techClause);
    filterKeyParts.push(`tech:${technicianId || technician}`);
  }

  if ((fromBounds || toBounds) && !isEventKpi) {
    query.dateTime = {};
    if (fromBounds) {
      query.dateTime.$gte = fromBounds.start;
      filterKeyParts.push(`df:${dateFrom}`);
    }
    if (toBounds) {
      query.dateTime.$lte = toBounds.end;
      filterKeyParts.push(`dt:${dateTo}`);
    }
  } else if (isEventKpi && hasDateFilter) {
    if (fromBounds) filterKeyParts.push(`df:${dateFrom}`);
    if (toBounds) filterKeyParts.push(`dt:${dateTo}`);
  }

  const fromMin = parseTimeMinutes(timeFrom);
  const toMin = parseTimeMinutes(timeTo);
  if (!isEventKpi && (fromMin != null || toMin != null)) {
    const minutesExpr = qatarMinutesExpr();
    if (fromMin != null && toMin != null && fromMin <= toMin) {
      exprClauses.push({
        $and: [{ $gte: [minutesExpr, fromMin] }, { $lte: [minutesExpr, toMin] }],
      });
    } else if (fromMin != null && toMin != null && fromMin > toMin) {
      exprClauses.push({
        $or: [{ $gte: [minutesExpr, fromMin] }, { $lte: [minutesExpr, toMin] }],
      });
    } else if (fromMin != null) {
      exprClauses.push({ $gte: [minutesExpr, fromMin] });
    } else if (toMin != null) {
      exprClauses.push({ $lte: [minutesExpr, toMin] });
    }
    filterKeyParts.push(`tf:${timeFrom || ""}|tt:${timeTo || ""}`);
  }

  if (exprClauses.length) {
    mergeAnd(query, exprClauses.length === 1 ? { $expr: exprClauses[0] } : { $expr: { $and: exprClauses } });
  }

  const kpiSort = KPI_EVENT[kpiKey] && KPI_EVENT[kpiKey].sort;
  const sort =
    kpiSort ||
    (!str(search).trim() && filterKeyParts.length === 0
      ? { _id: -1 }
      : { createdAt: -1 });

  return {
    query,
    sort,
    filterKeyParts,
    hasListFilters: Boolean(
      str(search).trim() ||
        filterKeyParts.length ||
        businessPortal === "1" ||
        businessPortal === "true"
    ),
  };
}

/** Same as list filters but without status / garage / KPI (for card breakdown). */
function buildAdminJobStatsBaseFilters(rawQuery, options) {
  const stripped = { ...(rawQuery || {}) };
  delete stripped.status;
  delete stripped.garage;
  delete stripped.completedToday;
  delete stripped.kpi;
  delete stripped.page;
  delete stripped.limit;
  return buildAdminJobListFilters(stripped, options);
}

module.exports = {
  buildAdminJobListFilters,
  buildAdminJobStatsBaseFilters,
  kpiClause,
  eventWindowOr,
  KPI_EVENT,
  TODAY_EVENT_KPIS,
  PIPELINE_STATUS_KPIS,
  OPEN_JOB_STATUSES,
  calendarDateAnchor,
  qatarBoundsForCalendarDate,
  parseTimeMinutes,
};
