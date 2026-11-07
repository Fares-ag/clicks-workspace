const os = require("os");
const crypto = require("crypto");
const OpsLease = require("../models/OpsLease");

/** Stable for the life of this process; distinguishes instances and restarts. */
const PROCESS_HOLDER = `${os.hostname()}:${process.pid}:${crypto.randomBytes(4).toString("hex")}`;

/**
 * Take (or renew) a named lease in Mongo. Only one holder can own an unexpired
 * lease, so a sweeper running on several instances runs on exactly one, and a
 * crashed holder's lease frees itself after `ttlMs`.
 *
 * Usage:
 *   const lease = await acquireLease("payment-reconcile", 4 * 60 * 1000);
 *   if (!lease) return;           // another instance has it
 *   try { ...work... } finally { await lease.release(); }
 *
 * @param {string} name
 * @param {number} ttlMs
 * @param {{ holder?: string, now?: Date }} [options]
 * @returns {Promise<null | { name: string, holder: string, expiresAt: Date, renew: (ttlMs?: number) => Promise<boolean>, release: () => Promise<void> }>}
 */
async function acquireLease(name, ttlMs, { holder = PROCESS_HOLDER, now = new Date() } = {}) {
  const key = String(name || "").trim();
  const ttl = Math.max(1000, Number(ttlMs) || 0);
  if (!key) throw new Error("acquireLease requires a name");
  const expiresAt = new Date(now.getTime() + ttl);
  try {
    const doc = await OpsLease.findOneAndUpdate(
      {
        _id: key,
        $or: [{ expires_at: { $lte: now } }, { holder }],
      },
      { $set: { holder, expires_at: expiresAt, acquired_at: now } },
      { upsert: true, new: true }
    );
    if (!doc || doc.holder !== holder) return null;
  } catch (err) {
    // Upsert raced a live lease held by someone else: the filter did not
    // match, the insert collided on _id. That is "not acquired", not a fault.
    if (err && err.code === 11000) return null;
    throw err;
  }

  const lease = {
    name: key,
    holder,
    expiresAt,
    async renew(nextTtlMs = ttl) {
      const until = new Date(Date.now() + Math.max(1000, Number(nextTtlMs) || ttl));
      const res = await OpsLease.updateOne(
        { _id: key, holder },
        { $set: { expires_at: until } }
      );
      if (res.matchedCount === 1) lease.expiresAt = until;
      return res.matchedCount === 1;
    },
    async release() {
      try {
        await OpsLease.deleteOne({ _id: key, holder });
      } catch (err) {
        console.error(`[opsLease] release ${key} failed:`, err.message);
      }
    },
  };
  return lease;
}

/**
 * Run `fn` only if the lease can be taken; release afterwards.
 * Returns { ran: false } when another holder owns it.
 */
async function withLease(name, ttlMs, fn, options) {
  const lease = await acquireLease(name, ttlMs, options);
  if (!lease) return { ran: false };
  try {
    const result = await fn(lease);
    return { ran: true, result };
  } finally {
    await lease.release();
  }
}

module.exports = {
  acquireLease,
  withLease,
  PROCESS_HOLDER,
};
