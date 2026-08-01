const fs = require("fs");
const path = require("path");
const { matchArabicVehicle } = require("./arabicVehicleAliases");

const DISPLAY_NAMES = {
  "alpha-romeo": "Alfa Romeo",
  "volks-wagen": "Volkswagen",
  "ssang-yong": "SsangYong",
  "li-auto": "Li Auto",
  lynkco: "Lynk & Co",
  "moris-garage": "MG",
  gmc: "GMC",
  bmw: "BMW",
  byd: "BYD",
  ds: "DS",
  gac: "GAC",
  jac: "JAC",
  jmc: "JMC",
  kgm: "KGM",
  kyc: "KYC",
  lml: "LML",
  "m-hero": "M-Hero",
  dfm: "DFM",
  dfsk: "DFSK",
  vgv: "VGV",
  zna: "ZNA",
  tvs: "TVS",
  elwahab: "El Wahab",
  "golden-dragon": "Golden Dragon",
  "great-wall": "Great Wall",
  "harley-davidson": "Harley-Davidson",
  "hashim-bus": "Hashim Bus",
  "honda-wuyang": "Honda Wuyang",
  "land-rover": "Land Rover",
  "aston-martin": "Aston Martin",
};

const MAKE_ALIASES = {
  gelly: "Geely",
  geely: "Geely",
  lexux: "Lexus",
  aude: "Audi",
  porche: "Porsche",
  porsche: "Porsche",
  chevy: "Chevrolet",
  vw: "Volkswagen",
  volks: "Volkswagen",
  "land rover": "Land Rover",
  "range rover": "Land Rover",
  moris: "MG",
  mg: "MG",
};

const LEGACY_TYPO_MAP = {
  mercidece: { make: "Mercedes", model: "" },
  mercedece: { make: "Mercedes", model: "" },
  merceds: { make: "Mercedes", model: "" },
  chaverlot: { make: "Chevrolet", model: "" },
  chevrollet: { make: "Chevrolet", model: "" },
  cheverlot: { make: "Chevrolet", model: "" },
  cheverolet: { make: "Chevrolet", model: "" },
  volks: { make: "Volkswagen", model: "" },
  volkswagon: { make: "Volkswagen", model: "" },
  landcruiser: { make: "Toyota", model: "Land Cruiser" },
  landcruzar: { make: "Toyota", model: "Land Cruiser" },
  "range rover": { make: "Land Rover", model: "Range Rover" },
  rangerover: { make: "Land Rover", model: "Range Rover" },
  patrole: { make: "Nissan", model: "Patrol" },
  patrool: { make: "Nissan", model: "Patrol" },
  expidition: { make: "Ford", model: "Expedition" },
  expediton: { make: "Ford", model: "Expedition" },
  kices: { make: "Nissan", model: "Kicks" },
};

const PHRASE_RULES = [
  { pattern: /^toyota\s+lc$/, make: "Toyota", model: "Land Cruiser" },
  { pattern: /^land\s+c(ruiser|cruirer|c)$/, make: "Toyota", model: "Land Cruiser" },
  { pattern: /^lc$/, make: "Toyota", model: "Land Cruiser" },
  { pattern: /^velar$/, make: "Land Rover", model: "Velar" },
  { pattern: /^patrol(\s+safari)?$/, make: "Nissan", model: "Patrol" },
  { pattern: /^gelly$/, make: "Geely", model: "" },
];

function titleFromSlug(slug) {
  if (DISPLAY_NAMES[slug]) return DISPLAY_NAMES[slug];
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact form for fuzzy compare (no spaces). */
function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function hasArabicScript(value) {
  return /[\u0600-\u06FF]/.test(String(value || ""));
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

/** 0–1 similarity; 1 = identical. */
function similarity(a, b) {
  const left = compactText(a);
  const right = compactText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const dist = levenshtein(left, right);
  return 1 - dist / Math.max(left.length, right.length);
}

function fuzzyThreshold(text) {
  const len = compactText(text).length;
  if (len <= 4) return 0.84;
  if (len <= 7) return 0.72;
  return 0.65;
}

function pickFuzzyBest(scored, query) {
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  const minScore = fuzzyThreshold(query);
  if (best.score < minScore) return null;
  if (second && best.score - second.score < 0.05) return null;
  return best;
}

let catalogIndex = null;

function getCatalogIndex() {
  if (catalogIndex) return catalogIndex;

  const jsonPath = path.join(__dirname, "../../data/hatla2ee-qatar-makes-models.json");
  const catalog = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const makes = [];
  const makeByNormalized = new Map();

  for (const slug of Object.keys(catalog)) {
    const makeName = titleFromSlug(slug);
    const models = (catalog[slug] || [])
      .map((m) => String(m || "").trim())
      .filter((m) => m && m !== "Other");

    makes.push({ slug, makeName, models });

    makeByNormalized.set(normalizeText(makeName), makeName);
    makeByNormalized.set(normalizeText(slug.replace(/-/g, " ")), makeName);
  }

  for (const [alias, makeName] of Object.entries(MAKE_ALIASES)) {
    makeByNormalized.set(alias, makeName);
  }

  makes.sort((a, b) => normalizeText(b.makeName).length - normalizeText(a.makeName).length);

  catalogIndex = { makes, makeByNormalized };
  return catalogIndex;
}

function extractYear(raw) {
  const match = String(raw).match(/\b(19|20)\d{2}\b/);
  if (!match) return { text: raw, year: null };
  const year = Number(match[0]);
  const text = String(raw)
    .replace(/\b(19|20)\d{2}\b/, "")
    .replace(/\s+/g, " ")
    .trim();
  return { text, year };
}

function findMake(normalized) {
  const index = getCatalogIndex();

  for (const { makeName } of index.makes) {
    const makeNorm = normalizeText(makeName);
    if (normalized === makeNorm || normalized.startsWith(`${makeNorm} `)) {
      return {
        makeName,
        remainder: normalized.slice(makeNorm.length).trim(),
      };
    }
  }

  const words = normalized.split(" ").filter(Boolean);
  for (let len = Math.min(3, words.length); len >= 1; len -= 1) {
    const prefix = words.slice(0, len).join(" ");
    const makeName = index.makeByNormalized.get(prefix);
    if (makeName) {
      return {
        makeName,
        remainder: words.slice(len).join(" "),
      };
    }
  }

  return null;
}

function scoreModelMatch(remainderNorm, modelName) {
  const modelNorm = normalizeText(modelName);
  if (!modelNorm || !remainderNorm) return 0;
  if (remainderNorm === modelNorm) return modelNorm.length + 100;
  if (remainderNorm.startsWith(`${modelNorm} `)) return modelNorm.length + 50;
  if (modelNorm.startsWith(remainderNorm) && remainderNorm.length >= 3) {
    return remainderNorm.length + 25;
  }
  if (remainderNorm.includes(modelNorm) && modelNorm.length >= 4) {
    return modelNorm.length;
  }
  return 0;
}

function findModelForMake(makeName, remainderNorm) {
  if (!remainderNorm) return "";
  const index = getCatalogIndex();
  const entry = index.makes.find((m) => m.makeName === makeName);
  if (!entry) return "";

  let bestModel = "";
  let bestScore = 0;
  for (const modelName of entry.models) {
    const score = scoreModelMatch(remainderNorm, modelName);
    if (score > bestScore) {
      bestScore = score;
      bestModel = modelName;
    }
  }
  if (bestModel) return bestModel;

  return fuzzyFindModelForMake(makeName, remainderNorm);
}

function fuzzyFindModelForMake(makeName, remainderNorm) {
  const index = getCatalogIndex();
  const entry = index.makes.find((m) => m.makeName === makeName);
  if (!entry || !remainderNorm) return "";

  const scored = entry.models.map((modelName) => ({
    modelName,
    score: similarity(remainderNorm, modelName),
  }));
  const best = pickFuzzyBest(scored, remainderNorm);
  return best?.modelName || "";
}

function fuzzyFindMake(normalized) {
  const index = getCatalogIndex();
  const scored = index.makes.map(({ makeName }) => ({
    makeName,
    score: similarity(normalized, makeName),
  }));
  const best = pickFuzzyBest(scored, normalized);
  return best?.makeName || null;
}

function fuzzyFindGlobalModel(normalized) {
  const index = getCatalogIndex();
  const scored = [];

  for (const { makeName, models } of index.makes) {
    for (const modelName of models) {
      const modelNorm = normalizeText(modelName);
      if (!modelNorm || modelNorm.length < 3) continue;
      scored.push({
        makeName,
        modelName,
        score: similarity(normalized, modelName),
      });
    }
  }

  const best = pickFuzzyBest(scored, normalized);
  if (!best) return null;
  return { makeName: best.makeName, modelName: best.modelName };
}

function findGlobalModel(normalized) {
  const index = getCatalogIndex();
  let best = null;

  for (const { makeName, models } of index.makes) {
    for (const modelName of models) {
      const modelNorm = normalizeText(modelName);
      if (!modelNorm || modelNorm.length < 3) continue;

      const exact = normalized === modelNorm;
      const contains =
        normalized.includes(modelNorm) ||
        (modelNorm.includes(normalized) && normalized.length >= 4);

      if (!exact && !contains) continue;

      const score = modelNorm.length + (exact ? 100 : 0);
      if (!best || score > best.score) {
        best = { makeName, modelName, score };
      }
    }
  }

  return best;
}

/**
 * @param {string} cmodel - Legacy Excel cmodel field
 * @returns {{ vehicleMake: string, vehicleModel: string, vehicleYear: number|null }}
 */
function matchLegacyVehicleFromCatalog(cmodel) {
  let raw = String(cmodel ?? "").trim();
  if (!raw) {
    return { vehicleMake: "", vehicleModel: "", vehicleYear: null };
  }

  const { text, year: vehicleYear } = extractYear(raw);

  // Arabic legacy entries (must run before Latin normalizeText, which strips Arabic)
  if (hasArabicScript(text)) {
    const arHit = matchArabicVehicle(text);
    if (arHit) {
      return {
        vehicleMake: arHit.make || "",
        vehicleModel: arHit.model || "",
        vehicleYear,
      };
    }
    return { vehicleMake: "", vehicleModel: text, vehicleYear };
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    return { vehicleMake: "", vehicleModel: "", vehicleYear };
  }

  const typoHit = LEGACY_TYPO_MAP[normalized] || LEGACY_TYPO_MAP[compactText(text)];
  if (typoHit) {
    return {
      vehicleMake: typoHit.make,
      vehicleModel: typoHit.model,
      vehicleYear,
    };
  }

  for (const rule of PHRASE_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        vehicleMake: rule.make,
        vehicleModel: rule.model,
        vehicleYear,
      };
    }
  }

  const makeHit = findMake(normalized);
  if (makeHit) {
    const vehicleModel = findModelForMake(makeHit.makeName, makeHit.remainder);
    return {
      vehicleMake: makeHit.makeName,
      vehicleModel: vehicleModel || "",
      vehicleYear,
    };
  }

  const globalHit = findGlobalModel(normalized);
  if (globalHit) {
    return {
      vehicleMake: globalHit.makeName,
      vehicleModel: globalHit.modelName,
      vehicleYear,
    };
  }

  const fuzzyMake = fuzzyFindMake(normalized);
  if (fuzzyMake) {
    return { vehicleMake: fuzzyMake, vehicleModel: "", vehicleYear };
  }

  const fuzzyGlobal = fuzzyFindGlobalModel(normalized);
  if (fuzzyGlobal) {
    return {
      vehicleMake: fuzzyGlobal.makeName,
      vehicleModel: fuzzyGlobal.modelName,
      vehicleYear,
    };
  }

  return { vehicleMake: "", vehicleModel: text, vehicleYear };
}

module.exports = {
  matchLegacyVehicleFromCatalog,
  getCatalogIndex,
  normalizeText,
  similarity,
};
