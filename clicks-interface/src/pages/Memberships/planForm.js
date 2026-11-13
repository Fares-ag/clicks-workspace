/**
 * Membership package editor: API plan <-> form state, and the same checks
 * the admin API runs (so most mistakes show before saving). The server stays
 * the authority; its message is shown when it refuses.
 */

export const INTERVALS = [
  { key: "month", label: "Monthly", defaultMonths: 1 },
  { key: "year", label: "Yearly", defaultMonths: 12 },
];

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

let rowSeq = 0;
const rowId = () => `row-${(rowSeq += 1)}`;

export function emptyIncluded() {
  return { id: rowId(), serviceTypes: [], quota: "1", bucket: "" };
}

function intervalForm(plan, key, defaultMonths) {
  const row = (plan?.intervals || []).find((r) => r.interval === key);
  return {
    enabled: Boolean(row),
    priceQar: row ? String(row.priceQar ?? "") : "",
    durationMonths: String(row?.durationMonths ?? defaultMonths),
    included: (row?.included || []).map((inc) => ({
      id: rowId(),
      serviceTypes: [...(inc.serviceTypes || [])],
      quota: String(inc.quota ?? 1),
      bucket: inc.bucket || "",
    })),
  };
}

/** A plan from the API (or null for a new one) -> editable form state. */
export function planToForm(plan, meta, nextSortOrder = 0) {
  const intervals = {};
  for (const { key, defaultMonths } of INTERVALS) {
    intervals[key] = intervalForm(plan, key, defaultMonths);
  }
  if (!plan) intervals.month.enabled = true;
  return {
    code: plan?.code || "",
    name_en: plan?.name_en || "",
    name_ar: plan?.name_ar || "",
    discountPercent: String(plan?.discountPercent ?? 10),
    eligibleServiceTypes: plan
      ? [...(plan.eligibleServiceTypes || [])]
      : [...(meta?.defaultDiscountServiceTypes || [])],
    coversEmergency: plan?.coversEmergency === true,
    active: plan ? plan.active !== false : true,
    sortOrder: String(plan?.sortOrder ?? nextSortOrder),
    intervals,
  };
}

/** Form state -> request body for POST / PATCH /api/subscription-plans. */
export function formToPayload(form) {
  return {
    code: form.code.trim().toLowerCase(),
    name_en: form.name_en.trim(),
    name_ar: form.name_ar.trim(),
    discountPercent: Number(form.discountPercent),
    eligibleServiceTypes: [...form.eligibleServiceTypes],
    coversEmergency: form.coversEmergency,
    active: form.active,
    sortOrder: Number(form.sortOrder) || 0,
    intervals: INTERVALS.filter(({ key }) => form.intervals[key].enabled).map(({ key }) => {
      const row = form.intervals[key];
      return {
        interval: key,
        durationMonths: Number(row.durationMonths),
        priceQar: Number(row.priceQar),
        included: row.included.map((inc) => ({
          serviceTypes: [...inc.serviceTypes],
          quota: Number(inc.quota),
          bucket: inc.bucket.trim(),
        })),
      };
    }),
  };
}

/** Same rules as the admin API's planProblems(). Returns readable messages. */
export function validatePlanForm(form, limits = {}) {
  const maxPrice = limits.maxPriceQar || 100000;
  const maxQuota = limits.maxQuota || 1000;
  const maxMonths = limits.maxDurationMonths || 60;
  const p = formToPayload(form);
  const errors = [];
  if (!CODE_RE.test(p.code)) {
    errors.push("Code must be 2-32 lowercase letters, digits or dashes (e.g. plus, gold-2026)");
  }
  if (!p.name_en) errors.push("English name is required");
  if (!Number.isFinite(p.discountPercent) || p.discountPercent < 0 || p.discountPercent > 100) {
    errors.push("Discount must be between 0 and 100%");
  }
  for (const row of p.intervals) {
    const label = row.interval === "year" ? "Yearly" : "Monthly";
    if (!Number.isInteger(row.durationMonths) || row.durationMonths < 1 || row.durationMonths > maxMonths) {
      errors.push(`${label}: duration must be a whole number of months, 1-${maxMonths}`);
    }
    if (!Number.isFinite(row.priceQar) || row.priceQar <= 0 || row.priceQar > maxPrice) {
      errors.push(`${label}: price must be more than 0 QAR (checkout cannot collect 0)`);
    }
    const buckets = new Set();
    for (const inc of row.included) {
      if (!inc.serviceTypes.length) errors.push(`${label}: every included item needs at least one service`);
      if (!Number.isInteger(inc.quota) || inc.quota < 1 || inc.quota > maxQuota) {
        errors.push(`${label}: included quantity must be a whole number, 1-${maxQuota}`);
      }
      const key = inc.bucket || inc.serviceTypes[0] || "";
      if (key && buckets.has(key)) {
        errors.push(`${label}: two included items share the counter "${key}"; give each its own`);
      }
      buckets.add(key);
    }
  }
  if (p.active && !p.intervals.length) {
    errors.push("An active plan needs at least one billing option (monthly or yearly)");
  }
  return [...new Set(errors)];
}

/** Every service name worth offering: the catalog's plus any already on the plan. */
export function serviceOptions(meta, form) {
  const names = new Set(meta?.serviceTypes || []);
  for (const t of form?.eligibleServiceTypes || []) names.add(t);
  for (const { key } of INTERVALS) {
    for (const inc of form?.intervals?.[key]?.included || []) {
      for (const t of inc.serviceTypes) names.add(t);
    }
  }
  return [...names];
}

/** "Monthly QAR 39 · Yearly QAR 299" for the list. */
export function priceSummary(plan) {
  const parts = INTERVALS.map(({ key, label }) => {
    const row = (plan?.intervals || []).find((r) => r.interval === key);
    return row ? `${label} QAR ${Number(row.priceQar).toFixed(2)}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : "No billing option";
}

/** "2× Car Wash - Full, 4× wash (any of 4)" for one billing option. */
export function includedSummary(row) {
  const items = (row?.included || []).map((inc) => {
    const types = inc.serviceTypes || [];
    if (types.length <= 1) return `${inc.quota}× ${types[0] || "?"}`;
    return `${inc.quota}× ${inc.bucket || types[0]} (any of ${types.length})`;
  });
  return items.length ? items.join(", ") : "Discount only";
}
