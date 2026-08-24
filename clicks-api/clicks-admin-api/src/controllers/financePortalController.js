const { generateAccessToken, comparePassword } = require("../utils/authUtils");
const FinanceUser = require("../models/FinanceUser");
const Job = require("../models/Job");
const Technician = require("../models/Technician");
const { RepairProcedure, FinanceAuditLog, Vendor } = require("../../../clicks-shared/models");
const { computeFinancePreview } = require("../../../clicks-shared/utils/financeJobPreview");
const {
  parsePurchaseRows,
  syncJobPurchases,
  listActivePurchasesForJob,
  decoratePurchases,
  summarisePurchaseTotals,
} = require("./financePurchaseController");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str, num, objectId } = require("../../../clicks-shared/utils/coerce");

const AUDITED_LOCK_MESSAGE = "Job is audited and locked. Reopen it first.";
const PAYMENT_METHODS = ["card", "wallet", "cash", "fawran"];
const REAUDIT_REASON_MIN = 10;
const REAUDIT_REASON_MAX = 1000;
const CSV_MAX_ROWS = 10000;
// Upper bound on ?page=. skip((page - 1) * limit) is a linear walk, so an
// unbounded page number is a cheap way for one request to pin the database.
const MAX_PAGE = 100000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Qatar is UTC+3 all year — there is no DST, so the offset is a constant. */
const QATAR_UTC_OFFSET = "+03:00";
const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

async function appendFinanceAuditLog({
  jobId,
  action,
  revenue,
  costTotal,
  netProfit,
  financeUserId,
  notes,
  reason,
}) {
  await FinanceAuditLog.create({
    job_id: jobId,
    action,
    finance_revenue: revenue ?? null,
    finance_cost_total: costTotal ?? null,
    finance_net_profit: netProfit ?? null,
    finance_user_id: financeUserId,
    notes: notes != null ? String(notes).slice(0, 2000) : undefined,
    reason: reason != null ? String(reason).slice(0, REAUDIT_REASON_MAX) : undefined,
  });
}

/**
 * First instant of a Qatar-local calendar day.
 * Built from an explicit +03:00 offset rather than a local-midnight Date: on a
 * server running in UTC (or anything west of Doha) the latter lands on the
 * previous day once it is read back as a date.
 */
function qatarDayStart(value) {
  if (!ISO_DATE_RE.test(value)) return null;
  const at = new Date(`${value}T00:00:00.000${QATAR_UTC_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  // ISO_DATE_RE only checks the shape: "2026-02-31" parses and rolls over to
  // 2026-03-03, silently shifting the window by three days on both the jobs
  // list and the export. Only accept a date that reads back as the same day.
  return qatarDateString(at) === value ? at : null;
}

/** Last instant of a Qatar-local calendar day (inclusive `to` filter). */
function qatarDayEnd(value) {
  if (!ISO_DATE_RE.test(value)) return null;
  const at = new Date(`${value}T23:59:59.999${QATAR_UTC_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  return qatarDateString(at) === value ? at : null;
}

/** YYYY-MM-DD for an instant, read in Qatar local time. */
function qatarDateString(value) {
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + QATAR_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD HH:mm for an instant, read in Qatar local time. */
function qatarDateTimeString(value) {
  if (value === null || value === undefined || value === "") return "";
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + QATAR_UTC_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Display name for a job: the Job ID the technician typed in at completion,
 * falling back to a short id tail for jobs completed before the field existed.
 */
function jobDisplayId(job) {
  const reference = String(job?.job_reference || "").trim();
  if (reference) return reference;
  return `#${String(job?._id || "").slice(-6)}`;
}

function technicianDisplayName(job) {
  const tech = job?.assignedTechnician;
  if (tech && typeof tech === "object") {
    const name = `${tech.firstName || ""} ${tech.lastName || ""}`.trim();
    if (name) return name;
  }
  const legacy = String(job?.legacyTechnicianName || "").trim();
  if (legacy) return legacy;
  return "";
}

const normalizePhone = (raw) => {
  let phone = String(raw || "").trim().replace(/[\s-]/g, "");
  if (phone && !phone.startsWith("+") && /^\d+$/.test(phone)) {
    phone = `+${phone}`;
  }
  return phone;
};

/**
 * Validate + normalise the extra cost rows. Amounts are rejected rather than
 * coerced: `Number(x) || 0` silently turned "abc" and -50 into a cost of 0,
 * which then rode into the persisted revenue/cost/profit snapshot.
 * Returns { rows } or { error }.
 */
function parseExtraCostRows(rows) {
  if (!Array.isArray(rows)) return { rows: [] };
  const parsed = [];
  for (const row of rows) {
    const label = str(row?.label, { maxLength: 200 }).trim();
    const rawAmount = row?.amount;
    const amount =
      rawAmount === null || rawAmount === undefined || rawAmount === ""
        ? 0
        : Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: "Invalid extra cost amount" };
    }
    // An unusable id is stored as null rather than rejected — the row's money
    // still matters even when the vendor link is stale.
    const vendorId = row?.vendor_id ? objectId(row.vendor_id) : null;
    if (!label && !amount && !vendorId) continue;
    parsed.push({ label, amount, vendor_id: vendorId });
  }
  return { rows: parsed };
}

/**
 * Drop vendor links that do not resolve to a real Vendor, so a cost row can
 * never persist a dangling reference. One query for the whole batch.
 */
async function resolveExtraCostVendors(rows) {
  const ids = [...new Set(rows.map((row) => row.vendor_id).filter(Boolean))];
  if (!ids.length) return rows;
  const found = await Vendor.find({ _id: { $in: ids } }).select("_id").lean();
  const known = new Set(found.map((vendor) => String(vendor._id)));
  return rows.map((row) => ({
    ...row,
    vendor_id: row.vendor_id && known.has(String(row.vendor_id)) ? row.vendor_id : null,
  }));
}

/** Attach { _id, name } for every linked vendor on a job's extra cost rows. */
async function decorateExtraCostsWithVendors(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const plain = list.map((row) => ({
    _id: row._id,
    label: row.label ?? "",
    amount: Number(row.amount) || 0,
    vendor_id: row.vendor_id ?? null,
    vendor: null,
  }));

  const ids = [...new Set(plain.map((row) => row.vendor_id).filter(Boolean).map(String))];
  if (!ids.length) return plain;

  const vendors = await Vendor.find({ _id: { $in: ids } }).select("name").lean();
  const byId = new Map(vendors.map((vendor) => [String(vendor._id), { _id: vendor._id, name: vendor.name }]));

  return plain.map((row) => ({
    ...row,
    vendor: row.vendor_id ? byId.get(String(row.vendor_id)) || null : null,
  }));
}

/** Distinct vendor names referenced by a job's extra cost rows. */
function vendorNamesForJob(job, namesById) {
  const seen = new Set();
  for (const row of job.finance_extra_costs || []) {
    const name = row.vendor_id ? namesById.get(String(row.vendor_id)) : null;
    if (name) seen.add(name);
  }
  return [...seen].join("; ");
}

/**
 * Validate the submitted repair rows BEFORE anything is committed. A non-24-hex
 * id (or a non-numeric cost) raises a CastError from inside the write loop, and
 * the loop runs after the job's own finance fields have already been claimed —
 * so an unchecked row left the save half applied. Returns { rows } or { error }.
 */
function parseRepairCostRows(repairCosts) {
  if (!Array.isArray(repairCosts)) return { rows: [] };
  const rows = [];
  for (const row of repairCosts) {
    if (!row?.id) continue;
    const id = objectId(row.id);
    if (!id) return { error: "Invalid repair procedure id" };
    const cost = row.cost != null && row.cost !== "" ? Number(row.cost) : 0;
    if (!Number.isFinite(cost) || cost < 0) return { error: "Invalid repair cost" };
    rows.push({ id, cost });
  }
  return { rows };
}

async function loadCompletedJob(id) {
  // A malformed id must read as "not found", not as a 500 CastError — the
  // "/jobs/:id" route also catches near-misses of "/jobs/export.csv".
  const _id = objectId(id);
  if (!_id) return null;
  const job = await Job.findById(_id)
    .populate("assignedTechnician", "firstName lastName phone")
    .populate("source", "mainSourceName");
  if (!job) return null;
  if (job.job_status !== "completed") return { error: "Only completed jobs can be audited" };
  return { job };
}

async function login(req, res) {
  try {
    const { phone, email, password } = req.body;
    if (!password || (!phone && !email)) {
      return res.status(400).json({ message: "Phone or email and password required" });
    }

    let user;
    if (email) {
      user = await FinanceUser.findOne({ email: String(email).trim().toLowerCase() }).select("+password");
    } else {
      const normalized = normalizePhone(phone);
      const bare = normalized.startsWith("+") ? normalized.slice(1) : normalized;
      user = await FinanceUser.findOne({
        $or: [{ phone: normalized }, { phone: bare }, { phone: String(phone).trim() }],
      }).select("+password");
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!comparePassword(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: "Auth not configured" });
    }

    const accessToken = generateAccessToken({
      id: user._id.toString(),
      role: "finance",
      email: user.email,
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Finance login error:", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
}

async function me(req, res) {
  try {
    const user = req.financeUser;
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load profile", error: err.message });
  }
}

async function dashboard(req, res) {
  try {
    const baseQuery = { job_status: "completed" };
    const pendingQuery = {
      ...baseQuery,
      finance_status: { $ne: "audited" },
    };
    const [
      totalCompleted,
      pendingAudit,
      audited,
      profitAgg,
      pendingAuditList,
      recentlyAudited,
    ] = await Promise.all([
      cachedCount(Job, baseQuery, { ttlMs: 30000, key: "finance_total_completed" }),
      cachedCount(Job, pendingQuery, { ttlMs: 30000, key: "finance_pending_audit" }),
      cachedCount(Job, { ...baseQuery, finance_status: "audited" }, { ttlMs: 30000, key: "finance_audited" }),
      Job.aggregate([
        { $match: { ...baseQuery, finance_status: "audited" } },
        {
          $group: {
            _id: null,
            totalNetProfit: { $sum: { $ifNull: ["$finance_net_profit", 0] } },
            totalRevenue: { $sum: { $ifNull: ["$finance_revenue", 0] } },
            totalCost: { $sum: { $ifNull: ["$finance_cost_total", 0] } },
          },
        },
      ]),
      Job.find(pendingQuery)
        .select(
          "clientName clientMobileNumber issue jobType completed_at createdAt businessName finance_status"
        )
        .sort({ completed_at: -1, createdAt: -1 })
        .limit(6)
        .lean(),
      Job.find({ ...baseQuery, finance_status: "audited" })
        .select(
          "clientName clientMobileNumber finance_net_profit finance_revenue finance_audited_at completed_at"
        )
        .sort({ finance_audited_at: -1 })
        .limit(5)
        .lean(),
    ]);

    const totals = profitAgg[0] || {
      totalNetProfit: 0,
      totalRevenue: 0,
      totalCost: 0,
    };

    const auditRate =
      totalCompleted > 0 ? Math.round((audited / totalCompleted) * 100) : 0;

    res.json({
      totalCompleted,
      pendingAudit,
      audited,
      auditRate,
      totalNetProfit: totals.totalNetProfit,
      totalRevenue: totals.totalRevenue,
      totalCost: totals.totalCost,
      pendingAuditList,
      recentlyAudited,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load dashboard", error: err.message });
  }
}

/**
 * Filter shared by the jobs list and its CSV export, so the file an operator
 * downloads can never describe a different set of jobs than the one on screen.
 * Returns { query } or { error }.
 */
function buildJobsFilter(rawQuery) {
  const src = rawQuery || {};
  const query = { job_status: "completed" };

  const financeStatus = str(src.finance_status).trim();
  if (financeStatus === "pending" || financeStatus === "audited") {
    query.finance_status =
      financeStatus === "pending" ? { $ne: "audited" } : "audited";
  }

  const paymentMethod = str(src.payment_method).trim();
  if (PAYMENT_METHODS.includes(paymentMethod)) {
    query.payment_method = paymentMethod;
  }

  const vendorId = objectId(src.vendor_id);
  if (vendorId) {
    query["finance_extra_costs.vendor_id"] = vendorId;
  }

  const technicianId = objectId(src.technician_id);
  if (technicianId) {
    query.assignedTechnician = technicianId;
  }

  // Two independent $or groups (search, date window) cannot both live on the
  // filter root — the second would overwrite the first — so they are ANDed.
  const andClauses = [];

  // Coerced so a repeated ?search= (array) cannot reach $regex, and escaped so
  // metacharacters are matched literally — a leading "+" from a Qatari number
  // used to be an invalid pattern (500), and "(a+)+" a backtracking scan.
  const search = str(src.search, { maxLength: 64 }).trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    andClauses.push({
      $or: [
        { job_reference: rx },
        { clientName: rx },
        { clientMobileNumber: rx },
        { issue: rx },
        { location: rx },
        { businessName: rx },
      ],
    });
  }

  const range = {};
  const fromRaw = str(src.from).trim();
  if (fromRaw) {
    const from = qatarDayStart(fromRaw);
    if (!from) return { error: "Invalid from date" };
    range.$gte = from;
  }
  const toRaw = str(src.to).trim();
  if (toRaw) {
    const to = qatarDayEnd(toRaw);
    if (!to) return { error: "Invalid to date" };
    range.$lte = to;
  }
  if (range.$gte || range.$lte) {
    // completed_at is the finance-relevant instant; jobs that never got one
    // fall back to createdAt. `completed_at: null` matches an absent field too.
    andClauses.push({
      $or: [
        { completed_at: range },
        { completed_at: null, createdAt: range },
      ],
    });
  }

  if (andClauses.length === 1) {
    Object.assign(query, andClauses[0]);
  } else if (andClauses.length > 1) {
    query.$and = andClauses;
  }

  return { query };
}

async function listJobs(req, res) {
  try {
    const built = buildJobsFilter(req.query);
    if (built.error) return res.status(400).json({ message: built.error });

    const page = Math.min(Math.max(num(req.query.page, { integer: true }) ?? 1, 1), MAX_PAGE);
    const limit = Math.min(Math.max(num(req.query.limit, { integer: true }) ?? 20, 1), 100);

    const jobs = await Job.find(built.query)
      .populate("assignedTechnician", "firstName lastName")
      .populate("source", "mainSourceName")
      .sort({ completed_at: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Job.countDocuments(built.query);

    res.json({ jobs, total, page, limit });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs", error: err.message });
  }
}

const CSV_COLUMNS = [
  "Job ID",
  "Client Name",
  "Phone",
  "Technician",
  "Payment Method",
  "Status",
  "Completed At",
  "Revenue",
  "Cost Total",
  "Net Profit",
  "Audited",
  "Re-audited Count",
  "Vendors",
];

const CSV_JOB_FIELDS =
  "job_reference clientName clientMobileNumber legacyTechnicianName payment_method finance_status " +
  "finance_revenue finance_cost_total finance_net_profit finance_reaudit_count " +
  "finance_extra_costs completed_at createdAt price dateTime assignedTechnician";

/** RFC 4180 quoting: wrap on comma/quote/newline, double any inner quote. */
function csvQuote(value) {
  const out = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(out) ? `"${out.replace(/"/g, '""')}"` : out;
}

/**
 * One CSV field of user-controlled text, RFC 4180 quoted, plus the spreadsheet
 * formula guard: a value opening with = + - @ is prefixed with an apostrophe so
 * Excel and Sheets read it as text instead of executing it.
 */
function csvCell(value) {
  let out = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(out)) out = `'${out}`;
  return csvQuote(out);
}

/**
 * One server-computed numeric field. The formula guard is deliberately NOT
 * applied here: these values are Numbers this process computed and can never
 * carry a submitted formula, while apostrophe-prefixing them would import a
 * negative net profit as text — the column would then refuse to SUM.
 */
function csvNumberCell(value) {
  return csvQuote(value);
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function csvMoney(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "";
}

/**
 * Repair price/cost totals per job in a single aggregation. Exporting up to
 * 10k jobs cannot afford one repair query each, and the sums here reproduce
 * computeJobPricing exactly — including its `quantity || 1` fallback.
 */
async function summariseRepairTotals(jobIds) {
  const totals = new Map();
  if (!jobIds.length) return totals;

  const quantity = {
    $let: {
      vars: { q: { $ifNull: ["$quantity", 1] } },
      in: { $cond: [{ $eq: ["$$q", 0] }, 1, "$$q"] },
    },
  };

  const rows = await RepairProcedure.aggregate([
    { $match: { job_id: { $in: jobIds } } },
    {
      $group: {
        _id: "$job_id",
        price: { $sum: { $multiply: [{ $ifNull: ["$price", 0] }, quantity] } },
        cost: { $sum: { $multiply: [{ $ifNull: ["$cost", 0] }, quantity] } },
      },
    },
  ]);

  for (const row of rows) {
    totals.set(String(row._id), { price: row.price || 0, cost: row.cost || 0 });
  }
  return totals;
}

async function exportJobsCsv(req, res) {
  try {
    const built = buildJobsFilter(req.query);
    if (built.error) return res.status(400).json({ message: built.error });

    // page/limit are deliberately ignored — an export covers the whole filter.
    const jobs = await Job.find(built.query)
      .select(CSV_JOB_FIELDS)
      .populate("assignedTechnician", "firstName lastName")
      .sort({ completed_at: -1, createdAt: -1 })
      .limit(CSV_MAX_ROWS)
      .lean();

    const [repairTotals, vendors, purchaseTotals] = await Promise.all([
      summariseRepairTotals(jobs.map((job) => job._id)),
      (async () => {
        const ids = new Set();
        for (const job of jobs) {
          for (const row of job.finance_extra_costs || []) {
            if (row.vendor_id) ids.add(String(row.vendor_id));
          }
        }
        if (!ids.size) return [];
        return Vendor.find({ _id: { $in: [...ids] } }).select("name").lean();
      })(),
      summarisePurchaseTotals(jobs.map((job) => job._id)),
    ]);

    const vendorNamesById = new Map(vendors.map((vendor) => [String(vendor._id), vendor.name]));

    const lines = [csvRow(CSV_COLUMNS)];
    for (const job of jobs) {
      const repairs = repairTotals.get(String(job._id)) || { price: 0, cost: 0 };
      // computeJobPricing only ever sums price*quantity and cost*quantity, so a
      // single pre-summed row is equivalent to replaying every repair document.
      const preview = computeFinancePreview(
        job,
        [{ price: repairs.price, cost: repairs.cost, quantity: 1 }],
        job.finance_extra_costs || [],
        [{ total_cost: purchaseTotals.get(String(job._id)) || 0, quantity: 1 }]
      );

      const audited = job.finance_status === "audited";
      const revenue = audited && job.finance_revenue != null ? job.finance_revenue : preview.revenue;
      const costTotal =
        audited && job.finance_cost_total != null ? job.finance_cost_total : preview.costTotal;
      const netProfit =
        audited && job.finance_net_profit != null ? job.finance_net_profit : preview.netProfit;

      lines.push(
        [
          csvCell(jobDisplayId(job)),
          csvCell(job.clientName || ""),
          csvCell(job.clientMobileNumber || ""),
          csvCell(technicianDisplayName(job)),
          csvCell(job.payment_method || ""),
          csvCell(job.finance_status || "pending"),
          csvCell(qatarDateTimeString(job.completed_at || job.createdAt)),
          csvNumberCell(csvMoney(revenue)),
          csvNumberCell(csvMoney(costTotal)),
          csvNumberCell(csvMoney(netProfit)),
          csvCell(audited ? "Yes" : "No"),
          csvNumberCell(Number(job.finance_reaudit_count) || 0),
          csvCell(vendorNamesForJob(job, vendorNamesById)),
        ].join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finance-jobs-${qatarDateString(new Date())}.csv"`
    );
    res.send(lines.join("\r\n"));
  } catch (err) {
    res.status(500).json({ message: "Failed to export jobs", error: err.message });
  }
}

async function listTechnicians(req, res) {
  try {
    const technicians = await Technician.find({ applicationStatus: "Approved" })
      .select("firstName lastName")
      .sort({ firstName: 1, lastName: 1 })
      .lean();
    res.json({ technicians });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch technicians", error: err.message });
  }
}

async function getJob(req, res) {
  try {
    const loaded = await loadCompletedJob(req.params.id);
    if (!loaded) return res.status(404).json({ message: "Job not found" });
    if (loaded.error) return res.status(400).json({ message: loaded.error });

    const { job } = loaded;
    const repairs = await RepairProcedure.find({ job_id: job._id })
      .sort({ created_at: 1 })
      .lean();

    const purchaseRows = await listActivePurchasesForJob(job._id);
    const purchases = await decoratePurchases(purchaseRows);

    const preview = computeFinancePreview(
      job,
      repairs,
      job.finance_extra_costs || [],
      purchaseRows
    );

    // job is returned whole (no .select()), so job_reference / clientName /
    // payment_method reach the portal untouched.
    const extraCosts = await decorateExtraCostsWithVendors(job.finance_extra_costs || []);

    res.json({
      job,
      repairs,
      finance: {
        status: job.finance_status || "pending",
        revenue: preview.revenue,
        costTotal: preview.costTotal,
        netProfit: preview.netProfit,
        extraCosts,
        purchases,
        purchaseTotal: preview.purchaseTotal,
        notes: job.finance_notes || "",
        auditedAt: job.finance_audited_at,
        reauditCount: Number(job.finance_reaudit_count) || 0,
        lastReauditReason: job.finance_last_reaudit_reason || "",
        lastReauditedAt: job.finance_last_reaudited_at || null,
        snapshots:
          job.finance_status === "audited"
            ? {
                revenue: job.finance_revenue,
                costTotal: job.finance_cost_total,
                netProfit: job.finance_net_profit,
              }
            : null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job", error: err.message });
  }
}

async function updateFinance(req, res) {
  try {
    const loaded = await loadCompletedJob(req.params.id);
    if (!loaded) return res.status(404).json({ message: "Job not found" });
    if (loaded.error) return res.status(400).json({ message: loaded.error });

    const { job } = loaded;
    const { repairCosts, extraCosts, purchases, notes } = req.body;

    // Checked up front: the claim below commits finance_extra_costs/finance_notes,
    // so a row that only blows up once the write loop reaches it would leave the
    // notes and extra costs persisted against unwritten repair costs.
    const parsedRepairs = parseRepairCostRows(repairCosts);
    if (parsedRepairs.error) {
      return res.status(400).json({ message: parsedRepairs.error });
    }

    const parsedExtras = parseExtraCostRows(extraCosts);
    if (parsedExtras.error) {
      return res.status(400).json({ message: parsedExtras.error });
    }

    const parsedPurchases = parsePurchaseRows(purchases);
    if (parsedPurchases.error) {
      return res.status(400).json({ message: parsedPurchases.error });
    }

    // The status on the document read above is advisory only — an audit can
    // commit between that read and this write. Claim the job atomically while
    // it is still unaudited instead. finance_status is re-asserted so the
    // update document is never empty (its enum is pending|audited).
    const financeSet = { finance_status: "pending" };
    if (extraCosts != null) {
      financeSet.finance_extra_costs = await resolveExtraCostVendors(parsedExtras.rows);
    }
    if (notes != null) {
      financeSet.finance_notes = String(notes).slice(0, 2000);
    }

    const claimed = await Job.findOneAndUpdate(
      { _id: job._id, job_status: "completed", finance_status: { $ne: "audited" } },
      { $set: financeSet },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    for (const row of parsedRepairs.rows) {
      await RepairProcedure.findOneAndUpdate(
        { _id: row.id, job_id: claimed._id },
        { cost: row.cost }
      );
    }

    if (purchases != null) {
      try {
        await syncJobPurchases(claimed._id, parsedPurchases.rows, req.financeUser._id);
      } catch (syncErr) {
        return res.status(400).json({ message: syncErr.message || "Invalid purchase rows" });
      }
    }

    const repairs = await RepairProcedure.find({ job_id: claimed._id }).sort({ created_at: 1 });
    const purchaseRows = await listActivePurchasesForJob(claimed._id);
    const preview = computeFinancePreview(claimed, repairs, claimed.finance_extra_costs, purchaseRows);

    // An audit can still land while the repair rows above are being written.
    // If it did, refresh the persisted snapshot so it still equals the rows it
    // claims to cover, then report the conflict rather than leaving the audited
    // revenue/cost/profit silently out of sync with its repair costs.
    const current = await Job.findOne({ _id: claimed._id })
      .select("finance_status finance_extra_costs")
      .lean();
    if (current && current.finance_status === "audited") {
      // Recomputed from the extra costs the concurrent audit actually persisted:
      // claimed.finance_extra_costs is this request's own pre-audit copy, so a
      // snapshot derived from it could still disagree with the job it describes.
      const reconciledPurchases = await listActivePurchasesForJob(claimed._id);
      const reconciled = computeFinancePreview(
        claimed,
        repairs,
        current.finance_extra_costs || [],
        reconciledPurchases
      );
      await Job.updateOne(
        { _id: claimed._id, finance_status: "audited" },
        {
          $set: {
            finance_revenue: reconciled.revenue,
            finance_cost_total: reconciled.costTotal,
            finance_net_profit: reconciled.netProfit,
          },
        }
      );
      await appendFinanceAuditLog({
        jobId: claimed._id,
        action: "update",
        revenue: reconciled.revenue,
        costTotal: reconciled.costTotal,
        netProfit: reconciled.netProfit,
        financeUserId: req.financeUser._id,
        notes: claimed.finance_notes,
      });
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    await appendFinanceAuditLog({
      jobId: claimed._id,
      action: "update",
      revenue: preview.revenue,
      costTotal: preview.costTotal,
      netProfit: preview.netProfit,
      financeUserId: req.financeUser._id,
      notes: claimed.finance_notes,
    });

    res.json({
      message: "Finance data saved",
      finance: {
        status: claimed.finance_status,
        revenue: preview.revenue,
        costTotal: preview.costTotal,
        netProfit: preview.netProfit,
        extraCosts: claimed.finance_extra_costs,
        notes: claimed.finance_notes,
      },
      repairs,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to save finance data", error: err.message });
  }
}

async function auditJob(req, res) {
  try {
    const loaded = await loadCompletedJob(req.params.id);
    if (!loaded) return res.status(404).json({ message: "Job not found" });
    if (loaded.error) return res.status(400).json({ message: loaded.error });

    const { job } = loaded;
    const { repairCosts, extraCosts, purchases, notes } = req.body;

    // Same up-front check as updateFinance: the audit claim below commits
    // finance_extra_costs/finance_notes, and the rollback only restores
    // finance_status, so a row that fails mid-loop must never reach the loop.
    const parsedRepairs = parseRepairCostRows(repairCosts);
    if (parsedRepairs.error) {
      return res.status(400).json({ message: parsedRepairs.error });
    }

    const parsedExtras = parseExtraCostRows(extraCosts);
    if (parsedExtras.error) {
      return res.status(400).json({ message: parsedExtras.error });
    }

    const parsedPurchases = parsePurchaseRows(purchases);
    if (parsedPurchases.error) {
      return res.status(400).json({ message: parsedPurchases.error });
    }

    const auditSet = {
      finance_status: "audited",
      finance_audited_by: req.financeUser._id,
      finance_audited_at: new Date(),
    };
    if (extraCosts != null) {
      auditSet.finance_extra_costs = await resolveExtraCostVendors(parsedExtras.rows);
    }
    if (notes != null) {
      auditSet.finance_notes = String(notes).slice(0, 2000);
    }

    // Take the audit lock atomically, and take it BEFORE reading the rows the
    // snapshot is computed from, so neither a second audit nor an edit can slip
    // a cost change in behind a check-then-write.
    const claimed = await Job.findOneAndUpdate(
      { _id: job._id, job_status: "completed", finance_status: { $ne: "audited" } },
      { $set: auditSet },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    let preview;
    let repairs;
    try {
      for (const row of parsedRepairs.rows) {
        await RepairProcedure.findOneAndUpdate(
          { _id: row.id, job_id: claimed._id },
          { cost: row.cost }
        );
      }

      if (purchases != null) {
        await syncJobPurchases(claimed._id, parsedPurchases.rows, req.financeUser._id);
      }

      repairs = await RepairProcedure.find({ job_id: claimed._id }).sort({ created_at: 1 });
      const purchaseRows = await listActivePurchasesForJob(claimed._id);
      preview = computeFinancePreview(claimed, repairs, claimed.finance_extra_costs, purchaseRows);

      claimed.finance_revenue = preview.revenue;
      claimed.finance_cost_total = preview.costTotal;
      claimed.finance_net_profit = preview.netProfit;
      await Job.updateOne(
        { _id: claimed._id },
        {
          $set: {
            finance_revenue: preview.revenue,
            finance_cost_total: preview.costTotal,
            finance_net_profit: preview.netProfit,
          },
        }
      );
    } catch (err) {
      // Never leave the job locked as audited with an unwritten snapshot.
      await Job.updateOne(
        { _id: claimed._id, finance_status: "audited" },
        { $set: { finance_status: "pending" } }
      ).catch(() => {});
      throw err;
    }

    await appendFinanceAuditLog({
      jobId: claimed._id,
      action: "audit",
      revenue: claimed.finance_revenue,
      costTotal: claimed.finance_cost_total,
      netProfit: claimed.finance_net_profit,
      financeUserId: req.financeUser._id,
      notes: claimed.finance_notes,
    });

    res.json({
      message: "Job audited",
      job: {
        id: claimed._id,
        finance_status: claimed.finance_status,
        finance_revenue: claimed.finance_revenue,
        finance_cost_total: claimed.finance_cost_total,
        finance_net_profit: claimed.finance_net_profit,
        finance_audited_at: claimed.finance_audited_at,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to audit job", error: err.message });
  }
}

/**
 * Re-audit an already audited job. Deliberately a separate endpoint from
 * updateFinance/auditJob: those two keep their 409 lock exactly as-is, and the
 * only way past the lock without reopening is this one, which demands a reason
 * and leaves a "re-audited" trail on the job.
 */
async function reauditJob(req, res) {
  try {
    const loaded = await loadCompletedJob(req.params.id);
    if (!loaded) return res.status(404).json({ message: "Job not found" });
    if (loaded.error) return res.status(400).json({ message: loaded.error });

    const { job } = loaded;
    if (job.finance_status !== "audited") {
      return res.status(400).json({ message: "Job is not audited" });
    }

    const { repairCosts, extraCosts, purchases, notes } = req.body || {};

    const reason = str(req.body?.reason, { maxLength: REAUDIT_REASON_MAX }).trim();
    if (reason.length < REAUDIT_REASON_MIN) {
      return res.status(400).json({
        message: `A reason of at least ${REAUDIT_REASON_MIN} characters is required`,
      });
    }

    // Same up-front validation as auditJob: the claim below commits the cost
    // rows, so a row that would only fail inside the write loop must never
    // reach it.
    const parsedRepairs = parseRepairCostRows(repairCosts);
    if (parsedRepairs.error) {
      return res.status(400).json({ message: parsedRepairs.error });
    }

    const parsedExtras = parseExtraCostRows(extraCosts);
    if (parsedExtras.error) {
      return res.status(400).json({ message: parsedExtras.error });
    }

    const parsedPurchases = parsePurchaseRows(purchases);
    if (parsedPurchases.error) {
      return res.status(400).json({ message: parsedPurchases.error });
    }

    const reauditSet = {
      finance_status: "audited",
      finance_last_reaudit_reason: reason,
      finance_last_reaudited_at: new Date(),
    };
    if (extraCosts != null) {
      reauditSet.finance_extra_costs = await resolveExtraCostVendors(parsedExtras.rows);
    }
    if (notes != null) {
      reauditSet.finance_notes = String(notes).slice(0, 2000);
    }

    // Optimistic-concurrency claim: the filter pins the re-audit counter this
    // request read, so of two concurrent re-audits exactly one matches and the
    // loser is told to reload instead of stacking a second set of cost edits on
    // top of a snapshot it never saw. `$in: [count, null]` also matches jobs
    // audited before the counter existed, where the field is still absent.
    const seenCount = Number(job.finance_reaudit_count) || 0;
    // Everything the claim below overwrites, kept so the post-claim writes can
    // be rolled back rather than leaving a half-applied re-audit behind.
    const before = job.toObject();
    const claimed = await Job.findOneAndUpdate(
      {
        _id: job._id,
        job_status: "completed",
        finance_status: "audited",
        finance_reaudit_count: seenCount === 0 ? { $in: [0, null] } : seenCount,
      },
      { $set: reauditSet, $inc: { finance_reaudit_count: 1 } },
      { new: true }
    );
    if (!claimed) {
      return res
        .status(409)
        .json({ message: "Job changed while re-auditing. Reload and try again." });
    }

    try {
      for (const row of parsedRepairs.rows) {
        await RepairProcedure.findOneAndUpdate(
          { _id: row.id, job_id: claimed._id },
          { cost: row.cost }
        );
      }

      if (purchases != null) {
        await syncJobPurchases(claimed._id, parsedPurchases.rows, req.financeUser._id);
      }

      const repairs = await RepairProcedure.find({ job_id: claimed._id }).sort({ created_at: 1 });
      const purchaseRows = await listActivePurchasesForJob(claimed._id);
      const preview = computeFinancePreview(claimed, repairs, claimed.finance_extra_costs, purchaseRows);

      claimed.finance_revenue = preview.revenue;
      claimed.finance_cost_total = preview.costTotal;
      claimed.finance_net_profit = preview.netProfit;
      await Job.updateOne(
        { _id: claimed._id },
        {
          $set: {
            finance_revenue: preview.revenue,
            finance_cost_total: preview.costTotal,
            finance_net_profit: preview.netProfit,
          },
        }
      );
    } catch (err) {
      // The claim already committed the counter, the reason and the new cost
      // rows. Without this undo the job stays audited carrying a snapshot that
      // predates the costs it claims to cover, and the operator's retry is then
      // refused by the optimistic guard. The counter in the filter makes this a
      // no-op if another writer has already moved the job on.
      await Job.updateOne(
        { _id: claimed._id, finance_reaudit_count: seenCount + 1 },
        {
          $set: {
            finance_extra_costs: before.finance_extra_costs || [],
            finance_notes: before.finance_notes || "",
            finance_last_reaudit_reason: before.finance_last_reaudit_reason || "",
            finance_last_reaudited_at: before.finance_last_reaudited_at || null,
          },
          $inc: { finance_reaudit_count: -1 },
        }
      ).catch(() => {});
      throw err;
    }

    // The job is already re-audited at this point; a failed log write must not
    // turn a committed re-audit into a 500 the operator would retry. It is
    // reported instead — this endpoint exists to leave a traceable reason, so a
    // missing trail has to be visible to the caller, not only in the console.
    let auditLogWritten = true;
    try {
      await appendFinanceAuditLog({
        jobId: claimed._id,
        action: "reaudit",
        revenue: claimed.finance_revenue,
        costTotal: claimed.finance_cost_total,
        netProfit: claimed.finance_net_profit,
        financeUserId: req.financeUser._id,
        notes: claimed.finance_notes,
        reason,
      });
    } catch (logErr) {
      auditLogWritten = false;
      console.error("Finance re-audit log write failed:", logErr);
    }

    res.json({
      message: "Job re-audited",
      auditLogWritten,
      job: {
        id: claimed._id,
        finance_status: claimed.finance_status,
        finance_revenue: claimed.finance_revenue,
        finance_cost_total: claimed.finance_cost_total,
        finance_net_profit: claimed.finance_net_profit,
        finance_audited_at: claimed.finance_audited_at,
        finance_reaudit_count: claimed.finance_reaudit_count,
        finance_last_reaudit_reason: claimed.finance_last_reaudit_reason,
        finance_last_reaudited_at: claimed.finance_last_reaudited_at,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to re-audit job", error: err.message });
  }
}

// Reopening is restricted to the "admin" finance role — see routes/financePortal.js.
async function reopenAudit(req, res) {
  try {
    const loaded = await loadCompletedJob(req.params.id);
    if (!loaded) return res.status(404).json({ message: "Job not found" });
    if (loaded.error) return res.status(400).json({ message: loaded.error });

    const { job } = loaded;
    if (job.finance_status !== "audited") {
      return res.status(400).json({ message: "Job is not audited" });
    }

    job.finance_status = "pending";
    await job.save();

    const { notes } = req.body || {};

    await appendFinanceAuditLog({
      jobId: job._id,
      action: "reopen",
      revenue: job.finance_revenue,
      costTotal: job.finance_cost_total,
      netProfit: job.finance_net_profit,
      financeUserId: req.financeUser._id,
      notes: notes != null ? notes : job.finance_notes,
    });

    res.json({
      message: "Job reopened for editing",
      job: {
        id: job._id,
        finance_status: job.finance_status,
        finance_revenue: job.finance_revenue,
        finance_cost_total: job.finance_cost_total,
        finance_net_profit: job.finance_net_profit,
        finance_audited_at: job.finance_audited_at,
        finance_audited_by: job.finance_audited_by,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to reopen job", error: err.message });
  }
}

async function getJobHistory(req, res) {
  try {
    const _id = objectId(req.params.id);
    if (!_id) return res.status(404).json({ message: "Job not found" });

    const job = await Job.findById(_id).select("_id job_status").lean();
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.job_status !== "completed") {
      return res.status(400).json({ message: "Only completed jobs have finance history" });
    }

    const history = await FinanceAuditLog.find({ job_id: job._id })
      .populate("finance_user_id", "name email")
      .sort({ at: -1 })
      .lean();

    res.json({ history });
  } catch (err) {
    res.status(500).json({ message: "Failed to load finance history", error: err.message });
  }
}

module.exports = {
  login,
  me,
  dashboard,
  listJobs,
  listTechnicians,
  exportJobsCsv,
  getJob,
  updateFinance,
  auditJob,
  reauditJob,
  reopenAudit,
  getJobHistory,
};
