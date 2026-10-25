const { QATAR_AREAS, UNMAPPED_AREA } = require("../../constants/qatarAreas");
const { parseJobLocation } = require("../parseJobLocation");
const { compactLatin, compactArabic, hasArabicScript, normalizeLatin } = require("./text");

function pointInBbox(lat, lng, bbox) {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

function areaFromCoords(lat, lng) {
  for (const area of QATAR_AREAS) {
    if (pointInBbox(lat, lng, area.bbox)) {
      return area;
    }
  }
  return null;
}

function areaFromText(location, extraAliases = []) {
  const raw = String(location || "").trim();
  if (!raw) return null;
  const latin = compactLatin(raw);
  const arabic = compactArabic(raw);

  const rows = extraAliases.length
    ? [
        ...QATAR_AREAS,
        ...extraAliases
          .filter((a) => a.areaId)
          .map((a) => ({
            id: a.areaId,
            label: a.areaId,
            aliases: [a.alias],
          })),
      ]
    : QATAR_AREAS;

  for (const area of rows) {
    for (const alias of area.aliases || []) {
      if (hasArabicScript(alias)) {
        const compact = compactArabic(alias);
        if (
          compact &&
          arabic &&
          (arabic.includes(compact) || (compact.length >= 3 && compact.includes(arabic)))
        ) {
          return area;
        }
      } else {
        const compact = compactLatin(alias);
        if (
          compact &&
          latin &&
          (latin.includes(compact) || (compact.length >= 4 && compact.includes(latin)))
        ) {
          return area;
        }
      }
    }
    if (latin && compactLatin(area.label) && latin.includes(compactLatin(area.label))) {
      return area;
    }
  }
  return null;
}

function coordsFromJob(location, coordinates) {
  const geo = coordinates?.coordinates;
  if (Array.isArray(geo) && geo.length >= 2) {
    const lng = Number(geo[0]);
    const lat = Number(geo[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return parseJobLocation(location);
}

function normalizeLocationArea(location, coordinates, extraAliases = []) {
  const rawLocation = String(location || "").trim();
  const parsed = coordsFromJob(location, coordinates);
  const hasCoords = Boolean(parsed);

  if (parsed) {
    const area = areaFromCoords(parsed.lat, parsed.lng);
    if (area) {
      return {
        areaId: area.id,
        areaLabel: area.label,
        hasCoords: true,
        method: "coords",
        rawLocation,
      };
    }
  }

  const named = areaFromText(rawLocation, extraAliases);
  if (named) {
    return {
      areaId: named.id,
      areaLabel: named.label,
      hasCoords,
      method: hasCoords ? "name" : "name",
      rawLocation,
    };
  }

  return {
    areaId: UNMAPPED_AREA.id,
    areaLabel: UNMAPPED_AREA.label,
    hasCoords,
    method: "unmatched",
    rawLocation,
  };
}

function normalizeLocationKey(location) {
  return normalizeLatin(location).slice(0, 80);
}

module.exports = {
  normalizeLocationArea,
  normalizeLocationKey,
};
