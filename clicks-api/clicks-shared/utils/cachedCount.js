/**
 * In-process count cache for display-only dashboard/list totals.
 * Slight cross-instance drift is acceptable for dashboard badge numbers.
 */
const cache = new Map();

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

async function cachedCount(model, query = {}, { ttlMs = 30000, key } = {}) {
  const cacheKey = stableKey(model, query, key);
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await model.countDocuments(query);
  if (cache.size >= MAX_ENTRIES) {
    evict(now);
  }
  cache.set(cacheKey, { value, expiresAt: now + ttlMs });
  return value;
}

function clearCountCache() {
  cache.clear();
}

module.exports = { cachedCount, clearCountCache, stableKey };
