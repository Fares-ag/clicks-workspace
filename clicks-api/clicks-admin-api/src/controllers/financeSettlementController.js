const {
  TechnicianSettlement,
  Technician,
  Job,
  RepairProcedure,
  FinanceUser,
} = require("../../../clicks-shared/models");
const {
  SETTLEMENT_PAYMENT_METHODS,
  SETTLEMENT_ENTRY_TYPES,
  computeSettlementTotals,
  settlementGap,
  roundMoney,
} = require("../../../clicks-shared/utils/technicianSettlement");
const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str, num, objectId } = require("../../../clicks-shared/utils/coerce");

const LOCKED_MESSAGE = "Settlement is closed. Reopen it first.";
const STALE_MESSAGE =
  "This settlement was changed by someone else. Reload it to see the latest version.";
const DUPLICATE_JOB_MESSAGE =
  "One of these jobs was just added to another settlement. Reload and try again.";
const REOPEN_REASON_MIN = 10;
const REOPEN_REASON_MAX = 1000;
const MAX_LINES = 500;
const MAX_PAGE = 100000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Qatar is UTC+3 all year — there is no DST, so the offset is a constant. */
const QATAR_UTC_OFFSET = "+03:00";
const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

// Production runs with autoIndex off (clicks-shared/mongoose.js), so the unique
// indexes on this collection would never be built there. It is a new, small
// collection — building them on first use cannot stall reads the way an inline
// build on Job or Technician did — and they back the one-job-one-settlement rule.
let indexesReady = null;
function ensureIndexes() {
  if (!indexesReady) {
    indexesReady = TechnicianSettlement.createIndexes().catch((err) => {
      indexesReady = null;
      console.error("TechnicianSettlement index build failed:", err.message);
    });
  }
  return indexesReady;
}

/** True for a real calendar day in YYYY-MM-DD form ("2026-02-31" is rejected). */
function isCalendarDay(value) {
  if (!ISO_DATE_RE.test(value)) return false;
  const at = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

function qatarToday() {
  return new Date(Date.now() + QATAR_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function nextDay(value) {
  const at = new Date(`${value}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

function jobDisplayId(job) {
  const reference = String(job?.job_reference || "").trim();
  if (reference) return reference;
  return `#${String(job?._id || "").slice(-6)}`;
}

function technicianName(tech) {
  return `${tech?.firstName || ""} ${tech?.lastName || ""}`.trim();
}

/** Blank is 0; anything else must be a finite, non-negative number (NaN otherwise). */
function parseMoney(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw !== "number" && typeof raw !== "string") return NaN;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? roundMoney(value) : NaN;
}

/**
 * Validate the job lines. Amounts are rejected rather than coerced, the same
 * rule as the job finance rows. Returns { lines } or { error }.
 */
function parseJobLines(rows) {
  if (!Array.isArray(rows)) return { error: "Jobs must be a list" };
  if (rows.length > MAX_LINES) {
    return { error: `A settlement can hold at most ${MAX_LINES} jobs` };
  }
  const lines = [];
  const seen = new Set();
  for (const raw of rows) {
    const src = raw && typeof raw === "object" ? raw : {};
    const rawJobId = src.job_id;
    const jobId = rawJobId ? objectId(rawJobId)?.toLowerCase() || null : null;
    if (rawJobId && !jobId) return { error: "Invalid job id" };

    const label = str(src.label, { maxLength: 200 }).trim();
    const method = str(src.payment_method).trim() || "cash";
    if (!SETTLEMENT_PAYMENT_METHODS.includes(method)) {
      return { error: "Invalid payment method" };
    }

    const amount = parseMoney(src.amount);
    const batteryCost = parseMoney(src.battery_cost);
    const garageCost = parseMoney(src.garage_cost);
    const tip = parseMoney(src.tip);
    if ([amount, batteryCost, garageCost, tip].some(Number.isNaN)) {
      return { error: "Job amounts must be zero or more" };
    }

    if (!jobId && !label) {
      if (amount || batteryCost || garageCost || tip) {
        return { error: "Each job line needs a job or a description" };
      }
      continue;
    }
    if (jobId) {
      if (seen.has(jobId)) return { error: "The same job is listed twice" };
      seen.add(jobId);
    }

    lines.push({
      job_id: jobId,
      label,
      payment_method: method,
      amount,
      battery_cost: batteryCost,
      garage_cost: garageCost,
      tip,
    });
  }
  return { lines };
}

/** Validate the money movements. Returns { entries } or { error }. */
function parseEntries(rows) {
  if (!Array.isArray(rows)) return { error: "Entries must be a list" };
  if (rows.length > MAX_LINES) {
    return { error: `A settlement can hold at most ${MAX_LINES} entries` };
  }
  const entries = [];
  for (const raw of rows) {
    const src = raw && typeof raw === "object" ? raw : {};
    const type = str(src.type).trim();
    const amount = parseMoney(src.amount);
    const date = str(src.date).trim();
    const note = str(src.note, { maxLength: 500 }).trim();

    if (!amount && !date && !note) continue;
    if (!SETTLEMENT_ENTRY_TYPES.includes(type)) return { error: "Invalid entry type" };
    if (Number.isNaN(amount)) return { error: "Entry amounts must be zero or more" };
    if (date && !isCalendarDay(date)) return { error: "Invalid entry date" };

    entries.push({ type, amount, date, note });
  }
  return { entries };
}

/** Allow-list the editable fields of a draft. Returns { set } or { error }. */
function parseSettlementEdits(body) {
  const src = body && typeof body === "object" ? body : {};
  const set = {};

  for (const field of ["period_from", "period_to"]) {
    if (src[field] === undefined) continue;
    const value = str(src[field]).trim();
    if (!isCalendarDay(value)) return { error: "Invalid period date" };
    set[field] = value;
  }
  if (src.jobs !== undefined) {
    const parsed = parseJobLines(src.jobs);
    if (parsed.error) return { error: parsed.error };
    set.jobs = parsed.lines;
  }
  if (src.entries !== undefined) {
    const parsed = parseEntries(src.entries);
    if (parsed.error) return { error: parsed.error };
    set.entries = parsed.entries;
  }
  if (src.notes !== undefined) {
    set.notes = str(src.notes, { maxLength: 2000 });
  }
  return { set };
}

/**
 * Linked jobs must be completed jobs of this settlement's technician and must
 * not already sit in another settlement. Refreshes each linked line's label to
 * the job's current reference. Returns {} or { status, error }.
 */
async function checkLinkedJobs(settlement, lines) {
  const ids = lines.map((line) => line.job_id).filter(Boolean);
  if (!ids.length) return {};

  const jobs = await Job.find({ _id: { $in: ids } })
    .select("job_reference job_status assignedTechnician")
    .lean();
  const byId = new Map(jobs.map((job) => [String(job._id), job]));

  for (const line of lines) {
    if (!line.job_id) continue;
    const job = byId.get(line.job_id);
    const ownJob =
      job &&
      job.job_status === "completed" &&
      String(job.assignedTechnician) === String(settlement.technician_id);
    if (!ownJob) {
      return {
        status: 400,
        error: `Job ${job ? jobDisplayId(job) : line.job_id} is not a completed job of this technician`,
      };
    }
    line.label = jobDisplayId(job);
  }

  const clash = await TechnicianSettlement.findOne({
    _id: { $ne: settlement._id },
    job_ids: { $in: ids },
  })
    .select("number job_ids")
    .lean();
  if (clash) {
    const taken = new Set(clash.job_ids.map(String));
    const jobId = ids.find((id) => taken.has(id));
    return {
      status: 409,
      error: `Job ${jobDisplayId(byId.get(jobId))} is already in settlement #${clash.number}`,
    };
  }
  return {};
}

function isDuplicateSettledJob(err) {
  return err?.code === 11000 && Boolean(err?.keyPattern?.job_ids);
}

function parseRevision(raw) {
  if (raw === undefined || raw === null || raw === "") return { revision: null };
  const revision = num(raw, { integer: true, min: 0 });
  return revision === null ? { error: "Invalid revision" } : { revision };
}

/**
 * Shared by save and close: load the draft, validate the edits against it and
 * build the write. The returned filter pins the revision that was read, so a
 * write that raced another one matches nothing instead of overwriting it.
 * Returns { current, set, filter } or { status, message }.
 */
async function prepareDraftWrite(req, { requireRevision = false } = {}) {
  const id = objectId(req.params.id);
  if (!id) return { status: 400, message: "Invalid settlement id" };

  const current = await TechnicianSettlement.findById(id).lean();
  if (!current) return { status: 404, message: "Settlement not found" };
  if (current.status !== "draft") return { status: 409, message: LOCKED_MESSAGE };

  const { revision, error: revisionError } = parseRevision(req.body?.revision);
  if (revisionError) return { status: 400, message: revisionError };
  if (requireRevision && revision === null) {
    return { status: 400, message: "Revision is required" };
  }
  if (revision !== null && revision !== current.revision) {
    return { status: 409, message: STALE_MESSAGE };
  }

  const parsed = parseSettlementEdits(req.body);
  if (parsed.error) return { status: 400, message: parsed.error };
  const { set } = parsed;

  const periodFrom = set.period_from ?? current.period_from;
  const periodTo = set.period_to ?? current.period_to;
  if (periodFrom > periodTo) {
    return { status: 400, message: "The period must start on or before the day it ends" };
  }

  if (set.jobs) {
    const checked = await checkLinkedJobs(current, set.jobs);
    if (checked.error) return { status: checked.status, message: checked.error };
    set.job_ids = set.jobs.map((line) => line.job_id).filter(Boolean);
  }
  set.totals = computeSettlementTotals(set.jobs ?? current.jobs, set.entries ?? current.entries);

  return {
    current,
    set,
    filter: { _id: current._id, status: "draft", revision: current.revision },
  };
}

/** Why a guarded write matched nothing: closed in the meantime, or just changed. */
async function conflictMessage(id) {
  const latest = await TechnicianSettlement.findById(id).select("status").lean();
  if (!latest) return { status: 404, message: "Settlement not found" };
  return {
    status: 409,
    message: latest.status === "closed" ? LOCKED_MESSAGE : STALE_MESSAGE,
  };
}

async function serializeSettlement(doc) {
  const history = Array.isArray(doc.history) ? doc.history : [];
  const userIds = [
    doc.created_by,
    doc.closed_by,
    ...history.map((row) => row.finance_user_id),
  ].filter(Boolean);

  const linkedJobIds = (doc.jobs || []).map((line) => line.job_id).filter(Boolean);

  const [technician, users, linkedJobs] = await Promise.all([
    Technician.findById(doc.technician_id).select("firstName lastName").lean(),
    userIds.length
      ? FinanceUser.find({ _id: { $in: userIds } }).select("name").lean()
      : [],
    linkedJobIds.length
      ? Job.find({ _id: { $in: linkedJobIds } }).select("clientName").lean()
      : [],
  ]);
  const nameById = new Map(users.map((user) => [String(user._id), user.name || ""]));
  const userName = (id) => (id ? nameById.get(String(id)) || "" : "");
  const clientByJob = new Map(linkedJobs.map((job) => [String(job._id), job.clientName || ""]));

  const totals = computeSettlementTotals(doc.jobs, doc.entries);
  const collected = doc.collected_amount ?? null;

  return {
    _id: doc._id,
    number: doc.number,
    technician: {
      _id: doc.technician_id,
      name: technicianName(technician) || "Unknown technician",
    },
    period_from: doc.period_from,
    period_to: doc.period_to,
    status: doc.status,
    revision: doc.revision,
    notes: doc.notes || "",
    jobs: (doc.jobs || []).map((line) => ({
      _id: line._id,
      job_id: line.job_id || null,
      label: line.label || "",
      client_name: line.job_id ? clientByJob.get(String(line.job_id)) || "" : "",
      payment_method: line.payment_method || "cash",
      amount: Number(line.amount) || 0,
      battery_cost: Number(line.battery_cost) || 0,
      garage_cost: Number(line.garage_cost) || 0,
      tip: Number(line.tip) || 0,
    })),
    entries: (doc.entries || []).map((entry) => ({
      _id: entry._id,
      type: entry.type,
      amount: Number(entry.amount) || 0,
      date: entry.date || "",
      note: entry.note || "",
    })),
    totals: {
      ...totals,
      collected,
      gap: settlementGap(totals.cash_to_collect, collected),
    },
    collected_amount: collected,
    created_by: userName(doc.created_by),
    closed_by: userName(doc.closed_by),
    closed_at: doc.closed_at || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    history: history.map((row) => ({
      action: row.action,
      at: row.at,
      by: userName(row.finance_user_id),
      cash_to_collect: row.cash_to_collect ?? null,
      collected: row.collected ?? null,
      reason: row.reason || "",
    })),
  };
}

async function listSettlements(req, res) {
  try {
    const query = {};
    const technicianId = objectId(req.query.technician_id);
    if (technicianId) query.technician_id = technicianId;
    const status = str(req.query.status).trim();
    if (status === "draft" || status === "closed") query.status = status;

    // Search by technician name (every word must match a first or last name)
    // or by settlement number ("11" or "#11").
    const search = str(req.query.search, { maxLength: 64 }).trim().replace(/^#/, "");
    if (search) {
      const words = search.split(/\s+/).filter(Boolean);
      const techs = await Technician.find({
        $and: words.map((word) => {
          const rx = new RegExp(escapeRegex(word), "i");
          return { $or: [{ firstName: rx }, { lastName: rx }] };
        }),
      })
        .select("_id")
        .limit(200)
        .lean();
      const matches = [];
      if (techs.length) matches.push({ technician_id: { $in: techs.map((tech) => tech._id) } });
      const number = num(search, { integer: true, min: 1 });
      if (number !== null) matches.push({ number });
      // No match at all must list nothing, not everything.
      query.$and = [{ $or: matches.length ? matches : [{ _id: null }] }];
    }

    const page = Math.min(Math.max(num(req.query.page, { integer: true }) ?? 1, 1), MAX_PAGE);
    const limit = Math.min(Math.max(num(req.query.limit, { integer: true }) ?? 20, 1), 100);

    const [rows, total] = await Promise.all([
      TechnicianSettlement.find(query)
        .select(
          "technician_id number period_from period_to status totals collected_amount closed_at updatedAt"
        )
        .sort({ period_to: -1, number: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TechnicianSettlement.countDocuments(query),
    ]);

    const techIds = [...new Set(rows.map((row) => String(row.technician_id)))];
    const techs = techIds.length
      ? await Technician.find({ _id: { $in: techIds } }).select("firstName lastName").lean()
      : [];
    const nameById = new Map(techs.map((tech) => [String(tech._id), technicianName(tech)]));

    const settlements = rows.map((row) => {
      const cashToCollect = Number(row.totals?.cash_to_collect) || 0;
      const collected = row.collected_amount ?? null;
      return {
        _id: row._id,
        number: row.number,
        technician: {
          _id: row.technician_id,
          name: nameById.get(String(row.technician_id)) || "Unknown technician",
        },
        period_from: row.period_from,
        period_to: row.period_to,
        status: row.status,
        job_count: Number(row.totals?.job_count) || 0,
        cash_to_collect: cashToCollect,
        collected_amount: collected,
        gap: settlementGap(cashToCollect, collected),
        closed_at: row.closed_at || null,
        updatedAt: row.updatedAt,
      };
    });

    res.json({ settlements, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch settlements", error: err.message });
  }
}

/** Defaults for a technician's next settlement: number and a period that starts after the last one. */
async function getNextSettlementDefaults(req, res) {
  try {
    const technicianId = objectId(req.query.technician_id);
    if (!technicianId) return res.status(400).json({ message: "Select a technician" });

    const [lastByNumber, lastByPeriod] = await Promise.all([
      TechnicianSettlement.findOne({ technician_id: technicianId })
        .sort({ number: -1 })
        .select("number")
        .lean(),
      TechnicianSettlement.findOne({ technician_id: technicianId })
        .sort({ period_to: -1 })
        .select("period_to")
        .lean(),
    ]);

    const today = qatarToday();
    const periodFrom = lastByPeriod ? nextDay(lastByPeriod.period_to) : today;
    res.json({
      number: (Number(lastByNumber?.number) || 0) + 1,
      period_from: periodFrom,
      period_to: periodFrom > today ? periodFrom : today,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load settlement defaults", error: err.message });
  }
}

async function createSettlement(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const technicianId = objectId(body.technician_id);
    if (!technicianId) return res.status(400).json({ message: "Select a technician" });

    const periodFrom = str(body.period_from).trim();
    const periodTo = str(body.period_to).trim();
    if (!isCalendarDay(periodFrom) || !isCalendarDay(periodTo)) {
      return res.status(400).json({ message: "Invalid period date" });
    }
    if (periodFrom > periodTo) {
      return res
        .status(400)
        .json({ message: "The period must start on or before the day it ends" });
    }

    let requestedNumber = null;
    if (body.number !== undefined && body.number !== null && body.number !== "") {
      requestedNumber = num(body.number, { integer: true, min: 1, max: 1000000 });
      if (requestedNumber === null) {
        return res.status(400).json({ message: "Settlement number must be a whole number above 0" });
      }
    }

    const technician = await Technician.findById(technicianId).select("_id").lean();
    if (!technician) return res.status(404).json({ message: "Technician not found" });

    await ensureIndexes();

    // The next number is read then written, so two creates for the same
    // technician can pick the same one; the unique index turns that into a
    // retry instead of a duplicate.
    let created = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      let number = requestedNumber;
      if (number === null) {
        const last = await TechnicianSettlement.findOne({ technician_id: technicianId })
          .sort({ number: -1 })
          .select("number")
          .lean();
        number = (Number(last?.number) || 0) + 1;
      }
      try {
        created = await TechnicianSettlement.create({
          technician_id: technicianId,
          number,
          period_from: periodFrom,
          period_to: periodTo,
          notes: str(body.notes, { maxLength: 2000 }),
          totals: computeSettlementTotals([], []),
          created_by: req.financeUser._id,
          history: [{ action: "create", finance_user_id: req.financeUser._id }],
        });
      } catch (err) {
        if (err?.code !== 11000 || !err?.keyPattern?.number) throw err;
        if (requestedNumber !== null) {
          return res.status(409).json({
            message: `Settlement #${requestedNumber} already exists for this technician`,
          });
        }
      }
    }
    if (!created) {
      return res.status(409).json({ message: "Could not assign a settlement number. Try again." });
    }

    res.status(201).json({ settlement: await serializeSettlement(created.toObject()) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create settlement", error: err.message });
  }
}

async function getSettlement(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid settlement id" });
    const doc = await TechnicianSettlement.findById(id).lean();
    if (!doc) return res.status(404).json({ message: "Settlement not found" });
    res.json({ settlement: await serializeSettlement(doc) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch settlement", error: err.message });
  }
}

async function updateSettlement(req, res) {
  try {
    const prepared = await prepareDraftWrite(req);
    if (prepared.status) {
      return res.status(prepared.status).json({ message: prepared.message });
    }
    await ensureIndexes();

    let updated;
    try {
      updated = await TechnicianSettlement.findOneAndUpdate(
        prepared.filter,
        { $set: prepared.set, $inc: { revision: 1 } },
        { new: true, runValidators: true }
      ).lean();
    } catch (err) {
      if (isDuplicateSettledJob(err)) {
        return res.status(409).json({ message: DUPLICATE_JOB_MESSAGE });
      }
      throw err;
    }
    if (!updated) {
      const conflict = await conflictMessage(prepared.current._id);
      return res.status(conflict.status).json({ message: conflict.message });
    }

    res.json({ settlement: await serializeSettlement(updated) });
  } catch (err) {
    res.status(500).json({ message: "Failed to save settlement", error: err.message });
  }
}

/** Save any final edits and lock the settlement with the cash actually collected. */
async function closeSettlement(req, res) {
  try {
    // Negative is allowed: the company paid the technician instead of collecting.
    const collected = num(req.body?.collected_amount);
    if (collected === null) {
      return res.status(400).json({ message: "Enter the cash collected" });
    }

    const prepared = await prepareDraftWrite(req, { requireRevision: true });
    if (prepared.status) {
      return res.status(prepared.status).json({ message: prepared.message });
    }
    await ensureIndexes();

    const now = new Date();
    const collectedAmount = roundMoney(collected);
    let updated;
    try {
      updated = await TechnicianSettlement.findOneAndUpdate(
        prepared.filter,
        {
          $set: {
            ...prepared.set,
            status: "closed",
            collected_amount: collectedAmount,
            closed_by: req.financeUser._id,
            closed_at: now,
          },
          $inc: { revision: 1 },
          $push: {
            history: {
              action: "close",
              at: now,
              finance_user_id: req.financeUser._id,
              cash_to_collect: prepared.set.totals.cash_to_collect,
              collected: collectedAmount,
            },
          },
        },
        { new: true, runValidators: true }
      ).lean();
    } catch (err) {
      if (isDuplicateSettledJob(err)) {
        return res.status(409).json({ message: DUPLICATE_JOB_MESSAGE });
      }
      throw err;
    }
    if (!updated) {
      const conflict = await conflictMessage(prepared.current._id);
      return res.status(conflict.status).json({ message: conflict.message });
    }

    res.json({ settlement: await serializeSettlement(updated) });
  } catch (err) {
    res.status(500).json({ message: "Failed to close settlement", error: err.message });
  }
}

/** Unlock a closed settlement. Admin-only (see routes) and always needs a reason. */
async function reopenSettlement(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid settlement id" });

    const reason = str(req.body?.reason, { maxLength: REOPEN_REASON_MAX }).trim();
    if (reason.length < REOPEN_REASON_MIN) {
      return res.status(400).json({
        message: `Give a reason of at least ${REOPEN_REASON_MIN} characters`,
      });
    }

    const current = await TechnicianSettlement.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Settlement not found" });
    if (current.status !== "closed") {
      return res.status(409).json({ message: "Settlement is not closed" });
    }

    const updated = await TechnicianSettlement.findOneAndUpdate(
      { _id: id, status: "closed", revision: current.revision },
      {
        // collected_amount stays: that cash really was received, and the next
        // close starts from it.
        $set: { status: "draft", closed_by: null, closed_at: null },
        $inc: { revision: 1 },
        $push: {
          history: {
            action: "reopen",
            at: new Date(),
            finance_user_id: req.financeUser._id,
            cash_to_collect: current.totals?.cash_to_collect ?? null,
            collected: current.collected_amount ?? null,
            reason,
          },
        },
      },
      { new: true }
    ).lean();
    if (!updated) {
      return res.status(409).json({ message: STALE_MESSAGE });
    }

    res.json({ settlement: await serializeSettlement(updated) });
  } catch (err) {
    res.status(500).json({ message: "Failed to reopen settlement", error: err.message });
  }
}

/** Drafts only: a closed settlement records cash that was really collected. */
async function deleteSettlement(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid settlement id" });

    const result = await TechnicianSettlement.deleteOne({ _id: id, status: "draft" });
    if (!result.deletedCount) {
      const exists = await TechnicianSettlement.exists({ _id: id });
      if (!exists) return res.status(404).json({ message: "Settlement not found" });
      return res
        .status(409)
        .json({ message: "A closed settlement cannot be deleted. Reopen it first." });
    }
    res.json({ message: "Settlement deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete settlement", error: err.message });
  }
}

/**
 * The technician's completed jobs, priced the same way the job finance page
 * prices revenue, each flagged with the other settlement it is already in (if
 * any). Used both to import a whole period and by the job picker.
 * - ?from / ?to override the saved period, so an unsaved period change works;
 * - ?any_date=true drops the period filter (picker: a job finished earlier);
 * - ?search matches job ID, client name or phone;
 * - ?limit caps the result (default and maximum MAX_LINES).
 */
async function listJobCandidates(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid settlement id" });
    const settlement = await TechnicianSettlement.findById(id)
      .select("technician_id period_from period_to")
      .lean();
    if (!settlement) return res.status(404).json({ message: "Settlement not found" });

    const anyDate = str(req.query.any_date).trim() === "true";
    const from = str(req.query.from).trim() || settlement.period_from;
    const to = str(req.query.to).trim() || settlement.period_to;
    if (!anyDate) {
      if (!isCalendarDay(from) || !isCalendarDay(to)) {
        return res.status(400).json({ message: "Invalid period date" });
      }
      if (from > to) {
        return res
          .status(400)
          .json({ message: "The period must start on or before the day it ends" });
      }
    }
    const limit = Math.min(
      Math.max(num(req.query.limit, { integer: true }) ?? MAX_LINES, 1),
      MAX_LINES
    );

    const filter = {
      assignedTechnician: settlement.technician_id,
      job_status: "completed",
    };
    // A date window and a search are two independent $or groups, so they are ANDed.
    const andClauses = [];
    if (!anyDate) {
      const range = {
        $gte: new Date(`${from}T00:00:00.000${QATAR_UTC_OFFSET}`),
        $lte: new Date(`${to}T23:59:59.999${QATAR_UTC_OFFSET}`),
      };
      // Same window rule as the jobs list: completed_at, falling back to
      // createdAt for jobs that never got one.
      andClauses.push({
        $or: [{ completed_at: range }, { completed_at: null, createdAt: range }],
      });
    }
    const search = str(req.query.search, { maxLength: 64 }).trim();
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      andClauses.push({
        $or: [{ job_reference: rx }, { clientName: rx }, { clientMobileNumber: rx }],
      });
    }
    if (andClauses.length) filter.$and = andClauses;

    // A period reads best in order; an open-ended search wants the latest first.
    const order = anyDate ? -1 : 1;
    const jobs = await Job.find(filter)
      .select(
        "job_reference clientName clientMobileNumber payment_method price distance_km completed_at createdAt"
      )
      .sort({ completed_at: order, createdAt: order })
      .limit(limit)
      .lean();

    const ids = jobs.map((job) => job._id);
    const [repairs, otherSettlements] = await Promise.all([
      ids.length
        ? RepairProcedure.find({ job_id: { $in: ids } }).select("job_id price quantity").lean()
        : [],
      ids.length
        ? TechnicianSettlement.find({ _id: { $ne: settlement._id }, job_ids: { $in: ids } })
            .select("number job_ids")
            .lean()
        : [],
    ]);

    const repairsByJob = new Map();
    for (const repair of repairs) {
      const key = String(repair.job_id);
      if (!repairsByJob.has(key)) repairsByJob.set(key, []);
      repairsByJob.get(key).push(repair);
    }
    const settledIn = new Map();
    for (const other of otherSettlements) {
      for (const jobId of other.job_ids) {
        settledIn.set(String(jobId), { _id: other._id, number: other.number });
      }
    }

    res.json({
      period_from: anyDate ? null : from,
      period_to: anyDate ? null : to,
      // The limit was reached, so more jobs may match.
      truncated: jobs.length === limit,
      jobs: jobs.map((job) => ({
        job_id: job._id,
        label: jobDisplayId(job),
        client_name: job.clientName || "",
        client_phone: job.clientMobileNumber || "",
        completed_at: job.completed_at || job.createdAt,
        payment_method: SETTLEMENT_PAYMENT_METHODS.includes(job.payment_method)
          ? job.payment_method
          : "cash",
        amount: roundMoney(computeJobPricing(job, repairsByJob.get(String(job._id)) || []).total),
        settlement: settledIn.get(String(job._id)) || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs for settlement", error: err.message });
  }
}

module.exports = {
  listSettlements,
  getNextSettlementDefaults,
  createSettlement,
  getSettlement,
  updateSettlement,
  closeSettlement,
  reopenSettlement,
  deleteSettlement,
  listJobCandidates,
};
