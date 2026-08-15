#!/usr/bin/env node
/**
 * Regression test for the unauthenticated account-takeover hole (audit P0-1).
 *
 *   node scripts/test-otp-verify.js
 *
 * No test framework, no database, no network — it exercises
 * clicks-shared/utils/otpVerify.js against a mock model and asserts that the
 * user-supplied code never reaches the query filter.
 *
 * Wire this into CI. If it ever fails, someone has reintroduced the ability
 * to reset any account's password with {"otp": {"$gt": ""}}.
 */
const { findAndVerifyOtp, generateOtp } = require("../clicks-shared/utils/otpVerify");

// Minimal mock of the Mongoose model, recording the filter it receives.
let lastQuery = null;
const store = [];
function makeModel() {
  return {
    findOne(q) {
      lastQuery = JSON.parse(JSON.stringify(q));
      const match = store.find((r) => {
        const phoneOk = typeof q.phone === "object" && q.phone.$in
          ? q.phone.$in.includes(r.phone)
          : r.phone === q.phone;
        const verifiedOk = q.verified === undefined || r.verified === q.verified;
        return phoneOk && r.purpose === q.purpose && verifiedOk;
      });
      return { sort: () => Promise.resolve(match || null) };
    },
    deleteOne: async () => {},
    updateOne: async (f, u) => {
      const r = store.find((x) => x._id === f._id);
      if (r && u.$inc && u.$inc.attempts) r.attempts = (r.attempts || 0) + u.$inc.attempts;
    },
  };
}

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? (pass++, console.log("  PASS  " + name)) : (fail++, console.log("  FAIL  " + name)); };

(async () => {
  console.log("=== findAndVerifyOtp: the actual exploit ===");
  store.length = 0;
  store.push({ _id: "1", phone: "+97455512345", otp: "483920", purpose: "password_reset",
               expiresAt: new Date(Date.now() + 6e5), verified: false, attempts: 0 });
  const M = makeModel();

  for (const payload of [{ $gt: "" }, { $ne: null }, { $regex: ".*" }, { $exists: true }]) {
    const r = await findAndVerifyOtp(M, { phone: "+97455512345", otp: payload, purpose: "password_reset" });
    check(`rejects otp=${JSON.stringify(payload)}`, r.ok === false && r.status === 400);
  }

  console.log("\n=== the supplied code never enters the filter ===");
  await findAndVerifyOtp(M, { phone: "+97455512345", otp: "000000", purpose: "password_reset" });
  check("filter has no `otp` key", !("otp" in lastQuery));
  check("filter is exactly {phone, purpose}", JSON.stringify(Object.keys(lastQuery).sort()) === '["phone","purpose"]');

  console.log("\n=== correct code still works ===");
  store[0].attempts = 0;
  const good = await findAndVerifyOtp(M, { phone: "+97455512345", otp: "483920", purpose: "password_reset" });
  check("accepts the real code", good.ok === true && good.record._id === "1");

  console.log("\n=== brute force is capped ===");
  store[0].attempts = 0;
  let last;
  for (let i = 0; i < 6; i++) last = await findAndVerifyOtp(M, { phone: "+97455512345", otp: "111111", purpose: "password_reset" });
  check("429 after 5 wrong attempts", last.status === 429);

  console.log("\n=== multi-format phone lookup preserved (technician flow) ===");
  store.length = 0;
  store.push({ _id: "2", phone: "97455512345", otp: "222222", purpose: "password_reset",
               expiresAt: new Date(Date.now() + 6e5), verified: false, attempts: 0 });
  const r2 = await findAndVerifyOtp(M, { phones: ["+97455512345", "97455512345", "55512345"], otp: "222222", purpose: "password_reset" });
  check("matches a number stored in a different format", r2.ok === true);
  check("$in filter used, still no otp key", !!lastQuery.phone.$in && !("otp" in lastQuery));

  const r3 = await findAndVerifyOtp(M, { phones: [{ $ne: null }, "97455512345"], otp: { $gt: "" }, purpose: "password_reset" });
  check("operator smuggled inside the phones array is stripped", r3.ok === false);

  console.log("\n=== expired code ===");
  store.length = 0;
  store.push({ _id: "3", phone: "+974", otp: "333333", purpose: "password_reset",
               expiresAt: new Date(Date.now() - 1000), verified: false, attempts: 0 });
  const r4 = await findAndVerifyOtp(M, { phone: "+974", otp: "333333", purpose: "password_reset" });
  check("expired code rejected", r4.ok === false);

  console.log("\n=== generateOtp ===");
  const codes = new Set(Array.from({ length: 500 }, generateOtp));
  check("always 6 digits", [...codes].every((c) => /^\d{6}$/.test(c)));
  check("high entropy (>450 unique of 500)", codes.size > 450);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
