/**
 * Short-TTL JSON payload cache (dashboard summaries, tech dashboard, charts).
 *
 * Soft launch (REDIS_URL unset): in-process Map.
 * Growth: L1 Map + L2 Redis. Redis errors fall back to L1/compute.
 *
 * Stale-while-revalidate: after ttlMs the previous value is still served
 * immediately and a single background recompute fills the next window.
 */
const { getRedisClient } = require("./redisClient");

const cache = new Map();
const missInflight = new Map();
const refreshInflight = new Set();
const MAX_ENTRIES = 200;
const REDIS_OP_TIMEOUT_MS = 1000;
const WRAP_VERSION = 1;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function staleWindowMs(ttlMs) {
  return Math.max(ttlMs * 5, 120000);
}

function evict(now) {
  for (const [k, v] of cache) {
    if (v.staleUntil <= now) cache.delete(k);
  }
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function setMemory(key, value, ttlMs, now) {
  if (cache.size >= MAX_ENTRIES) evict(now);
  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
    staleUntil: now + staleWindowMs(ttlMs),
  });
}

function unwrapRedis(parsed) {
  if (parsed && parsed.v === WRAP_VERSION && Object.prototype.hasOwnProperty.call(parsed, "value")) {
    return parsed;
  }
  return { v: 0, freshUntil: Date.now() + 1000, value: parsed };
}

async function readRedisPayload(key) {
  const redisClient = await getRedisClient();
  if (!redisClient || redisClient.isOpen === false) return null;
  try {
    const raw = await withTimeout(
      redisClient.get(key),
      REDIS_OP_TIMEOUT_MS,
      "redis payload get timeout"
    );
    if (raw == null || raw === "") return null;
    return unwrapRedis(JSON.parse(raw));
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_payload_get_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return null;
  }
}

async function writeRedisPayload(key, value, ttlMs) {
  const redisClient = await getRedisClient();
  if (!redisClient || redisClient.isOpen === false) return;
  try {
    const wrapped = {
      v: WRAP_VERSION,
      freshUntil: Date.now() + ttlMs,
      value,
    };
    await withTimeout(
      redisClient.set(key, JSON.stringify(wrapped), { PX: staleWindowMs(ttlMs) }),
      REDIS_OP_TIMEOUT_MS,
      "redis payload set timeout"
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_payload_set_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

async function computeAndStore(key, ttlMs, compute) {
  const value = await compute();
  const now = Date.now();
  setMemory(key, value, ttlMs, now);
  await writeRedisPayload(key, value, ttlMs);
  return value;
}

function scheduleRefresh(key, ttlMs, compute) {
  if (refreshInflight.has(key)) return;
  refreshInflight.add(key);
  computeAndStore(key, ttlMs, compute)
    .catch((err) => {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "payload_cache_refresh_failed",
          error: err instanceof Error ? err.message : String(err),
        })
      );
    })
    .finally(() => {
      refreshInflight.delete(key);
    });
}

async function getCachedPayload(key, ttlMs, compute) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  if (hit && hit.staleUntil > now) {
    scheduleRefresh(key, ttlMs, compute);
    return hit.value;
  }

  if (missInflight.has(key)) return missInflight.get(key);

  const pending = (async () => {
    const redisEntry = await readRedisPayload(key);
    if (redisEntry != null) {
      const redisNow = Date.now();
      const fresh = redisEntry.freshUntil > redisNow;
      setMemory(key, redisEntry.value, fresh ? ttlMs : 0, redisNow);
      if (!fresh) scheduleRefresh(key, ttlMs, compute);
      return redisEntry.value;
    }
    return computeAndStore(key, ttlMs, compute);
  })().finally(() => {
    if (missInflight.get(key) === pending) missInflight.delete(key);
  });

  missInflight.set(key, pending);
  return pending;
}

function clearPayloadCache() {
  cache.clear();
  missInflight.clear();
  refreshInflight.clear();
}

async function deletePayloadCacheKey(key) {
  cache.delete(key);
  missInflight.delete(key);
  refreshInflight.delete(key);
  const redisClient = await getRedisClient();
  if (!redisClient || redisClient.isOpen === false) return;
  try {
    await withTimeout(
      redisClient.del(key),
      REDIS_OP_TIMEOUT_MS,
      "redis payload del timeout"
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_payload_del_failed",
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

module.exports = { getCachedPayload, clearPayloadCache, deletePayloadCacheKey };
