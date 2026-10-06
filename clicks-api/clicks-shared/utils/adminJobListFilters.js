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
  } = rawQuery;

  const query = {};
  const exprClauses = [];
  const filterKeyParts = [];

  const filterCompletedToday =
    completedToday === "1" || completedToday === "true";

  if (filterCompletedToday) {
    query.job_status = { $in: COMPLETED };
    query.completed_at = {
      $gte: startOfQatarDay(),
      $lte: endOfQatarDay(),
    };
    filterKeyParts.push("completedToday");
  } else if (status === "ongoing") {
    query.job_status = { $in: ONGOING_JOB_STATUSES };
    filterKeyParts.push("status:ongoing");
  } else if (status) {
    query.job_status = str(status, { maxLength: 32 });
    filterKeyParts.push(`status:${status}`);
  }

  if (businessPortal === "1" || businessPortal === "true") {
    query.business_id = { $exists: true, $ne: null };
    filterKeyParts.push("businessPortal");
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

  const fromBounds = dateFrom ? qatarBoundsForCalendarDate(dateFrom) : null;
  const toBounds = dateTo ? qatarBoundsForCalendarDate(dateTo) : null;
  if (fromBounds || toBounds) {
    query.dateTime = {};
    if (fromBounds) {
      query.dateTime.$gte = fromBounds.start;
      filterKeyParts.push(`df:${dateFrom}`);
    }
    if (toBounds) {
      query.dateTime.$lte = toBounds.end;
      filterKeyParts.push(`dt:${dateTo}`);
    }
  }

  const fromMin = parseTimeMinutes(timeFrom);
  const toMin = parseTimeMinutes(timeTo);
  if (fromMin != null || toMin != null) {
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

  return {
    query,
    filterKeyParts,
    hasListFilters: Boolean(
      str(search).trim() ||
        filterKeyParts.length ||
        businessPortal === "1" ||
        businessPortal === "true"
    ),
  };
}

module.exports = {
  buildAdminJobListFilters,
  calendarDateAnchor,
  qatarBoundsForCalendarDate,
  parseTimeMinutes,
};
