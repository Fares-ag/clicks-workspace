const fs = require("fs");
const path = require("path");
const { computeJobPricing } = require("../utils/jobPricing");

const BRAND = {
  company: "Sanadcom",
  legalName: "Sanadcom for Roadside Assistance Services",
  product: "Roadside Assistance",
  legal: "Sanad RSA",
  country: "State of Qatar",
  city: "Doha",
  support: "7091 9191",
};

const LOGO = {
  widthPx: 1400,
  heightPx: 375,
  drawWidth: 210,
  drawHeight: 56,
  bytes: fs.readFileSync(path.join(__dirname, "..", "assets", "sanad-logo.jpg")),
};

const LOGO_DATA_URI = `data:image/jpeg;base64,${LOGO.bytes.toString("base64")}`;

const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const METHOD_LABELS = {
  cash: "Cash",
  card: "Card",
  wallet: "Wallet",
  fawran: "Fawran",
  membership: "Membership",
  waived: "Waived",
};
const NAVY = { r: 0.035, g: 0.2, b: 0.271 };
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const HELVETICA_WIDTHS = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  0: 556, 1: 556, 2: 556, 3: 556, 4: 556, 5: 556, 6: 556, 7: 556, 8: 556, 9: 556,
  ":": 278, ";": 278, "=": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
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
  // Sequential REC-YYYY-000001 assigned at issue; receipts issued before
  // numbering existed keep the legacy date + id-suffix number below.
  if (receipt.receipt_number) return String(receipt.receipt_number);
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
  return `sanadcom-receipt-${ref || "receipt"}.pdf`;
}

function accountFromJob(job = {}) {
  const account = job.customer_id && typeof job.customer_id === "object" ? job.customer_id : {};
  return {
    name: `${account.first_name || ""} ${account.last_name || ""}`.trim(),
    mobile: String(account.phone_number || "").trim(),
    email: String(account.email || "").trim(),
    clientId: String(account.client_id || "").trim(),
  };
}

function customerIdentity(job = {}) {
  const account = accountFromJob(job);
  return {
    name: String(job.clientName || account.name || "").trim(),
    mobile: String(job.clientMobileNumber || account.mobile || "").trim(),
    email: String(job.clientEmail || account.email || "").trim(),
    clientId: account.clientId,
    vehicle: [job.vehicleMake, job.vehicleModel, job.vehicleYear]
      .filter((part) => part != null && String(part).trim())
      .join(" "),
    plate: String(job.licensePlate || "").trim(),
  };
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

function receiptMethod(receipt = {}, job = {}) {
  return String(receipt.payment_method || job.payment_method || "").toLowerCase();
}

function methodLabel(job = {}, receipt = {}) {
  const method = receiptMethod(receipt, job);
  // A SkipCash id on the job only means a checkout was opened; the receipt's
  // method says how it was actually paid.
  if ((method === "card" || !method) && (receipt.provider_payment_id || skipcashRef(job))) {
    return "SkipCash";
  }
  return METHOD_LABELS[method] || (method ? method : "");
}

function refundState(receipt = {}, job = {}) {
  const status = String(receipt.payment_status || job.payment_status || "").toLowerCase();
  if (status === "refunded" || status === "partially_refunded") return status;
  return "";
}

function isPaid(receipt = {}, job = {}) {
  const status = String(receipt.payment_status || job.payment_status || "").toLowerCase();
  return (
    status === "paid" ||
    status === "confirmed" ||
    status === "refunded" ||
    status === "partially_refunded"
  );
}

function paymentHeadline(receipt = {}, job = {}) {
  const refund = refundState(receipt, job);
  if (refund === "refunded") return "REFUNDED";
  if (refund === "partially_refunded") return "PARTIALLY REFUNDED";
  const paid = isPaid(receipt, job);
  const method = methodLabel(job, receipt);
  if (paid && method) return `PAID  |  ${method}`;
  if (paid) return "PAID";
  if (method) return `UNPAID  |  ${method}`;
  return "UNPAID";
}

function paymentDetail(receipt = {}, job = {}) {
  const paid = isPaid(receipt, job);
  const method = methodLabel(job, receipt) || "-";
  if (refundState(receipt, job)) {
    return `Refunded QAR ${money(receipt.refunded_amount || job.refunded_amount || 0)}.`;
  }
  if (receiptMethod(receipt, job) === "membership") return "Covered by membership.";
  if (receiptMethod(receipt, job) === "waived") return "Balance waived.";
  if (paid) return `Payment received in full by ${method}.`;
  return `Balance outstanding. Intended method: ${method}.`;
}

function hasSnapshot(receipt = {}) {
  return Boolean(receipt && receipt.snapshot && receipt.snapshot.snapshot_at);
}

/** An issued receipt renders its frozen lines, never the job's current repairs. */
function resolveRepairs(receipt = {}, repairs) {
  if (hasSnapshot(receipt)) return Array.isArray(receipt.items) ? receipt.items : [];
  if (Array.isArray(repairs)) return repairs;
  return Array.isArray(receipt.items) ? receipt.items : [];
}

function underHundred(n) {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens];
}

function underThousand(n) {
  if (n < 100) return underHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = `${ONES[hundreds]} hundred`;
  return rest ? `${head} and ${underHundred(rest)}` : head;
}

function numberToWords(n) {
  const value = Math.floor(Math.abs(Number(n) || 0));
  if (value === 0) return "zero";
  if (value < 1000) return underThousand(value);
  const thousands = Math.floor(value / 1000);
  const rest = value % 1000;
  const head = `${underThousand(thousands)} thousand`;
  if (!rest) return head;
  if (rest < 100) return `${head} and ${underHundred(rest)}`;
  return `${head} ${underThousand(rest)}`;
}

function moneyWords(value) {
  const total = roundMoney(value);
  const riyals = Math.floor(Math.abs(total));
  const dirhams = Math.round((Math.abs(total) - riyals) * 100);
  const riyalWord = riyals === 1 ? "Qatari riyal" : "Qatari riyals";
  let text = `${numberToWords(riyals)} ${riyalWord}`;
  if (dirhams > 0) {
    const dirhamWord = dirhams === 1 ? "dirham" : "dirhams";
    text += ` and ${numberToWords(dirhams)} ${dirhamWord}`;
  }
  if (total < 0) text = `minus ${text}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} only`;
}

function buildLineItems({ receipt = {}, job = {}, repairs } = {}) {
  const repairList = resolveRepairs(receipt, repairs);
  const snap = hasSnapshot(receipt) ? receipt.snapshot : null;
  const pricedJob = snap
    ? {
        ...job,
        price: snap.base_price,
        membership: snap.membership ? { ...(job.membership || {}), ...snap.membership } : job.membership,
      }
    : job;
  const pricing = computeJobPricing(pricedJob, repairList);
  const items = [];
  const callout = Number(pricedJob.price) || 0;
  const calloutLabel = (snap && snap.job_type) || job.jobType || job.issue || "Call-out";
  if (callout > 0) {
    items.push({ description: calloutLabel, quantity: 1, price: callout });
  }
  repairList.forEach((row) => {
    const qty = Number(row.quantity) || 1;
    const price = Number(row.price) || 0;
    const description = row.description || row.name || "Repair";
    if (!String(description).trim() && price === 0) return;
    items.push({
      description,
      quantity: qty,
      price,
      receipt_image_url: row.receipt_image_url,
    });
  });
  const distanceFee = Number(pricing.distanceFee) || 0;
  if (distanceFee > 0) {
    items.push({ description: "Distance fee", quantity: 1, price: distanceFee });
  }

  const membership = membershipFromJob(pricedJob);
  const gross = roundMoney(
    items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0)
  );
  const total = roundMoney(
    receipt.total_amount != null ? receipt.total_amount : pricing.total
  );
  const adj = roundMoney(total - gross);
  const plan = membership.planName || "Membership";
  if (membership.included || membership.cover === "included") {
    const label = `${plan} - included`;
    if (Math.abs(adj) > 0.009) {
      items.push({ description: label, quantity: 1, price: adj });
    }
  } else if (membership.cover === "discounted") {
    const pct = Number(membership.discountPercent) || 0;
    const label = `${plan} - ${pct}% discount`;
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

function stringWidth(text, size, font) {
  const bold = font === "F2";
  let width = 0;
  for (const ch of String(text || "")) {
    const base = HELVETICA_WIDTHS[ch] || 500;
    const letter = ch >= "0" && ch <= "9" || ch === "." || ch === "," || ch === " " ? base : base * (bold ? 1.12 : 1);
    width += letter / 1000 * size;
  }
  return width;
}

const LAYOUT = {
  left: 40,
  right: 555,
  width: 515,
  split: 298,
  labelW: 78,
  desc: 52,
  qtyRight: 348,
  unitRight: 448,
  amtRight: 543,
};

function formatLocation(value) {
  const text = String(value || "").trim();
  const gps = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!gps) return text;
  return `${Number(gps[1]).toFixed(5)}, ${Number(gps[2]).toFixed(5)}`;
}

function parseJpeg(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5),
        bytes,
        filter: "DCTDecode",
      };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

function loadAxios() {
  try {
    return require("axios");
  } catch {
    return null;
  }
}

async function fetchRepairReceiptImages(rows) {
  const axios = loadAxios();
  if (!axios) return [];
  const candidates = [];
  for (const row of rows || []) {
    const url = String(row.receipt_image_url || "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (candidates.some((item) => item.url === url)) continue;
    candidates.push({
      url,
      caption: String(row.description || row.name || "Parts receipt").trim() || "Parts receipt",
    });
    if (candidates.length >= 4) break;
  }
  const loaded = await Promise.all(
    candidates.map(async (item) => {
      try {
        const res = await axios.get(item.url, {
          responseType: "arraybuffer",
          timeout: 4000,
          maxContentLength: 2500000,
          maxBodyLength: 2500000,
          validateStatus: (status) => status === 200,
        });
        const jpeg = parseJpeg(Buffer.from(res.data));
        if (!jpeg || !jpeg.width || !jpeg.height) return null;
        return { ...jpeg, caption: item.caption };
      } catch {
        return null;
      }
    })
  );
  return loaded.filter(Boolean);
}

function kvPairs(pairs) {
  return pairs.filter(([, value]) => value && String(value).trim());
}

function buildContentStream({ receipt, job, repairs, photos = [] }) {
  const { items, total } = buildLineItems({ receipt, job, repairs });
  const customer = customerIdentity(job);
  const lines = [];
  const add = (text) => lines.push(text);
  const fill = (r, g, b) => add(`${r} ${g} ${b} rg`);
  const navy = () => fill(NAVY.r, NAVY.g, NAVY.b);
  const rect = (x, y, w, h) => add(`${x} ${y} ${w} ${h} re f`);
  const textAt = (font, size, x, y, value) => {
    add(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(value)}) Tj ET`);
  };
  const textRight = (font, size, rightX, y, value) => {
    textAt(font, size, rightX - stringWidth(value, size, font), y, value);
  };
  const barBaseline = (barY, barH, size) => barY + (barH - size) / 2 + 1;

  fill(NAVY.r, NAVY.g, NAVY.b);
  rect(0, 832, 595, 10);

  add("q");
  add(`${LOGO.drawWidth} 0 0 ${LOGO.drawHeight} ${LAYOUT.left} 770 cm`);
  add("/Im1 Do");
  add("Q");

  navy();
  textRight("F2", 14, LAYOUT.right, 806, "SERVICE RECEIPT");
  fill(0.35, 0.4, 0.44);
  textRight("F1", 9, LAYOUT.right, 788, receiptNumber(receipt, job));
  const issued = receipt.issued_at || job.completed_at || job.paid_at || job.dateTime;
  textRight("F1", 9, LAYOUT.right, 774, formatQatarWhen(issued));

  fill(0.35, 0.4, 0.44);
  textAt("F1", 8, LAYOUT.left, 756, `${BRAND.legalName}  |  ${BRAND.city}, ${BRAND.country}  |  Tel ${BRAND.support}`);
  navy();
  rect(LAYOUT.left, 748, LAYOUT.width, 1.2);

  const customerRows = kvPairs([
    ["Customer", customer.name],
    ["Mobile", customer.mobile],
    ["Email", customer.email],
    ["Vehicle", customer.vehicle],
    ["Plate", customer.plate],
    ["Client ID", customer.clientId],
  ]);
  const serviceRows = kvPairs([
    ["Job", jobRef(job, receipt)],
    ["Service", job.jobType || job.issue],
    ["Location", formatLocation(job.location)],
    ["Technician", technicianName(job)],
  ]);

  fill(0.4, 0.45, 0.48);
  textAt("F2", 8, LAYOUT.left, 732, "CUSTOMER");
  textAt("F2", 8, LAYOUT.split + 16, 732, "SERVICE");
  fill(0.9, 0.92, 0.93);
  rect(LAYOUT.split, 732 - Math.max(customerRows.length, serviceRows.length, 1) * 16 - 8, 0.6, Math.max(customerRows.length, serviceRows.length, 1) * 16 + 20);

  const drawKv = (x, startY, rows) => {
    let y = startY;
    rows.forEach(([label, value]) => {
      fill(0.45, 0.5, 0.53);
      textAt("F1", 9, x, y, label);
      fill(0.08, 0.12, 0.16);
      textAt("F1", 9, x + LAYOUT.labelW, y, clip(value, 26));
      y -= 16;
    });
    return y;
  };
  const leftBottom = drawKv(LAYOUT.left, 714, customerRows);
  const rightBottom = drawKv(LAYOUT.split + 16, 714, serviceRows);
  let y = Math.min(leftBottom, rightBottom) - 12;

  const headerH = 22;
  navy();
  rect(LAYOUT.left, y, LAYOUT.width, headerH);
  const headerTextY = barBaseline(y, headerH, 9);
  fill(1, 1, 1);
  textAt("F2", 9, LAYOUT.desc, headerTextY, "Description");
  textRight("F2", 9, LAYOUT.qtyRight, headerTextY, "Qty");
  textRight("F2", 9, LAYOUT.unitRight, headerTextY, "Unit (QAR)");
  textRight("F2", 9, LAYOUT.amtRight, headerTextY, "Amount (QAR)");
  y -= 20;

  items.forEach((item, index) => {
    if (y < 210) return;
    const rowH = 20;
    const rowY = y - 5;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const amount = roundMoney(price * qty);
    if (index % 2 === 1) {
      fill(0.965, 0.973, 0.976);
      rect(LAYOUT.left, rowY, LAYOUT.width, rowH);
    }
    const textY = barBaseline(rowY, rowH, 9);
    fill(0.12, 0.14, 0.16);
    textAt("F1", 9, LAYOUT.desc, textY, clip(item.description || "Item", 40));
    textRight("F1", 9, LAYOUT.qtyRight, textY, String(qty));
    textRight("F1", 9, LAYOUT.unitRight, textY, money(price));
    textRight("F1", 9, LAYOUT.amtRight, textY, money(amount));
    y -= rowH;
  });

  const totalH = 24;
  navy();
  rect(LAYOUT.left, y - 6, LAYOUT.width, totalH);
  const totalTextY = barBaseline(y - 6, totalH, 10);
  fill(1, 1, 1);
  textAt("F2", 10, LAYOUT.desc, totalTextY, "TOTAL");
  textRight("F2", 9, LAYOUT.unitRight, totalTextY, "QAR");
  textRight("F2", 10, LAYOUT.amtRight, totalTextY, money(total));
  y -= 36;

  fill(0.32, 0.36, 0.4);
  textAt("F1", 8, LAYOUT.left, y, clip(`Amount in words: ${moneyWords(total)}`, 92));
  y -= 32;

  const paid = isPaid(receipt, job);
  const payH = 24;
  if (paid) fill(0.12, 0.42, 0.32);
  else fill(0.62, 0.18, 0.16);
  rect(LAYOUT.left, y - 6, LAYOUT.width, payH);
  const payY = barBaseline(y - 6, payH, 9);
  fill(1, 1, 1);
  textAt("F2", 9, LAYOUT.desc, payY, paymentHeadline(receipt, job));
  textRight("F1", 9, LAYOUT.amtRight, payY, clip(paymentDetail(receipt, job), 48));
  y -= 22;
  const skipRef = receipt.transaction_id || receipt.provider_payment_id || skipcashRef(job);
  if (skipRef && methodLabel(job, receipt) === "SkipCash") {
    fill(0.32, 0.36, 0.4);
    textAt("F1", 8, 40, y, `SkipCash reference  ${clip(skipRef, 42)}`);
    y -= 16;
  }
  (Array.isArray(receipt.credit_notes) ? receipt.credit_notes : []).forEach((note) => {
    if (y < 120) return;
    fill(0.62, 0.18, 0.16);
    textAt(
      "F1",
      8,
      40,
      y,
      clip(
        `Credit note ${note.number}  |  -QAR ${money(note.amount)}  |  ${formatQatarWhen(note.issued_at)}  |  ${note.reason || ""}`,
        110
      )
    );
    y -= 14;
  });

  if (photos.length) {
    y -= 6;
    fill(0.4, 0.45, 0.48);
    textAt("F2", 8, LAYOUT.left, y, "CUSTOMER RECEIPTS");
    y -= 8;
    photos.forEach((photo, index) => {
      if (y < 130) return;
      const col = index % 2;
      if (col === 0 && index > 0) y -= 132;
      const boxW = 248;
      const boxH = 118;
      const x = col === 0 ? LAYOUT.left : LAYOUT.split + 9;
      const boxY = y - boxH;
      fill(0.945, 0.957, 0.961);
      rect(x, boxY, boxW, boxH);
      const scale = Math.min((boxW - 16) / photo.width, (boxH - 22) / photo.height);
      const dw = photo.width * scale;
      const dh = photo.height * scale;
      const ix = x + (boxW - dw) / 2;
      const iy = boxY + 14 + (boxH - 22 - dh) / 2;
      add("q");
      add(`${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${ix.toFixed(2)} ${iy.toFixed(2)} cm`);
      add(`/Im${index + 2} Do`);
      add("Q");
      fill(0.32, 0.36, 0.4);
      textAt("F1", 7, x + 8, boxY + 4, clip(photo.caption || "Receipt", 40));
    });
    y -= 132;
  }

  y -= 10;
  navy();
  rect(LAYOUT.left, y, LAYOUT.width, 1);
  y -= 14;
  fill(0.32, 0.36, 0.4);
  textAt("F1", 8, LAYOUT.left, y, `Thank you for choosing ${BRAND.company}.`);
  y -= 12;
  textAt(
    "F1",
    8,
    LAYOUT.left,
    y,
    `Issued by ${BRAND.legal}, trading as ${BRAND.legalName}, ${BRAND.city}, ${BRAND.country}.`
  );
  y -= 12;
  textAt("F1", 8, LAYOUT.left, y, `Support ${BRAND.support}  |  This is a service receipt, not a VAT tax invoice.`);
  navy();
  rect(0, 0, 595, 10);

  return lines.join("\n");
}

function pdfObject(id, dict, streamBytes) {
  if (streamBytes) {
    return Buffer.concat([
      Buffer.from(`${id} 0 obj\n${dict}\nstream\n`, "utf8"),
      streamBytes,
      Buffer.from("\nendstream\nendobj\n", "utf8"),
    ]);
  }
  return Buffer.from(`${id} 0 obj\n${dict}\nendobj\n`, "utf8");
}

function assemblePdf(stream, photos = []) {
  const streamBuf = Buffer.from(stream, "utf8");
  const xobjects = ["/Im1 7 0 R"].concat(
    photos.map((_, index) => `/Im${index + 2} ${8 + index} 0 R`)
  );
  const objects = [
    pdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    pdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    pdfObject(
      3,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << ${xobjects.join(" ")} >> >> >>`
    ),
    pdfObject(4, `<< /Length ${streamBuf.length} >>`, streamBuf),
    pdfObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
    pdfObject(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
    pdfObject(
      7,
      `<< /Type /XObject /Subtype /Image /Width ${LOGO.widthPx} /Height ${LOGO.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${LOGO.bytes.length} >>`,
      LOGO.bytes
    ),
  ];
  photos.forEach((photo, index) => {
    objects.push(
      pdfObject(
        8 + index,
        `<< /Type /XObject /Subtype /Image /Width ${photo.width} /Height ${photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${photo.filter || "DCTDecode"} /Length ${photo.bytes.length} >>`,
        photo.bytes
      )
    );
  });

  const header = Buffer.from("%PDF-1.4\n", "utf8");
  const chunks = [header];
  const xref = [0];
  let offset = header.length;
  objects.forEach((obj) => {
    xref.push(offset);
    chunks.push(obj);
    offset += obj.length;
  });

  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  xref.slice(1).forEach((pos) => {
    xrefTable += `${String(pos).padStart(10, "0")} 00000 n \n`;
  });
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefTable, "utf8"), Buffer.from(trailer, "utf8"));
  return Buffer.concat(chunks);
}

function buildCreditNoteStream({ receipt = {}, job = {}, refund = {}, creditNote = {} }) {
  const lines = [];
  const add = (text) => lines.push(text);
  const fill = (r, g, b) => add(`${r} ${g} ${b} rg`);
  const navy = () => fill(NAVY.r, NAVY.g, NAVY.b);
  const rect = (x, y, w, h) => add(`${x} ${y} ${w} ${h} re f`);
  const textAt = (font, size, x, y, value) => {
    add(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(value)}) Tj ET`);
  };
  const textRight = (font, size, rightX, y, value) => {
    textAt(font, size, rightX - stringWidth(value, size, font), y, value);
  };
  const customer = customerIdentity(job);
  const amount = Number(creditNote.amount ?? refund.amount) || 0;

  navy();
  rect(0, 832, 595, 10);
  add("q");
  add(`${LOGO.drawWidth} 0 0 ${LOGO.drawHeight} ${LAYOUT.left} 770 cm`);
  add("/Im1 Do");
  add("Q");
  navy();
  textRight("F2", 14, LAYOUT.right, 806, "CREDIT NOTE");
  fill(0.35, 0.4, 0.44);
  textRight("F1", 9, LAYOUT.right, 788, String(creditNote.number || refund.credit_note_number || ""));
  textRight("F1", 9, LAYOUT.right, 774, formatQatarWhen(creditNote.issued_at || refund.completed_at));
  textAt("F1", 8, LAYOUT.left, 756, `${BRAND.legalName}  |  ${BRAND.city}, ${BRAND.country}  |  Tel ${BRAND.support}`);
  navy();
  rect(LAYOUT.left, 748, LAYOUT.width, 1.2);

  let y = 726;
  const rows = kvPairs([
    ["Against receipt", receiptNumber(receipt, job)],
    ["Job", jobRef(job, receipt)],
    ["Customer", customer.name],
    ["Mobile", customer.mobile],
    ["Reason", clip(refund.reason || creditNote.reason || "", 60)],
    ["Refund ref", refund.provider_refund_id || refund.manual_reference || ""],
  ]);
  rows.forEach(([label, value]) => {
    fill(0.45, 0.5, 0.53);
    textAt("F1", 9, LAYOUT.left, y, label);
    fill(0.08, 0.12, 0.16);
    textAt("F1", 9, LAYOUT.left + 100, y, clip(value, 60));
    y -= 16;
  });
  y -= 10;
  navy();
  rect(LAYOUT.left, y - 6, LAYOUT.width, 24);
  fill(1, 1, 1);
  textAt("F2", 10, LAYOUT.desc, y + 2, "AMOUNT CREDITED");
  textRight("F2", 10, LAYOUT.amtRight, y + 2, `-QAR ${money(amount)}`);
  y -= 30;
  fill(0.32, 0.36, 0.4);
  textAt("F1", 8, LAYOUT.left, y, clip(`Amount in words: ${moneyWords(amount)}`, 92));
  y -= 14;
  textAt("F1", 8, LAYOUT.left, y, `Original total QAR ${money(receipt.total_amount)}.`);
  navy();
  rect(0, 0, 595, 10);
  return lines.join("\n");
}

/** Credit note PDF for a refund against a job receipt. */
async function buildCreditNotePdf({ receipt, job, refund, creditNote } = {}) {
  return assemblePdf(
    buildCreditNoteStream({
      receipt: receipt || {},
      job: job || {},
      refund: refund || {},
      creditNote: creditNote || {},
    }),
    []
  );
}

async function buildReceiptPdf({ receipt, job, repairs, photos } = {}) {
  const rows = resolveRepairs(receipt || {}, repairs);
  const images = Array.isArray(photos) ? photos : await fetchRepairReceiptImages(rows);
  return assemblePdf(
    buildContentStream({
      receipt: receipt || {},
      job: job || {},
      repairs,
      photos: images,
    }),
    images
  );
}

module.exports = {
  BRAND,
  LOGO_DATA_URI,
  buildReceiptPdf,
  buildCreditNotePdf,
  buildLineItems,
  customerIdentity,
  receiptNumber,
  receiptFilename,
  formatQatarWhen,
  moneyWords,
};
