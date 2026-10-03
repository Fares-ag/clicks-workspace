/**
 * express-rate-limit Store backed by the shared Redis client.
 *
 * Soft launch (REDIS_URL unset): createRateLimitStore() returns undefined and
 * callers omit `store`, so express-rate-limit keeps its in-process MemoryStore.
 * Growth: INCR + PEXPIRE so every API instance shares the same window.
 *
 * Keys: clicks:{admin|tech}:rl:{name}:{ip}
 */
const { getRedisClient, isRedisConfigured } = require("./redisClient");

const REDIS_OP_TIMEOUT_MS = 1000;

const INCREMENT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if tonumber(n) == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {n, ttl}
`;

function serviceSlug() {
  const name = String(process.env.SERVICE_NAME || "");
  if (name.includes("admin")) return "admin";
  if (name.includes("tech") || name.includes("customer")) return "tech";
  return "api";
}

function rateLimitPrefix(name) {
  return `clicks:${serviceSlug()}:rl:${name}:`;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function redisEval(redisClient, keys, args) {
  return withTimeout(
    redisClient.eval(INCREMENT_SCRIPT, {
      keys,
      arguments: args.map(String),
    }),
    REDIS_OP_TIMEOUT_MS,
    "redis rate-limit timeout"
  );
}

class RedisRateLimitStore {
  /**
   * @param {{ name: string, windowMs: number }} opts
   */
  constructor({ name, windowMs }) {
    this.prefix = rateLimitPrefix(name);
    this.windowMs = windowMs;
    this.localKeys = false;
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const redisClient = await getRedisClient({ required: true });
    const result = await redisEval(redisClient, [key], [this.windowMs]);
    const totalHits = Number(result[0]);
    const pttl = Number(result[1]);
    return {
      totalHits,
      resetTime: new Date(Date.now() + Math.max(pttl, 0)),
    };
  }

  async decrement(key) {
    const redisClient = await getRedisClient({ required: true });
    await withTimeout(
      redisClient.decr(key),
      REDIS_OP_TIMEOUT_MS,
      "redis rate-limit timeout"
    );
  }

  async resetKey(key) {
    const redisClient = await getRedisClient({ required: true });
    await withTimeout(
      redisClient.del(key),
      REDIS_OP_TIMEOUT_MS,
      "redis rate-limit timeout"
    );
  }

  async get(key) {
    const redisClient = await getRedisClient({ required: true });
    const raw = await withTimeout(
      redisClient.get(key),
      REDIS_OP_TIMEOUT_MS,
      "redis rate-limit timeout"
    );
    if (raw == null || raw === "") return undefined;
    const pttl = Number(
      await withTimeout(
        redisClient.pTTL(key),
        REDIS_OP_TIMEOUT_MS,
        "redis rate-limit timeout"
      )
    );
    return {
      totalHits: Number(raw),
      resetTime: new Date(Date.now() + Math.max(pttl, 0)),
    };
  }
}

function createRateLimitStore(name, windowMs) {
  if (!isRedisConfigured()) return undefined;
  return new RedisRateLimitStore({ name, windowMs });
}

/**
 * Merge a Redis store + clicks key prefix into express-rate-limit options
 * when REDIS_URL is set. No-op for soft launch.
 */
function withRedisStore(name, config) {
  const store = createRateLimitStore(name, config.windowMs);
  if (!store) return config;
  return {
    ...config,
    prefix: store.prefix,
    store,
  };
}

module.exports = {
  RedisRateLimitStore,
  createRateLimitStore,
  withRedisStore,
  rateLimitPrefix,
  serviceSlug,
};
