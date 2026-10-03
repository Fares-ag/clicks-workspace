/**
 * Count cache for display-only dashboard/list totals.
 *
 * Soft launch (REDIS_URL unset): in-process Map, same as before.
 * Growth (REDIS_URL set): L1 process Map + L2 Redis so admin-api instances
 * share badge totals. Redis errors fall back to L1/Mongo — counts are not
 * a source of truth.
 *
 * Slight cross-instance drift is acceptable for dashboard badge numbers.
 */
const crypto = require("crypto");
const { getRedisClient } = require("./redisClient");

const cache = new Map();
const COUNT_KEY_PREFIX = "clicks:shared:count:";
const REDIS_OP_TIMEOUT_MS = 1000;

/**
 * JSON.stringify serialises a RegExp as "{}", so every prefix search
 * ({ search_phone: /^5551/ }, { search_phone: /^6661/ }, …) would collapse onto
 * one cache entry and hand back another search's total. Serialise the pattern
 * explicitly instead.
 */
function serializeQuery(query) {
  return JSON.stringify(query || {}, (_k, value) =>
    value instanceof RegExp ? `RegExp(${value.toString()})` : value
  );
}

// The query is always part of the key — an explicit key only namespaces it, it
// never replaces it, so a caller-supplied key that fails to distinguish two
// different filters cannot return the wrong count.
function stableKey(model, query, explicitKey) {
  const serialized = serializeQuery(query);
  if (explicitKey) return `${model.modelName}:${explicitKey}:${serialized}`;
  return `${model.modelName}:${serialized}`;
}

function redisCountKey(stable) {
  const digest = crypto.createHash("sha256").update(stable).digest("hex");
  return `${COUNT_KEY_PREFIX}${digest}`;
}

// Keys embed user-supplied search terms, so entries must not accumulate for the
// lifetime of the process. Expired entries are dropped on write and, if the map
// is still at the cap, the oldest inserts go (Map iterates in insertion order).
const MAX_ENTRIES = 500;

function evict(now) {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function setMemory(cacheKey, value, ttlMs, now) {
  if (cache.size >= MAX_ENTRIES) {
    evict(now);
  }
  cache.set(cacheKey, { value, expiresAt: now + ttlMs });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readRedisCount(redisKey) {
  const redisClient = await getRedisClient();
  if (!redisClient) return null;
  if (redisClient.isOpen === false) return null;
  try {
    const raw = await withTimeout(
      redisClient.get(redisKey),
      REDIS_OP_TIMEOUT_MS,
      "redis get timeout"
    );
    if (raw == null || raw === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_count_get_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

async function writeRedisCount(redisKey, value, ttlMs) {
  const redisClient = await getRedisClient();
  if (!redisClient) return;
  if (redisClient.isOpen === false) return;
  try {
    await withTimeout(
      redisClient.set(redisKey, String(value), { PX: ttlMs }),
      REDIS_OP_TIMEOUT_MS,
      "redis set timeout"
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_count_set_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function cachedCount(model, query = {}, { ttlMs = 30000, key } = {}) {
  const cacheKey = stableKey(model, query, key);
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const redisKey = redisCountKey(cacheKey);
  const redisValue = await readRedisCount(redisKey);
  if (redisValue != null) {
    setMemory(cacheKey, redisValue, ttlMs, now);
    return redisValue;
  }

  const value = await model.countDocuments(query);
  setMemory(cacheKey, value, ttlMs, now);
  await writeRedisCount(redisKey, value, ttlMs);
  return value;
}

function clearCountCache() {
  cache.clear();
}

module.exports = { cachedCount, clearCountCache, stableKey, redisCountKey };
