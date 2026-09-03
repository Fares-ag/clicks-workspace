/** Hard cap for admin list endpoints (PERFORMANCE.md). */
function capAdminLimit(limit, defaultLimit = 20, max = 100) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(Math.floor(n), max);
}

module.exports = { capAdminLimit };
