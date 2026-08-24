const { cachedCount, clearCountCache } = require("../../clicks-shared/utils/cachedCount");

describe("cachedCount", () => {
  beforeEach(() => {
    clearCountCache();
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
});
