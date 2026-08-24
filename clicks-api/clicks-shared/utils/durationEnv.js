/**
 * NaN-safe duration env parsing.
 *
 * `Number(process.env.X || fallback)` has two failure modes that both fail
 * silently and dangerously:
 *
 *   1. A non-numeric value ("60s", "true", a stray quote) yields NaN, and every
 *      comparison against NaN is false. For the location staleness windows that
 *      meant `age >= NaN` never fired, marking the ENTIRE fleet permanently
 *      fresh — the exact condition the staleness system exists to detect.
 *   2. "0" is falsy, so `X || fallback` silently substitutes the fallback
 *      instead of honouring an explicit zero.
 *
 * This returns the fallback for anything that is not a finite positive number,
 * and says so loudly, because a misconfigured duration is a real incident.
 *
 * @param {string} name  environment variable name
 * @param {number} fallback  used when unset or invalid
 * @returns {number}
 */
function durationEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "invalid_duration_env",
        env: name,
        value: String(raw),
        using: fallback,
      })
    );
    return fallback;
  }

  return parsed;
}

module.exports = { durationEnv };
