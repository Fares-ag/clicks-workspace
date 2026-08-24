/** Qatar is UTC+3 year-round (no DST). */
const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Hour-of-day (0-23) in Qatar local time, or null for an unusable date.
 * @param {Date|string|number} value
 * @returns {number | null}
 */
function qatarLocalHour(value) {
  const d = new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + QATAR_UTC_OFFSET_MS).getUTCHours();
}

/**
 * Shared job pricing — customer total, parts cost, profit.
 * NOTE: `distance_km` is not written by any current code path, so distanceFee
 * is 0 until dispatch starts recording a distance. The key stays in the
 * response because mobile clients parse it.
 * @param {{ price?: number, distance_km?: number, dateTime?: Date|string }} job
 * @param {Array<{ price?: number, cost?: number, quantity?: number }>} repairs
 */
function computeJobPricing(job, repairs) {
  const basePrice = job?.price || 0;
  const distanceKm = Number(job?.distance_km);
  const distanceFee =
    Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm * 2 : 0;
  const timeFee = 0;
  const list = Array.isArray(repairs) ? repairs : [];
  const repairsTotal = list.reduce(
    (sum, r) => sum + (r.price || 0) * (r.quantity || 1),
    0
  );
  const costTotal = list.reduce(
    (sum, r) => sum + (Number(r.cost) || 0) * (r.quantity || 1),
    0
  );
  const total = basePrice + distanceFee + timeFee + repairsTotal;
  const profit = total - costTotal;
  return {
    total,
    basePrice,
    distanceFee,
    timeFee,
    repairsTotal,
    costTotal,
    profit,
    serviceCharge: distanceFee + timeFee,
  };
}

module.exports = { computeJobPricing, qatarLocalHour };
