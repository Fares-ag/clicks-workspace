const { computeJobPricing } = require("../utils/jobPricing");

const BRAND = {
  company: "Clicks",
  product: "Roadside Assistance",
  legal: "Sanad RSA",
  country: "State of Qatar",
  support: "7091 9191",
};

const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const METHOD_LABELS = {
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
  fawran: "Fawran",
};

function pdfEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function clip(value, max) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function qatarParts(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return null;
  const qatar = new Date(d.getTime() + QATAR_UTC_OFFSET_MS);
  return {
    year: qatar.getUTCFullYear(),
    month: qatar.getUTCMonth(),
    day: qatar.getUTCDate(),
    hour: qatar.getUTCHours(),
    minute: qatar.getUTCMinutes(),
  };
}

function formatQatarWhen(value) {
  const parts = qatarParts(value);
  if (!parts) return "";
  const hour12 = parts.hour % 12 || 12;
  const ampm = parts.hour >= 12 ? "PM" : "AM";
  const mm = String(parts.minute).padStart(2, "0");
  return `${parts.day} ${MONTHS[parts.month]} ${parts.year}, ${hour12}:${mm} ${ampm} AST`;
}

function qatarYmd(value) {
  const parts = qatarParts(value);
  if (!parts) return "00000000";
  return `${parts.year}${String(parts.month + 1).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

function last4(value) {
  const raw = String(value || "0000").replace(/[^a-zA-Z0-9]/g, "");
  return (raw.slice(-4) || "0000").toUpperCase();
}

function receiptNumber(receipt = {}, job = {}) {
  const issued = receipt.issued_at || job.completed_at || job.paid_at || job.dateTime;
  const id = receipt._id || job._id || "0000";
  return `REC-${qatarYmd(issued)}-${last4(id)}`;
}

function jobRef(job = {}, receipt = {}) {
  if (job.job_reference) return String(job.job_reference);
  if (job._id) return String(job._id).slice(-8).toUpperCase();
  if (receipt._id) return String(receipt._id).slice(-8).toUpperCase();
  return "";
}

function receiptFilename(job = {}, receipt = {}) {
  const ref = String(job.job_reference || job._id || receipt._id || "receipt")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `clicks-receipt-${ref || "receipt"}.pdf`;
}

function vehicleLine(job = {}) {
  return [job.vehicleMake, job.vehicleModel, job.vehicleYear, job.licensePlate]
    .filter((part) => part != null && String(part).trim())
    .join(" ");
}

function technicianName(job = {}) {
  const tech = job.assignedTechnician;
  if (tech && typeof tech === "object") {
    return `${tech.firstName || ""} ${tech.lastName || ""}`.trim();
  }
  return String(job.legacyTechnicianName || "").trim();
}

function membershipFromJob(job = {}) {
  const mem = job.membership || {};
  const sub = mem.subscription_id;
  const planName =
    (sub && typeof sub === "object" && (sub.planName || sub.planCode)) ||
    mem.planName ||
    "";
  return {
    cover: mem.cover || "none",
    discountPercent: Number(mem.discountPercent || 0),
    included: mem.cover === "included" || mem.included === true,
    planName: String(planName || "").trim(),
  };
}

function skipcashRef(job = {}) {
  const skip = job.skipcash || {};
  return String(skip.transaction_id || skip.payment_id || skip.visa_id || "").trim();
}

function methodLabel(job = {}) {
  if (skipcashRef(job)) return "SkipCash";
  const method = String(job.payment_method || "").toLowerCase();
  return METHOD_LABELS[method] || (method ? method : "");
}

function isPaid(receipt = {}, job = {}) {
  const status = String(receipt.payment_status || job.payment_status || "").toLowerCase();
  return status === "paid" || status === "confirmed";
}

function paymentHeadline(receipt = {}, job = {}) {
  const paid = isPaid(receipt, job);
  const method = methodLabel(job);
  if (paid && method) return `Paid · ${method}`;
  if (paid) return "Paid";
  if (method) return `Unpaid · ${method}`;
  return "Unpaid";
}

function paymentDetail(receipt = {}, job = {}) {
  const paid = isPaid(receipt, job);
  const method = methodLabel(job) || "—";
  if (paid) return `Payment  ${method} · paid in full`;
  return `Payment  ${method} · unpaid`;
}

function resolveRepairs(receipt = {}, repairs) {
  if (Array.isArray(repairs)) return repairs;
  return Array.isArray(receipt.items) ? receipt.items : [];
}

function buildLineItems({ receipt = {}, job = {}, repairs } = {}) {
  const repairList = resolveRepairs(receipt, repairs);
  const pricing = computeJobPricing(job, repairList);
  const items = [];
  const callout = Number(job.price) || 0;
  const calloutLabel = job.jobType || job.issue || "Call-out";
  if (callout > 0) {
    items.push({ description: calloutLabel, quantity: 1, price: callout });
  }
  repairList.forEach((row) => {
    const qty = Number(row.quantity) || 1;
    const price = Number(row.price) || 0;
    const description = row.description || row.name || "Repair";
    if (!String(description).trim() && price === 0) return;
    items.push({ description, quantity: qty, price });
  });
  const distanceFee = Number(pricing.distanceFee) || 0;
  if (distanceFee > 0) {
    items.push({ description: "Distance fee", quantity: 1, price: distanceFee });
  }

  const membership = membershipFromJob(job);
  const gross = roundMoney(
    items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  );
  const total = roundMoney(
    receipt.total_amount != null ? receipt.total_amount : pricing.total
  );
  const adj = roundMoney(total - gross);
  const plan = membership.planName || "Membership";
  if (membership.included || membership.cover === "included") {
    const label = `${plan} — included`;
    if (Math.abs(adj) > 0.009) {
      items.push({ description: label, quantity: 1, price: adj });
    }
  } else if (membership.cover === "discounted") {
    const pct = Number(membership.discountPercent) || 0;
    const label = `${plan} — ${pct}% discount`;
    if (Math.abs(adj) > 0.009) {
      items.push({ description: label, quantity: 1, price: adj });
    }
  }

  if (!items.length) {
    items.push({
      description: job.issue || job.jobType || "Roadside assistance",
      quantity: 1,
      price: total,
    });
  }

  return { items, total, pricing, membership };
}

function buildContentStream({ receipt, job, repairs }) {
  const { items, total } = buildLineItems({ receipt, job, repairs });
  const lines = [];
  const add = (text) => lines.push(text);
  const fill = (r, g, b) => add(`${r} ${g} ${b} rg`);
  const textAt = (font, size, x, y, value) => {
    add(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };

  fill(0.545, 0.102, 0.106);
  add("0 754 595 88 re f");
  fill(1, 1, 1);
  textAt("F2", 22, 40, 812, "CLICKS");
  textAt("F1", 11, 40, 794, BRAND.product);
  textAt("F1", 8, 40, 778, `Issued by ${BRAND.legal}  ·  ${BRAND.country}`);
  textAt("F1", 9, 430, 812, "Support");
  textAt("F2", 11, 430, 794, BRAND.support);

  fill(0.12, 0.12, 0.14);
  textAt("F2", 16, 40, 728, "SERVICE RECEIPT");
  textAt("F2", 10, 400, 728, paymentHeadline(receipt, job));

  fill(0.42, 0.42, 0.45);
  textAt("F2", 8, 40, 704, "BILL TO");
  textAt("F2", 8, 320, 704, "RECEIPT");

  const left = [
    job.clientName,
    job.clientMobileNumber,
    vehicleLine(job),
    job.jobType || job.issue,
  ].filter((value) => value && String(value).trim());
  const issued = receipt.issued_at || job.completed_at || job.paid_at || job.dateTime;
  const right = [
    receiptNumber(receipt, job),
    jobRef(job, receipt) ? `Job ${jobRef(job, receipt)}` : "",
    formatQatarWhen(issued),
    technicianName(job) ? `Technician: ${technicianName(job)}` : "",
  ].filter(Boolean);

  fill(0.12, 0.12, 0.14);
  let yLeft = 688;
  left.forEach((value) => {
    textAt("F1", 10, 40, yLeft, clip(value, 42));
    yLeft -= 14;
  });
  let yRight = 688;
  right.forEach((value) => {
    textAt("F1", 10, 320, yRight, clip(value, 40));
    yRight -= 14;
  });

  let y = Math.min(yLeft, yRight) - 8;
  fill(0.545, 0.102, 0.106);
  add(`40 ${y} 515 1 re f`);
  y -= 20;
  fill(0.12, 0.12, 0.14);
  textAt("F2", 9, 40, y, "Description");
  textAt("F2", 9, 340, y, "Qty");
  textAt("F2", 9, 400, y, "Price");
  textAt("F2", 9, 480, y, "Amount");
  y -= 16;

  items.forEach((item) => {
    if (y < 120) return;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    fill(0.2, 0.2, 0.22);
    textAt("F1", 9, 40, y, clip(item.description || "Item", 46));
    textAt("F1", 9, 340, y, String(qty));
    textAt("F1", 9, 400, y, money(price));
    textAt("F1", 9, 480, y, money(price * qty));
    y -= 15;
  });

  y -= 6;
  fill(0.545, 0.102, 0.106);
  add(`40 ${y} 515 1 re f`);
  y -= 22;
  fill(0.12, 0.12, 0.14);
  textAt("F2", 12, 360, y, `Total QAR  ${money(total)}`);
  y -= 20;
  fill(0.2, 0.2, 0.22);
  textAt("F1", 9, 40, y, paymentDetail(receipt, job));
  const skipRef = skipcashRef(job);
  if (skipRef) {
    y -= 14;
    textAt("F1", 9, 40, y, `SkipCash ref  ${clip(skipRef, 36)}`);
  }

  fill(0.4, 0.4, 0.42);
  textAt(
    "F1",
    8,
    40,
    56,
    "Thank you for choosing Clicks. This roadside assistance receipt was issued"
  );
  textAt(
    "F1",
    8,
    40,
    44,
    `by ${BRAND.legal}, trading as Clicks ${BRAND.product} in the ${BRAND.country}.`
  );
  textAt("F1", 8, 40, 32, "Not a garage invoice unless parts are listed above.");

  return lines.join("\n");
}

function assemblePdf(stream) {
  const numbered = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  ];

  let offset = 0;
  const chunks = ["%PDF-1.4\n"];
  offset = Buffer.byteLength(chunks[0], "utf8");
  const xref = [0];
  numbered.forEach((body, i) => {
    xref.push(offset);
    const obj = `${i + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(obj);
    offset += Buffer.byteLength(obj, "utf8");
  });

  const xrefStart = offset;
  let xrefTable = `xref\n0 ${numbered.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((pos) => {
    xrefTable += `${String(pos).padStart(10, "0")} 00000 n \n`;
  });
  const trailer = `trailer\n<< /Size ${numbered.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xrefTable, trailer);
  return Buffer.concat(chunks.map((c) => Buffer.from(c, "utf8")));
}

function buildReceiptPdf({ receipt, job, repairs } = {}) {
  return assemblePdf(
    buildContentStream({
      receipt: receipt || {},
      job: job || {},
      repairs,
    })
  );
}

module.exports = {
  BRAND,
  buildReceiptPdf,
  buildLineItems,
  receiptNumber,
  receiptFilename,
  formatQatarWhen,
};
