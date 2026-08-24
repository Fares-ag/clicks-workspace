const { VendorPurchase, Vendor, Job } = require("../../../clicks-shared/models");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str, num, objectId } = require("../../../clicks-shared/utils/coerce");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");

const AUDITED_LOCK_MESSAGE = "Job is audited and locked. Re-audit the job to edit purchases.";
const MAX_PAGE = 100000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const QATAR_UTC_OFFSET = "+03:00";
const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const PURCHASE_FIELDS =
  "job_id vendor_id description sku quantity unit_cost total_cost receipt_ref purchased_at notes is_void created_by createdAt updatedAt";

function qatarDayStart(value) {
  if (!ISO_DATE_RE.test(value)) return null;
  const at = new Date(`${value}T00:00:00.000${QATAR_UTC_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  return qatarDateString(at) === value ? at : null;
}

function qatarDayEnd(value) {
  if (!ISO_DATE_RE.test(value)) return null;
  const at = new Date(`${value}T23:59:59.999${QATAR_UTC_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  return qatarDateString(at) === value ? at : null;
}

function qatarDateString(value) {
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + QATAR_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function qatarDateTimeString(value) {
  if (value === null || value === undefined || value === "") return "";
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + QATAR_UTC_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

function jobDisplayId(job) {
  const reference = String(job?.job_reference || "").trim();
  if (reference) return reference;
  return `#${String(job?._id || "").slice(-6)}`;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Parse one purchase row from API input. Returns { row } or { error }.
 */
function parsePurchaseRow(raw, { requireAll = true } = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = src._id || src.id ? objectId(src._id || src.id) : null;
  if ((src._id || src.id) && !id) return { error: "Invalid purchase id" };

  const description = str(src.description, { maxLength: 300 }).trim();
  const sku = str(src.sku, { maxLength: 80 }).trim();
  const receiptRef = str(src.receipt_ref ?? src.receiptRef, { maxLength: 120 }).trim();
  const notes = str(src.notes, { maxLength: 500 });

  const vendorId = src.vendor_id || src.vendorId ? objectId(src.vendor_id || src.vendorId) : null;
  const quantityRaw = src.quantity;
  const unitCostRaw = src.unit_cost ?? src.unitCost;

  const hasQty = quantityRaw !== null && quantityRaw !== undefined && quantityRaw !== "";
  const hasUnit = unitCostRaw !== null && unitCostRaw !== undefined && unitCostRaw !== "";
  const quantity = hasQty ? Number(quantityRaw) : requireAll ? NaN : 0;
  const unitCost = hasUnit ? Number(unitCostRaw) : requireAll ? NaN : 0;

  if (requireAll && !description) return { error: "Purchase description is required" };
  if (requireAll && !vendorId) return { error: "Vendor is required for each purchase" };
  if (hasQty && (!Number.isFinite(quantity) || quantity <= 0)) {
    return { error: "Purchase quantity must be greater than zero" };
  }
  if (hasUnit && (!Number.isFinite(unitCost) || unitCost < 0)) {
    return { error: "Purchase unit cost cannot be negative" };
  }

  let purchasedAt = src.purchased_at ?? src.purchasedAt;
  if (purchasedAt != null && purchasedAt !== "") {
    purchasedAt = new Date(purchasedAt);
    if (Number.isNaN(purchasedAt.getTime())) return { error: "Invalid purchased_at date" };
  } else {
    purchasedAt = undefined;
  }

  const totalCost =
    hasQty && hasUnit ? roundMoney(quantity * unitCost) : roundMoney(Number(src.total_cost ?? src.totalCost) || 0);

  if (requireAll && (!hasQty || !hasUnit)) {
    return { error: "Purchase quantity and unit cost are required" };
  }

  if (!description && !vendorId && !hasQty && !hasUnit && !id) {
    return { row: null };
  }

  return {
    row: {
      _id: id,
      description,
      sku,
      vendor_id: vendorId,
      quantity: hasQty ? quantity : 0,
      unit_cost: hasUnit ? unitCost : 0,
      total_cost: totalCost,
      receipt_ref: receiptRef,
      purchased_at: purchasedAt,
      notes,
    },
  };
}

/**
 * Validate purchase rows submitted with a job save/audit/re-audit.
 */
function parsePurchaseRows(rows) {
  if (!Array.isArray(rows)) return { rows: [] };
  const parsed = [];
  for (const raw of rows) {
    const result = parsePurchaseRow(raw, { requireAll: true });
    if (result.error) return { error: result.error };
    if (result.row) parsed.push(result.row);
  }
  return { rows: parsed };
}

async function resolvePurchaseVendors(rows) {
  const ids = [...new Set(rows.map((row) => row.vendor_id).filter(Boolean))];
  if (!ids.length) return rows;
  const found = await Vendor.find({ _id: { $in: ids } }).select("_id").lean();
  const known = new Set(found.map((vendor) => String(vendor._id)));
  return rows.map((row) => ({
    ...row,
    vendor_id: row.vendor_id && known.has(String(row.vendor_id)) ? row.vendor_id : null,
  }));
}

async function loadCompletedJob(jobId) {
  const _id = objectId(jobId);
  if (!_id) return null;
  const job = await Job.findOne({ _id, job_status: "completed" });
  if (!job) return null;
  return job;
}

function serializePurchase(purchase, { vendor, job } = {}) {
  if (!purchase) return null;
  return {
    _id: purchase._id,
    job_id: purchase.job_id,
    vendor_id: purchase.vendor_id,
    description: purchase.description || "",
    sku: purchase.sku || "",
    quantity: Number(purchase.quantity) || 0,
    unit_cost: Number(purchase.unit_cost) || 0,
    total_cost: Number(purchase.total_cost) || 0,
    receipt_ref: purchase.receipt_ref || "",
    purchased_at: purchase.purchased_at,
    notes: purchase.notes || "",
    is_void: purchase.is_void === true,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    vendor: vendor
      ? { _id: vendor._id, name: vendor.name || "" }
      : purchase.vendor
        ? { _id: purchase.vendor._id, name: purchase.vendor.name || "" }
        : null,
    job: job
      ? {
          _id: job._id,
          job_reference: job.job_reference || "",
          displayId: jobDisplayId(job),
        }
      : purchase.job
        ? {
            _id: purchase.job._id,
            job_reference: purchase.job.job_reference || "",
            displayId: jobDisplayId(purchase.job),
          }
        : null,
  };
}

async function decoratePurchases(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];

  const vendorIds = [...new Set(list.map((row) => String(row.vendor_id)).filter(Boolean))];
  const jobIds = [...new Set(list.map((row) => String(row.job_id)).filter(Boolean))];

  const [vendors, jobs] = await Promise.all([
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds } }).select("name").lean()
      : [],
    jobIds.length
      ? Job.find({ _id: { $in: jobIds } }).select("job_reference").lean()
      : [],
  ]);

  const vendorById = new Map(vendors.map((v) => [String(v._id), v]));
  const jobById = new Map(jobs.map((j) => [String(j._id), j]));

  return list.map((row) =>
    serializePurchase(row, {
      vendor: vendorById.get(String(row.vendor_id)),
      job: jobById.get(String(row.job_id)),
    })
  );
}

async function listActivePurchasesForJob(jobId) {
  return VendorPurchase.find({ job_id: jobId, is_void: false })
    .sort({ purchased_at: -1, createdAt: -1 })
    .lean();
}

async function summarisePurchaseTotals(jobIds) {
  const ids = (Array.isArray(jobIds) ? jobIds : []).filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await VendorPurchase.aggregate([
    { $match: { job_id: { $in: ids }, is_void: false } },
    { $group: { _id: "$job_id", total: { $sum: "$total_cost" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), Number(row.total) || 0]));
}

/**
 * Replace/sync purchase rows for a job (used by finance save/audit/re-audit).
 */
async function syncJobPurchases(jobId, rows, financeUserId) {
  const resolved = await resolvePurchaseVendors(rows);
  for (const row of resolved) {
    if (!row.vendor_id) throw new Error("Invalid vendor on purchase row");
  }

  const existing = await VendorPurchase.find({ job_id: jobId, is_void: false }).lean();
  const keepIds = new Set();

  for (const row of resolved) {
    const payload = {
      job_id: jobId,
      vendor_id: row.vendor_id,
      description: row.description,
      sku: row.sku || "",
      quantity: row.quantity,
      unit_cost: row.unit_cost,
      total_cost: row.total_cost,
      receipt_ref: row.receipt_ref || "",
      notes: row.notes || "",
    };
    if (row.purchased_at) payload.purchased_at = row.purchased_at;

    if (row._id) {
      const updated = await VendorPurchase.findOneAndUpdate(
        { _id: row._id, job_id: jobId, is_void: false },
        { $set: payload },
        { new: true }
      ).lean();
      if (!updated) throw new Error("Purchase row not found on this job");
      keepIds.add(String(updated._id));
    } else {
      const created = await VendorPurchase.create({
        ...payload,
        created_by: financeUserId || null,
      });
      keepIds.add(String(created._id));
    }
  }

  for (const row of existing) {
    if (!keepIds.has(String(row._id))) {
      await VendorPurchase.updateOne({ _id: row._id }, { $set: { is_void: true } });
    }
  }

  return listActivePurchasesForJob(jobId);
}

function buildPurchaseQuery(req) {
  const query = { is_void: false };
  const vendorId = objectId(req.query.vendor_id);
  const jobId = objectId(req.query.job_id);
  if (vendorId) query.vendor_id = vendorId;
  if (jobId) query.job_id = jobId;

  const from = qatarDayStart(str(req.query.from).trim());
  const to = qatarDayEnd(str(req.query.to).trim());
  if (from || to) {
    query.purchased_at = {};
    if (from) query.purchased_at.$gte = from;
    if (to) query.purchased_at.$lte = to;
  }

  const search = str(req.query.search, { maxLength: 64 }).trim();
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [{ description: rx }, { sku: rx }, { receipt_ref: rx }, { notes: rx }];
  }

  return query;
}

async function listPurchases(req, res) {
  try {
    const page = Math.min(Math.max(Number(req.query.page) || 1, 1), MAX_PAGE);
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const skip = (page - 1) * limit;
    const query = buildPurchaseQuery(req);

    const [rows, total] = await Promise.all([
      VendorPurchase.find(query)
        .sort({ purchased_at: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      cachedCount(VendorPurchase, query),
    ]);

    const purchases = await decoratePurchases(rows);
    res.json({ purchases, page, limit, total, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch purchases", error: err.message });
  }
}

async function listJobPurchases(req, res) {
  try {
    const job = await loadCompletedJob(req.params.jobId || req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const rows = await listActivePurchasesForJob(job._id);
    const purchases = await decoratePurchases(rows);
    res.json({ purchases });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job purchases", error: err.message });
  }
}

async function vendorSummary(req, res) {
  try {
    const vendorId = objectId(req.query.vendor_id);
    const match = { is_void: false };
    if (vendorId) match.vendor_id = vendorId;

    const from = qatarDayStart(str(req.query.from).trim());
    const to = qatarDayEnd(str(req.query.to).trim());
    if (from || to) {
      match.purchased_at = {};
      if (from) match.purchased_at.$gte = from;
      if (to) match.purchased_at.$lte = to;
    }

    const rows = await VendorPurchase.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$vendor_id",
          purchaseCount: { $sum: 1 },
          totalSpend: { $sum: "$total_cost" },
          totalQuantity: { $sum: "$quantity" },
        },
      },
      { $sort: { totalSpend: -1 } },
    ]);

    const vendorIds = rows.map((row) => row._id).filter(Boolean);
    const vendors = vendorIds.length
      ? await Vendor.find({ _id: { $in: vendorIds } }).select("name category isActive").lean()
      : [];
    const vendorById = new Map(vendors.map((v) => [String(v._id), v]));

    res.json({
      summary: rows.map((row) => {
        const vendor = vendorById.get(String(row._id));
        return {
          vendor_id: row._id,
          vendor: vendor
            ? { _id: vendor._id, name: vendor.name, category: vendor.category || "", isActive: vendor.isActive !== false }
            : null,
          purchaseCount: row.purchaseCount,
          totalSpend: roundMoney(row.totalSpend),
          totalQuantity: roundMoney(row.totalQuantity),
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vendor purchase summary", error: err.message });
  }
}

async function createPurchase(req, res) {
  try {
    const job = await loadCompletedJob(req.params.jobId || req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.finance_status === "audited") {
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    const parsed = parsePurchaseRow(req.body, { requireAll: true });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const [row] = await resolvePurchaseVendors([parsed.row]);
    if (!row.vendor_id) return res.status(400).json({ message: "Vendor not found" });

    const created = await VendorPurchase.create({
      job_id: job._id,
      vendor_id: row.vendor_id,
      description: row.description,
      sku: row.sku || "",
      quantity: row.quantity,
      unit_cost: row.unit_cost,
      total_cost: row.total_cost,
      receipt_ref: row.receipt_ref || "",
      purchased_at: row.purchased_at || new Date(),
      notes: row.notes || "",
      created_by: req.financeUser?._id || null,
    });

    const [purchase] = await decoratePurchases([created.toObject()]);
    res.status(201).json({ purchase });
  } catch (err) {
    res.status(500).json({ message: "Failed to create purchase", error: err.message });
  }
}

async function updatePurchase(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid purchase id" });

    const existing = await VendorPurchase.findOne({ _id: id, is_void: false }).lean();
    if (!existing) return res.status(404).json({ message: "Purchase not found" });

    const job = await loadCompletedJob(existing.job_id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.finance_status === "audited") {
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    const parsed = parsePurchaseRow({ ...existing, ...req.body, _id: id }, { requireAll: true });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const [row] = await resolvePurchaseVendors([parsed.row]);
    if (!row.vendor_id) return res.status(400).json({ message: "Vendor not found" });

    const updated = await VendorPurchase.findOneAndUpdate(
      { _id: id, is_void: false },
      {
        $set: {
          vendor_id: row.vendor_id,
          description: row.description,
          sku: row.sku || "",
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          total_cost: row.total_cost,
          receipt_ref: row.receipt_ref || "",
          purchased_at: row.purchased_at || existing.purchased_at,
          notes: row.notes || "",
        },
      },
      { new: true }
    ).lean();

    const [purchase] = await decoratePurchases([updated]);
    res.json({ purchase });
  } catch (err) {
    res.status(500).json({ message: "Failed to update purchase", error: err.message });
  }
}

async function voidPurchase(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid purchase id" });

    const existing = await VendorPurchase.findOne({ _id: id, is_void: false }).lean();
    if (!existing) return res.status(404).json({ message: "Purchase not found" });

    const job = await loadCompletedJob(existing.job_id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.finance_status === "audited") {
      return res.status(409).json({ message: AUDITED_LOCK_MESSAGE });
    }

    await VendorPurchase.updateOne({ _id: id }, { $set: { is_void: true } });
    res.json({ message: "Purchase removed" });
  } catch (err) {
    res.status(500).json({ message: "Failed to remove purchase", error: err.message });
  }
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function exportPurchasesCsv(req, res) {
  try {
    const query = buildPurchaseQuery(req);
    const rows = await VendorPurchase.find(query)
      .sort({ purchased_at: -1, createdAt: -1 })
      .limit(10000)
      .lean();
    const purchases = await decoratePurchases(rows);

    const lines = [
      [
        "Purchased At",
        "Job ID",
        "Vendor",
        "Description",
        "SKU",
        "Quantity",
        "Unit Cost",
        "Total",
        "Receipt Ref",
        "Notes",
      ].join(","),
    ];

    for (const row of purchases) {
      lines.push(
        [
          csvCell(qatarDateTimeString(row.purchased_at)),
          csvCell(row.job?.displayId || ""),
          csvCell(row.vendor?.name || ""),
          csvCell(row.description),
          csvCell(row.sku),
          csvCell(row.quantity),
          csvCell(row.unit_cost),
          csvCell(row.total_cost),
          csvCell(row.receipt_ref),
          csvCell(row.notes),
        ].join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="finance-purchases-${qatarDateString(new Date())}.csv"`
    );
    res.send(lines.join("\r\n"));
  } catch (err) {
    res.status(500).json({ message: "Failed to export purchases", error: err.message });
  }
}

module.exports = {
  parsePurchaseRows,
  syncJobPurchases,
  listActivePurchasesForJob,
  summarisePurchaseTotals,
  decoratePurchases,
  listPurchases,
  listJobPurchases,
  vendorSummary,
  createPurchase,
  updatePurchase,
  voidPurchase,
  exportPurchasesCsv,
};
