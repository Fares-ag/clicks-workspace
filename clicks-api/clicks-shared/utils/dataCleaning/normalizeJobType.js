const { JOB_TYPES, jobTypeLabel } = require("../../constants/jobTypes");

const LEGACY_TO_CANONICAL = {
  "Jump start": "Jump Start",
  "Flat tire": "Flat Tire",
  Lockout: "Lock Out",
  "Fuel delivery": "Fuel Delivery",
  "Battery replacement": "Battery Replacement",
  "Accident assistance": "Accident",
  Tires: "Flat Tire",
  Engines: "Mechanical",
  Gearbox: "Gear Box",
  keyless_car_opening: "Lock Out",
  tire_change: "Tire Change",
};

const LEGACY_BUCKETS = new Set(["Tires", "Engines", "Gearbox", "keyless_car_opening", "tire_change"]);

function normalizeJobType(jobType, issueNorm) {
  const raw = String(jobType || "").trim();
  const issueType = issueNorm?.suggestedJobType || "";
  const issueConfidence = Number(issueNorm?.confidence) || 0;

  if (issueType && issueConfidence >= 0.72 && (!raw || LEGACY_BUCKETS.has(raw) || raw !== issueType)) {
    if (!raw || LEGACY_BUCKETS.has(raw)) {
      return {
        canonicalJobType: issueType,
        confidence: issueConfidence,
        method: "issueDerived",
        rawJobType: raw,
      };
    }
  }

  if (!raw) {
    if (issueType && issueConfidence >= 0.72) {
      return {
        canonicalJobType: issueType,
        confidence: issueConfidence,
        method: "issueDerived",
        rawJobType: raw,
      };
    }
    return { canonicalJobType: "", confidence: 0, method: "unmatched", rawJobType: raw };
  }

  if (JOB_TYPES.includes(raw)) {
    return { canonicalJobType: raw, confidence: 1, method: "exact", rawJobType: raw };
  }

  if (LEGACY_TO_CANONICAL[raw]) {
    const mapped = LEGACY_TO_CANONICAL[raw];
    if (raw === "Tires" && issueType === "Tire Change" && issueConfidence >= 0.72) {
      return {
        canonicalJobType: "Tire Change",
        confidence: issueConfidence,
        method: "issueDerived",
        rawJobType: raw,
      };
    }
    return {
      canonicalJobType: mapped,
      confidence: 0.9,
      method: "legacy",
      rawJobType: raw,
    };
  }

  const labeled = jobTypeLabel(raw);
  if (labeled && JOB_TYPES.includes(labeled)) {
    return { canonicalJobType: labeled, confidence: 0.85, method: "legacy", rawJobType: raw };
  }

  return { canonicalJobType: raw, confidence: 0.4, method: "passthrough", rawJobType: raw };
}

module.exports = {
  normalizeJobType,
  LEGACY_TO_CANONICAL,
};
