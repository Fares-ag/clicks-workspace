const TechnicianEarnings = require("../models/TechnicianEarnings");

const MS_HOUR = 3600000;
const MS_DAY = 86400000;

function startOfWeekSundayUtc(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function weekEndFromStart(weekStart) {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Number((((cur - prev) / prev) * 100).toFixed(1));
}

/** Split a time range into per-week hour buckets (UTC Sunday weeks). */
function splitHoursByWeek(start, end) {
  const chunks = [];
  let cursor = new Date(start);
  const finish = new Date(end);
  if (!(cursor < finish)) return chunks;

  while (cursor < finish) {
    const weekStart = startOfWeekSundayUtc(cursor);
    const nextWeek = weekEndFromStart(weekStart);
    const sliceEnd = nextWeek < finish ? nextWeek : finish;
    const hours = (sliceEnd - cursor) / MS_HOUR;
    if (hours > 0) {
      chunks.push({ weekStart, weekEnd: nextWeek, hours });
    }
    cursor = sliceEnd;
  }
  return chunks;
}

async function addHoursToWeeklyBucket(technicianId, weekStart, weekEnd, hours) {
  if (!hours || hours <= 0) return;

  const updated = await TechnicianEarnings.updateOne(
    { technician_id: technicianId, "weekly_earnings.week_start": weekStart },
    { $inc: { "weekly_earnings.$.hours_online": hours }, $set: { updated_at: new Date() } }
  );

  if (updated.matchedCount === 0) {
    await TechnicianEarnings.findOneAndUpdate(
      { technician_id: technicianId },
      {
        $push: {
          weekly_earnings: {
            week_start: weekStart,
            week_end: weekEnd,
            amount: 0,
            jobs_completed: 0,
            jobs_rejected: 0,
            jobs_cancelled: 0,
            hours_online: hours,
          },
        },
        $set: { updated_at: new Date() },
        $setOnInsert: {
          total_earned: 0,
          cash_balance: 0,
          performance: {
            total_completed_jobs: 0,
            total_rejected_jobs: 0,
            total_cancelled_jobs: 0,
          },
        },
      },
      { upsert: true }
    );
  }
}

/**
 * Accrue elapsed Online/On Job time into weekly_earnings.hours_online
 * and clear the session start. Mutates technician in memory; caller saves.
 * @returns {Promise<number>} hours accrued
 */
async function accrueOnlineSession(technician, endedAt = new Date()) {
  if (!technician?.onlineSessionStartedAt) return 0;

  const start = new Date(technician.onlineSessionStartedAt);
  const end = new Date(endedAt);
  const chunks = splitHoursByWeek(start, end);
  let total = 0;

  for (const chunk of chunks) {
    await addHoursToWeeklyBucket(
      technician._id,
      chunk.weekStart,
      chunk.weekEnd,
      chunk.hours
    );
    total += chunk.hours;
  }

  technician.onlineSessionStartedAt = null;

  // Keep embedded weeklyOnlineHours = current week total (bucket + no live session)
  const thisWeek = startOfWeekSundayUtc(end);
  const earnings = await TechnicianEarnings.findOne({ technician_id: technician._id })
    .select("weekly_earnings")
    .lean();
  const bucket = earnings?.weekly_earnings?.find(
    (w) => w.week_start && new Date(w.week_start).getTime() === thisWeek.getTime()
  );
  if (!technician.performance) technician.performance = {};
  technician.performance.weeklyOnlineHours = Number(bucket?.hours_online) || 0;

  return total;
}

/** Start (or keep) an online/on-job session. Mutates technician; caller saves. */
function startOnlineSession(technician, at = new Date()) {
  if (!technician.onlineSessionStartedAt) {
    technician.onlineSessionStartedAt = at;
  }
}

function liveSessionHours(technician, now = new Date()) {
  if (!technician?.onlineSessionStartedAt) return 0;
  const start = new Date(technician.onlineSessionStartedAt);
  return Math.max(0, (now - start) / MS_HOUR);
}

async function getWeeklyOnlineHoursSummary(technicianId, technicianDoc, now = new Date()) {
  const thisWeek = startOfWeekSundayUtc(now);
  const prevWeek = new Date(thisWeek);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);

  const earnings = await TechnicianEarnings.findOne({ technician_id: technicianId })
    .select("weekly_earnings")
    .lean();

  const weeks = earnings?.weekly_earnings || [];
  const thisBucket = weeks.find(
    (w) => w.week_start && new Date(w.week_start).getTime() === thisWeek.getTime()
  );
  const prevBucket = weeks.find(
    (w) => w.week_start && new Date(w.week_start).getTime() === prevWeek.getTime()
  );

  const status = technicianDoc?.currentStatus;
  const live =
    status === "Online" || status === "On Job"
      ? liveSessionHours(technicianDoc, now)
      : 0;

  const weeklyOnlineHours = (Number(thisBucket?.hours_online) || 0) + live;
  const prevHours = Number(prevBucket?.hours_online) || 0;

  return {
    weeklyOnlineHours: Number(weeklyOnlineHours.toFixed(2)),
    weeklyOnlineHoursChangePct: pctChange(weeklyOnlineHours, prevHours),
  };
}

const ONLINE_STATUSES = new Set(["Online", "On Job"]);

/**
 * Set technician presence and accrue/start online sessions.
 * Accepts an id or a loaded Technician document.
 */
async function setTechnicianStatus(technicianOrId, status) {
  const Technician = require("../models/Technician");
  const tech =
    technicianOrId && technicianOrId.save
      ? technicianOrId
      : await Technician.findById(technicianOrId);
  if (!tech) return null;

  const prev = tech.currentStatus;
  if (prev === status) {
    if (ONLINE_STATUSES.has(status) && !tech.onlineSessionStartedAt) {
      startOnlineSession(tech);
      await tech.save();
    }
    return tech;
  }

  if (ONLINE_STATUSES.has(prev) && status === "Offline") {
    await accrueOnlineSession(tech);
  } else if (ONLINE_STATUSES.has(status)) {
    startOnlineSession(tech);
  }

  tech.currentStatus = status;
  await tech.save();
  return tech;
}

module.exports = {
  startOfWeekSundayUtc,
  weekEndFromStart,
  pctChange,
  splitHoursByWeek,
  accrueOnlineSession,
  startOnlineSession,
  liveSessionHours,
  getWeeklyOnlineHoursSummary,
  setTechnicianStatus,
};
