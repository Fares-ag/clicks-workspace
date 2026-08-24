const COMPLETED = ["completed"];

async function sumCompletedRevenue(Job, matchExtra = {}) {
  const agg = await Job.aggregate([
    { $match: { job_status: { $in: COMPLETED }, ...matchExtra } },
    { $group: { _id: null, total: { $sum: "$price" } } },
  ]);
  return Number(agg[0]?.total) || 0;
}

/** Index: { job_status: 1, paid_at: -1 } */
async function revenueForPaidAtRange(Job, start, end) {
  return sumCompletedRevenue(Job, {
    paid_at: { $gte: start, $lte: end },
  });
}

/** Index: { job_status: 1, completed_at: -1 } — jobs without paid_at */
async function revenueForCompletedAtRange(Job, start, end) {
  return sumCompletedRevenue(Job, {
    paid_at: { $exists: false },
    completed_at: { $gte: start, $lte: end },
  });
}

/** Today/yesterday revenue — two indexed branches summed in JS (same as former $or pipeline). */
async function revenueForDayWindow(Job, start, end) {
  const [paidBranch, completedBranch] = await Promise.all([
    revenueForPaidAtRange(Job, start, end),
    revenueForCompletedAtRange(Job, start, end),
  ]);
  return paidBranch + completedBranch;
}

async function totalCompletedRevenue(Job) {
  return sumCompletedRevenue(Job);
}

module.exports = {
  COMPLETED,
  revenueForDayWindow,
  totalCompletedRevenue,
};
