/**
 * Shared job pricing — customer total, parts cost, profit.
 * @param {{ price?: number, distance_km?: number, dateTime?: Date|string }} job
 * @param {Array<{ price?: number, cost?: number, quantity?: number }>} repairs
 */
function computeJobPricing(job, repairs) {
  const basePrice = job?.price || 0;
  const distanceFee = job?.distance_km ? job.distance_km * 2 : 0;
  const timeFee =
    job?.dateTime && new Date(job.dateTime).getUTCHours() >= 20 ? 20 : 0;
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

module.exports = { computeJobPricing };
