/**
 * Contact Us categories (scenario 100).
 *
 * The app used to store the TRANSLATED label ("Technical Issue" or
 * "مشكلة تقنية"), so the same category had two spellings and admins could not
 * filter. Rows now carry a stable code; `labels` is used to backfill old rows
 * (scripts/backfill-contact-us.js) and to read legacy app builds' payloads.
 */
const CONTACT_US_CATEGORIES = {
  technical_issue: { en: "Technical Issue", ar: "مشكلة تقنية" },
  emergency_requests: { en: "Emergency Service Requests", ar: "طلبات الخدمة الطارئة" },
  technician_dispute: { en: "Technician Dispute", ar: "خلاف مع الفني" },
  general_inquiry: { en: "General Inquiry", ar: "استفسار عام" },
  billing: { en: "Billing & Payments", ar: "الفواتير والدفع" },
  other: { en: "Other", ar: "أخرى" },
};

const CONTACT_US_CATEGORY_CODES = Object.keys(CONTACT_US_CATEGORIES);

const CONTACT_US_STATUSES = ["pending", "in_progress", "resolved", "closed"];

function normalizeLabel(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map a code, an en/ar label, or anything else to a category code. */
function categoryCodeFor(raw) {
  const value = String(raw || "").trim();
  if (CONTACT_US_CATEGORIES[value]) return value;
  const needle = normalizeLabel(value);
  for (const [code, labels] of Object.entries(CONTACT_US_CATEGORIES)) {
    if (normalizeLabel(labels.en) === needle || normalizeLabel(labels.ar) === needle) {
      return code;
    }
  }
  return "other";
}

module.exports = {
  CONTACT_US_CATEGORIES,
  CONTACT_US_CATEGORY_CODES,
  CONTACT_US_STATUSES,
  categoryCodeFor,
};
