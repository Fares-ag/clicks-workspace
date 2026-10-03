const { getCachedPayload, clearPayloadCache } = require("../../clicks-shared/utils/payloadCache");
const {
  setRedisClientForTests,
  resetRedisClientForTests,
} = require("../../clicks-shared/utils/redisClient");

describe("payloadCache", () => {
  beforeEach(() => {
    clearPayloadCache();
    resetRedisClientForTests();
  });

  afterEach(() => {
    clearPayloadCache();
    resetRedisClientForTests();
  });

  test("compute runs once within TTL", async () => {
    let n = 0;
    const a = await getCachedPayload("clicks:test:payload", 60000, async () => {
      n += 1;
      return { n };
    });
    const b = await getCachedPayload("clicks:test:payload", 60000, async () => {
      n += 1;
      return { n };
    });
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(n).toBe(1);
  });

  test("concurrent misses compute once", async () => {
    let n = 0;
    const compute = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          n += 1;
          resolve({ n });
        }, 20);
      });
    const [a, b] = await Promise.all([
      getCachedPayload("clicks:test:payload", 60000, compute),
      getCachedPayload("clicks:test:payload", 60000, compute),
    ]);
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(n).toBe(1);
  });

  test("Redis L2 serves a cold L1", async () => {
    const data = new Map();
    setRedisClientForTests({
      isOpen: true,
      async get(key) {
        return data.get(key) || null;
      },
      async set(key, value) {
        data.set(key, value);
        return "OK";
      },
    });

    await getCachedPayload("clicks:test:payload", 60000, async () => ({ ok: true }));
    clearPayloadCache();
    const again = await getCachedPayload("clicks:test:payload", 60000, async () => {
      throw new Error("should not recompute");
    });
    expect(again).toEqual({ ok: true });
  });
});
