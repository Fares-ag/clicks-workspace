const {
  RedisRateLimitStore,
  createRateLimitStore,
  withRedisStore,
  rateLimitPrefix,
} = require("../../clicks-shared/utils/redisRateLimitStore");
const {
  setRedisClientForTests,
  resetRedisClientForTests,
} = require("../../clicks-shared/utils/redisClient");

function createMemoryRedis() {
  const data = new Map();
  return {
    isOpen: true,
    data,
    async eval(_script, { keys, arguments: args }) {
      const key = keys[0];
      const windowMs = Number(args[0]);
      const row = data.get(key);
      const now = Date.now();
      if (row && row.expiresAt <= now) data.delete(key);
      const current = data.get(key);
      const n = (current ? current.value : 0) + 1;
      const expiresAt = current ? current.expiresAt : now + windowMs;
      data.set(key, { value: n, expiresAt });
      return [n, Math.max(expiresAt - now, 0)];
    },
    async decr(key) {
      const row = data.get(key);
      if (!row) return -1;
      row.value -= 1;
      return row.value;
    },
    async del(key) {
      data.delete(key);
      return 1;
    },
    async get(key) {
      const row = data.get(key);
      if (!row) return null;
      if (row.expiresAt <= Date.now()) {
        data.delete(key);
        return null;
      }
      return String(row.value);
    },
    async pTTL(key) {
      const row = data.get(key);
      if (!row) return -2;
      return Math.max(row.expiresAt - Date.now(), 0);
    },
  };
}

describe("redisRateLimitStore", () => {
  const prevService = process.env.SERVICE_NAME;

  beforeEach(() => {
    process.env.SERVICE_NAME = "clicks-admin-api";
    resetRedisClientForTests();
  });

  afterEach(() => {
    resetRedisClientForTests();
    if (prevService === undefined) delete process.env.SERVICE_NAME;
    else process.env.SERVICE_NAME = prevService;
  });

  test("createRateLimitStore is a no-op when REDIS_URL is unset", () => {
    expect(createRateLimitStore("auth", 1000)).toBeUndefined();
    const config = { windowMs: 1000, max: 10 };
    expect(withRedisStore("auth", config)).toBe(config);
  });

  test("keys are namespaced by service and limiter name", () => {
    expect(rateLimitPrefix("auth")).toBe("clicks:admin:rl:auth:");
  });

  test("INCR is atomic across two logical instances sharing Redis", async () => {
    const redis = createMemoryRedis();
    setRedisClientForTests(redis);
    const a = new RedisRateLimitStore({ name: "auth", windowMs: 60000 });
    const b = new RedisRateLimitStore({ name: "auth", windowMs: 60000 });

    const first = await a.increment("1.1.1.1");
    const second = await b.increment("1.1.1.1");

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime).toBeInstanceOf(Date);
  });

  test("distinct IPs do not share a counter", async () => {
    const redis = createMemoryRedis();
    setRedisClientForTests(redis);
    const store = new RedisRateLimitStore({ name: "auth", windowMs: 60000 });

    const a = await store.increment("10.0.0.1");
    const b = await store.increment("10.0.0.2");

    expect(a.totalHits).toBe(1);
    expect(b.totalHits).toBe(1);
  });

  test("resetKey clears the window", async () => {
    const redis = createMemoryRedis();
    setRedisClientForTests(redis);
    const store = new RedisRateLimitStore({ name: "otp", windowMs: 60000 });

    await store.increment("9.9.9.9");
    await store.resetKey("9.9.9.9");
    const again = await store.increment("9.9.9.9");
    expect(again.totalHits).toBe(1);
  });
});
