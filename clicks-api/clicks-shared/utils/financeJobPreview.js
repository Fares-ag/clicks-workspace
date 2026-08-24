const { computeJobPricing } = require("./jobPricing");

/**
 * Finance preview: revenue from customer total, costs from repairs + extras + purchases.
 * @param {object} job
 * @param {Array} repairs
 * @param {Array<{ label?: string, amount?: number }>} extraCosts
 * @param {Array<{ total_cost?: number, quantity?: number, unit_cost?: number, is_void?: boolean }>} purchases
 */
function computeFinancePreview(job, repairs, extraCosts = [], purchases = []) {
  const pricing = computeJobPricing(job, repairs);
  const extraTotal = (Array.isArray(extraCosts) ? extraCosts : []).reduce(
    (sum, row) => sum + (Number(row?.amount) || 0),
    0
  );
  const purchaseTotal = (Array.isArray(purchases) ? purchases : [])
    .filter((row) => row && row.is_void !== true)
    .reduce((sum, row) => sum + (Number(row?.total_cost) || 0), 0);
  const costTotal = pricing.costTotal + extraTotal + purchaseTotal;
  const revenue = pricing.total;
  const netProfit = revenue - costTotal;
  return {
    revenue,
    costTotal,
    netProfit,
    extraTotal,
    purchaseTotal,
    pricing,
  };
}

module.exports = { computeFinancePreview };
