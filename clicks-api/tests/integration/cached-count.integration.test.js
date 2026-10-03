const {
  cachedCount,
  clearCountCache,
  redisCountKey,
  stableKey,
} = require("../../clicks-shared/utils/cachedCount");
const {
  isRedisConfigured,
  setRedisClientForTests,
  resetRedisClientForTests,
} = require("../../clicks-shared/utils/redisClient");

function createMemoryRedis() {
  const data = new Map();
  return {
    isOpen: true,
    data,
    async get(key) {
      const row = data.get(key);
      if (!row) return null;
      if (row.expiresAt && row.expiresAt <= Date.now()) {
        data.delete(key);
        return null;
      }
      return row.value;
    },
    async set(key, value, options = {}) {
      const px = options.PX || options.px;
      data.set(key, {
        value: String(value),
        expiresAt: px ? Date.now() + px : 0,
      });
      return "OK";
    },
    async ping() {
      return "PONG";
    },
  };
}

describe("cachedCount", () => {
  beforeEach(() => {
    clearCountCache();
    resetRedisClientForTests();
  });

  afterEach(() => {
    clearCountCache();
    resetRedisClientForTests();
  });

  test("distinct queries use distinct cache keys", async () => {
    const calls = [];
    const model = {
      modelName: "TestModel",
      countDocuments(q) {
        calls.push(q);
        return Promise.resolve(q.n === 1 ? 10 : 20);
      },
    };

    const a = await cachedCount(model, { n: 1 }, { ttlMs: 60000 });
    const b = await cachedCount(model, { n: 2 }, { ttlMs: 60000 });
    const a2 = await cachedCount(model, { n: 1 }, { ttlMs: 60000 });

    expect(a).toBe(10);
    expect(b).toBe(20);
    expect(a2).toBe(10);
    expect(calls.length).toBe(2);
  });

  test("TTL expiry triggers a fresh count", async () => {
    let count = 5;
    const model = {
      modelName: "TtlModel",
      countDocuments() {
        count += 1;
        return Promise.resolve(count);
      },
    };

    const first = await cachedCount(model, {}, { ttlMs: 20, key: "x" });
    await new Promise((r) => setTimeout(r, 30));
    const second = await cachedCount(model, {}, { ttlMs: 20, key: "x" });

    expect(first).toBe(6);
    expect(second).toBe(7);
  });

  test("Redis L2 hit skips Mongo on a cold L1", async () => {
    const redis = createMemoryRedis();
    setRedisClientForTests(redis);

    const model = {
      modelName: "Job",
      countDocuments() {
        throw new Error("should not hit Mongo");
      },
    };
    const query = { job_status: "pending" };
    const key = redisCountKey(stableKey(model, query, "jobs_pending"));
    await redis.set(key, "42", { PX: 60000 });

    clearCountCache();
    const value = await cachedCount(model, query, { ttlMs: 60000, key: "jobs_pending" });
    expect(value).toBe(42);
  });

  test("Mongo miss writes through to Redis for other instances", async () => {
    const redis = createMemoryRedis();
    setRedisClientForTests(redis);

    const model = {
      modelName: "Job",
      countDocuments() {
        return Promise.resolve(7);
      },
    };
    const query = { job_status: "pending" };
    await cachedCount(model, query, { ttlMs: 60000, key: "jobs_pending" });

    const key = redisCountKey(stableKey(model, query, "jobs_pending"));
    expect(await redis.get(key)).toBe("7");
  });

  test("Redis errors fall back to Mongo instead of failing the request", async () => {
    setRedisClientForTests({
      isOpen: true,
      async get() {
        throw new Error("redis down");
      },
      async set() {
        throw new Error("redis down");
      },
    });

    const model = {
      modelName: "Job",
      countDocuments() {
        return Promise.resolve(3);
      },
    };
    await expect(cachedCount(model, {}, { ttlMs: 60000, key: "jobs" })).resolves.toBe(3);
  });
});

describe("redisClient", () => {
  test("isRedisConfigured is false when REDIS_URL is unset", () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    expect(isRedisConfigured()).toBe(false);
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });
});
