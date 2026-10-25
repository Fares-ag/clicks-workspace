const {
  matchLegacyVehicleFromCatalog,
  normalizeText,
  similarity,
  hasArabicScript,
  findModelForMake,
  getCatalogIndex,
  isKnownMake,
  isKnownModel,
} = require("../hatla2eeVehicleCatalog");

function looseModelForMake(makeName, remainder) {
  const exact = findModelForMake(makeName, normalizeText(remainder));
  if (exact) return exact;
  const index = getCatalogIndex();
  const entry = index.makes.find((m) => m.makeName === makeName);
  if (!entry || !remainder) return "";
  const scored = entry.models.map((modelName) => ({
    modelName,
    score: similarity(remainder, modelName),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 0.7) return "";
  if (second && best.score - second.score < 0.04) return "";
  return best.modelName;
}

function emptyVehicle(rawMake, rawModel, year) {
  return {
    canonicalMake: "",
    canonicalModel: "",
    canonicalYear: year != null && year !== "" ? Number(year) || null : null,
    confidence: 0,
    method: "unmatched",
    rawMake,
    rawModel,
  };
}

function inferMethod(combined, rawMake, rawModel, hit) {
  if (hasArabicScript(combined)) return "arabic";
  const rawMakeNorm = normalizeText(rawMake);
  const rawModelNorm = normalizeText(rawModel);
  const hitMakeNorm = normalizeText(hit.vehicleMake);
  const hitModelNorm = normalizeText(hit.vehicleModel);
  if (rawMakeNorm && rawMakeNorm === hitMakeNorm && rawModelNorm === hitModelNorm) {
    return "exact";
  }
  if (rawMakeNorm && rawMakeNorm === hitMakeNorm && !rawModelNorm && !hitModelNorm) {
    return "exact";
  }
  if (hitMakeNorm && rawMakeNorm && rawMakeNorm !== hitMakeNorm) return "alias";
  if (hitModelNorm && rawModelNorm && rawModelNorm !== hitModelNorm) return "fuzzy";
  return hit.vehicleModel ? "alias" : "alias";
}

function confidenceFor(method, hit) {
  if (!hit.vehicleMake) return 0;
  if (method === "exact") return hit.vehicleModel ? 1 : 0.92;
  if (method === "arabic") return hit.vehicleModel ? 0.95 : 0.8;
  if (method === "alias") return hit.vehicleModel ? 0.9 : 0.7;
  if (method === "fuzzy") return hit.vehicleModel ? 0.75 : 0.6;
  return 0.5;
}

function normalizeJobVehicle({ make, model, year } = {}) {
  const rawMake = String(make || "").trim();
  const rawModel = String(model || "").trim();
  const combined = `${rawMake} ${rawModel}`.trim();
  const parsedYear =
    year != null && year !== "" ? Number(year) : null;
  const safeYear = Number.isFinite(parsedYear) ? parsedYear : null;

  if (!combined) return emptyVehicle(rawMake, rawModel, safeYear);

  const combinedHit = matchLegacyVehicleFromCatalog(combined);
  const makeHit = rawMake ? matchLegacyVehicleFromCatalog(rawMake) : null;
  const modelHit = rawModel ? matchLegacyVehicleFromCatalog(rawModel) : null;

  const hit = {
    vehicleMake:
      combinedHit.vehicleMake ||
      (makeHit && makeHit.vehicleMake) ||
      (modelHit && modelHit.vehicleMake) ||
      "",
    vehicleModel: combinedHit.vehicleModel || "",
    vehicleYear:
      combinedHit.vehicleYear != null
        ? combinedHit.vehicleYear
        : makeHit?.vehicleYear != null
          ? makeHit.vehicleYear
          : modelHit?.vehicleYear,
  };

  if (hit.vehicleMake && !hit.vehicleModel && rawModel) {
    hit.vehicleModel = looseModelForMake(hit.vehicleMake, rawModel);
  }
  if (
    !hit.vehicleModel &&
    modelHit?.vehicleModel &&
    (!modelHit.vehicleMake || modelHit.vehicleMake === hit.vehicleMake)
  ) {
    hit.vehicleModel = modelHit.vehicleModel;
  }

  const canonicalYear = hit.vehicleYear != null ? hit.vehicleYear : safeYear;

  if (!hit.vehicleMake) {
    return {
      ...emptyVehicle(rawMake, rawModel, canonicalYear),
      canonicalModel: hit.vehicleModel || "",
    };
  }

  const method = inferMethod(combined, rawMake, rawModel, hit);
  return {
    canonicalMake: hit.vehicleMake,
    canonicalModel: hit.vehicleModel || "",
    canonicalYear,
    confidence: confidenceFor(method, hit),
    method,
    rawMake,
    rawModel,
  };
}

function vehicleIsCatalogSafe(make, model) {
  if (!isKnownMake(make)) return false;
  if (model && !isKnownModel(make, model)) return false;
  return true;
}

module.exports = {
  normalizeJobVehicle,
  vehicleIsCatalogSafe,
};
