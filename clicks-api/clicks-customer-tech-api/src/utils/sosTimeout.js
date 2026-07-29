/**
 * SOS timing helpers (soft-launch configurable).
 * SOS_BROADCAST_SECONDS — pending broadcast window (default 60)
 * SOS_IN_CALL_TIMEOUT_MINUTES — abandon in_call without job (default 15)
 */

function broadcastSeconds() {
  const n = parseInt(process.env.SOS_BROADCAST_SECONDS || "60", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function broadcastMs() {
  return broadcastSeconds() * 1000;
}

function inCallTimeoutMinutes() {
  const n = parseInt(process.env.SOS_IN_CALL_TIMEOUT_MINUTES || "15", 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function inCallTimeoutMs() {
  return inCallTimeoutMinutes() * 60 * 1000;
}

module.exports = {
  broadcastSeconds,
  broadcastMs,
  inCallTimeoutMinutes,
  inCallTimeoutMs,
};
