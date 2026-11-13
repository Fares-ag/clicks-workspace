/**
 * High-demand flag for waiting customers. Off until SOS_BUSY_PENDING > 0.
 * Does not block createSOS — dispatchers still get the request.
 */
const SOSRequest = require("../models/SOSRequest");
const { cachedCount } = require("./cachedCount");

function busyPendingThreshold() {
  const n = parseInt(process.env.SOS_BUSY_PENDING || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function isHighDemand() {
  const threshold = busyPendingThreshold();
  if (threshold <= 0) return false;
  try {
    const pending = await cachedCount(
      SOSRequest,
      { status: "pending" },
      { ttlMs: 15000, key: "sos_busy_pending" }
    );
    return pending >= threshold;
  } catch (err) {
    console.error("[sos-busy] pending count failed:", err.message);
    return false;
  }
}

module.exports = { busyPendingThreshold, isHighDemand };
