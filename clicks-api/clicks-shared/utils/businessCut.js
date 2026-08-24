/**
 * The business's share of one job — the single definition used by every
 * earnings figure (business portal analytics, business dashboard, admin
 * business stats), so the same tenant and the same jobs can never produce two
 * contradictory numbers on two screens.
 *
 * Business.cutType is snapshotted onto every job as businessCutType:
 * "revenue" pays a percentage of the customer price, "profit" pays a
 * percentage of the audited net profit. Treating "profit" as a revenue share
 * overpaid by the whole cost of the job.
 *
 * A profit share is only knowable once finance has audited the job, so
 * unaudited jobs contribute 0 rather than silently falling back to price.
 *
 * The aggregation form reads $businessCutType / $finance_status /
 * $finance_net_profit / $price / $businessCutPercent off the raw job document,
 * so it must be used in a stage where those fields are still in scope.
 */
function cutAmountExpr() {
  const cutFraction = { $divide: [{ $ifNull: ["$businessCutPercent", 0] }, 100] };
  return {
    $cond: [
      { $eq: ["$businessCutType", "profit"] },
      {
        $cond: [
          { $eq: ["$finance_status", "audited"] },
          { $multiply: [{ $ifNull: ["$finance_net_profit", 0] }, cutFraction] },
          0,
        ],
      },
      { $multiply: [{ $ifNull: ["$price", 0] }, cutFraction] },
    ],
  };
}

/** JS twin of cutAmountExpr, for the non-aggregate earnings path. */
function cutAmountFor(job) {
  const pct = Number(job?.businessCutPercent) || 0;
  if (job?.businessCutType === "profit") {
    if (job?.finance_status !== "audited") return 0;
    return ((Number(job?.finance_net_profit) || 0) * pct) / 100;
  }
  return ((Number(job?.price) || 0) * pct) / 100;
}

module.exports = { cutAmountExpr, cutAmountFor };
