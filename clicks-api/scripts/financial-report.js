/**
 * Platform-wide financial report — aggregates jobs, repairs, receipts,
 * technician earnings, partners, and business cuts.
 *
 * Usage: node scripts/financial-report.js [--json]
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const {
  Job,
  RepairProcedure,
  Receipt,
  TechnicianEarnings,
  Technician,
  Partner,
  PartnerEarning,
  PartnerWithdrawal,
  Business,
} = require("../clicks-shared/models");
const { computeJobPricing } = require("../clicks-shared/utils/jobPricing");

const QAR = (n) => `QAR ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function groupSum(items, keyFn, valFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    map.set(k, (map.get(k) || 0) + valFn(item));
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const [
    jobs,
    repairs,
    receipts,
    techEarnings,
    technicians,
    partners,
    partnerEarnings,
    partnerWithdrawals,
    businesses,
  ] = await Promise.all([
    Job.find({}).lean(),
    RepairProcedure.find({}).lean(),
    Receipt.find({}).lean(),
    TechnicianEarnings.find({}).populate("technician_id", "firstName lastName").lean(),
    Technician.find({}).select("firstName lastName").lean(),
    Partner.find({}).lean(),
    PartnerEarning.find({}).lean(),
    PartnerWithdrawal.find({}).lean(),
    Business.find({}).lean(),
  ]);

  const repairsByJob = new Map();
  for (const r of repairs) {
    const jid = String(r.job_id);
    if (!repairsByJob.has(jid)) repairsByJob.set(jid, []);
    repairsByJob.get(jid).push(r);
  }

  const receiptByJob = new Map();
  for (const rc of receipts) {
    if (rc.job_id) receiptByJob.set(String(rc.job_id), rc);
  }

  const completed = jobs.filter((j) => j.job_status === "completed");
  const paid = jobs.filter((j) => j.payment_status === "paid");

  let computedTotalRevenue = 0;
  let computedTotalCost = 0;
  let computedTotalProfit = 0;
  let basePriceOnly = 0;
  const jobFinancials = [];

  for (const job of completed) {
    const jobRepairs = repairsByJob.get(String(job._id)) || [];
    const pricing = computeJobPricing(job, jobRepairs);
    const receipt = receiptByJob.get(String(job._id));
    computedTotalRevenue += pricing.total;
    computedTotalCost += pricing.costTotal;
    computedTotalProfit += pricing.profit;
    basePriceOnly += job.price || 0;
    jobFinancials.push({
      id: String(job._id),
      completedAt: job.completed_at || job.updatedAt,
      basePrice: job.price || 0,
      computedTotal: pricing.total,
      costTotal: pricing.costTotal,
      profit: pricing.profit,
      paymentStatus: job.payment_status,
      paymentMethod: job.payment_method || null,
      receiptAmount: receipt?.total_amount ?? null,
      repairLines: jobRepairs.length,
    });
  }

  const earningsAgg = techEarnings.reduce(
    (acc, e) => ({
      totalEarned: acc.totalEarned + (e.total_earned || 0),
      cashBalance: acc.cashBalance + (e.cash_balance || 0),
      completedJobs: acc.completedJobs + (e.performance?.total_completed_jobs || 0),
    }),
    { totalEarned: 0, cashBalance: 0, completedJobs: 0 }
  );

  const repairsAgg = repairs.reduce(
    (acc, r) => ({
      lineCount: acc.lineCount + 1,
      customerCharges: acc.customerCharges + (r.price || 0) * (r.quantity || 1),
      partsCost: acc.partsCost + (Number(r.cost) || 0) * (r.quantity || 1),
    }),
    { lineCount: 0, customerCharges: 0, partsCost: 0 }
  );

  const receiptsAgg = {
    count: receipts.length,
    jobReceipts: receipts.filter((r) => r.job_id).length,
    settlements: receipts.filter((r) => !r.job_id).length,
    totalAmount: receipts.reduce((s, r) => s + (r.total_amount || 0), 0),
    byStatus: groupSum(receipts, (r) => r.payment_status || "unknown", (r) => r.total_amount || 0),
  };

  const jobsByPaymentStatus = groupSum(jobs, (j) => j.payment_status || "unknown", (j) => j.price || 0);
  const jobsByStatus = groupSum(jobs, (j) => j.job_status || "unknown", (j) => j.price || 0);
  const jobsByPaymentMethod = groupSum(
    paid,
    (j) => j.payment_method || "unspecified",
    (j) => j.price || 0
  );

  const partnerAgg = {
    count: partners.length,
    totalInvestment: partners.reduce((s, p) => s + (p.investmentAmount || 0), 0),
    totalAccrued: partners.reduce((s, p) => s + (p.accruedTotal || 0), 0),
    totalPeriodCap: partners.reduce((s, p) => {
      const cap =
        p.currentPeriodCap != null && p.currentPeriodCap !== ""
          ? Number(p.currentPeriodCap)
          : Number(p.investmentAmount || 0) +
            Number(p.currentPeriod || 1) * Number(p.profitPerPeriod || 0);
      return s + cap;
    }, 0),
    partnerEarningsCount: partnerEarnings.length,
    partnerEarningsTotal: partnerEarnings.reduce((s, e) => s + (e.amount || 0), 0),
    withdrawalsCount: partnerWithdrawals.length,
    withdrawalsTotal: partnerWithdrawals.reduce((s, w) => s + (w.totalAmount || 0), 0),
    withdrawalsByStatus: groupSum(
      partnerWithdrawals,
      (w) => w.status || "unknown",
      (w) => w.totalAmount || 0
    ),
  };

  const businessJobs = completed.filter((j) => j.businessCutPercent > 0);
  let businessCutEstimated = 0;
  for (const job of businessJobs) {
    businessCutEstimated += ((job.price || 0) * (job.businessCutPercent || 0)) / 100;
  }

  const techBreakdown = techEarnings
    .map((e) => {
      const t = e.technician_id;
      const name = t ? `${t.firstName || ""} ${t.lastName || ""}`.trim() : "Unknown";
      return {
        name,
        totalEarned: e.total_earned || 0,
        cashBalance: e.cash_balance || 0,
        completedJobs: e.performance?.total_completed_jobs || 0,
      };
    })
    .sort((a, b) => b.totalEarned - a.totalEarned);

  const monthlyRevenue = {};
  for (const jf of jobFinancials) {
    const d = jf.completedAt ? new Date(jf.completedAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyRevenue[key]) monthlyRevenue[key] = { jobs: 0, basePrice: 0, computedTotal: 0, profit: 0, paid: 0 };
    monthlyRevenue[key].jobs += 1;
    monthlyRevenue[key].basePrice += jf.basePrice;
    monthlyRevenue[key].computedTotal += jf.computedTotal;
    monthlyRevenue[key].profit += jf.profit;
    if (jf.paymentStatus === "paid") monthlyRevenue[key].paid += 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    currency: "QAR",
    summary: {
      totalJobs: jobs.length,
      completedJobs: completed.length,
      paidJobs: paid.length,
      unpaidCompleted: completed.filter((j) => j.payment_status !== "paid").length,
      technicians: technicians.length,
      repairLineItems: repairsAgg.lineCount,
    },
    jobRevenue: {
      basePriceSumAllJobs: jobs.reduce((s, j) => s + (j.price || 0), 0),
      basePriceSumCompleted: basePriceOnly,
      computedTotalRevenueCompleted: computedTotalRevenue,
      computedTotalCostCompleted: computedTotalCost,
      computedTotalProfitCompleted: computedTotalProfit,
      avgComputedTotalPerCompletedJob:
        completed.length > 0 ? computedTotalRevenue / completed.length : 0,
      receiptTotalAll: receiptsAgg.totalAmount,
      earningsLedgerTotal: earningsAgg.totalEarned,
      revenueGapNote:
        "Technician earnings credit job.price at completion; receipts and computeJobPricing use full total (base + fees + repairs).",
    },
    payment: {
      byStatus: jobsByPaymentStatus,
      byStatusCount: groupSum(jobs, (j) => j.payment_status || "unknown", () => 1),
      paidByMethod: jobsByPaymentMethod,
      paidByMethodCount: groupSum(paid, (j) => j.payment_method || "unspecified", () => 1),
    },
    jobsByStatus,
    repairs: repairsAgg,
    receipts: receiptsAgg,
    technicians: {
      aggregate: earningsAgg,
      breakdown: techBreakdown,
    },
    partners: partnerAgg,
    businesses: {
      count: businesses.length,
      active: businesses.filter((b) => b.isActive).length,
      list: businesses.map((b) => ({
        name: b.name,
        cutType: b.cutType,
        cutPercent: b.cutPercent,
        isActive: b.isActive,
      })),
      estimatedCutOnCompletedJobs: businessCutEstimated,
      jobsWithBusinessCut: businessJobs.length,
    },
    monthlyCompleted: monthlyRevenue,
    topJobsByComputedTotal: jobFinancials
      .sort((a, b) => b.computedTotal - a.computedTotal)
      .slice(0, 10),
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  await mongoose.disconnect();
}

function printReport(r) {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  CLICKS PLATFORM — FINANCIAL REPORT");
  console.log(`  Generated: ${r.generatedAt}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("── OVERVIEW ──");
  console.log(`  Total jobs (all statuses):     ${r.summary.totalJobs}`);
  console.log(`  Completed jobs:                ${r.summary.completedJobs}`);
  console.log(`  Paid jobs:                     ${r.summary.paidJobs}`);
  console.log(`  Completed but unpaid:          ${r.summary.unpaidCompleted}`);
  console.log(`  Technicians:                   ${r.summary.technicians}`);
  console.log(`  Repair line items:             ${r.summary.repairLineItems}`);

  console.log("\n── REVENUE (COMPLETED JOBS) ──");
  console.log(`  Base price sum (job.price):    ${QAR(r.jobRevenue.basePriceSumCompleted)}`);
  console.log(`  Computed customer total:       ${QAR(r.jobRevenue.computedTotalRevenueCompleted)}`);
  console.log(`  Parts/labor cost total:        ${QAR(r.jobRevenue.computedTotalCostCompleted)}`);
  console.log(`  Computed profit:               ${QAR(r.jobRevenue.computedTotalProfitCompleted)}`);
  console.log(`  Avg per completed job:         ${QAR(r.jobRevenue.avgComputedTotalPerCompletedJob)}`);

  console.log("\n── PAYMENTS ──");
  for (const [status, amount] of Object.entries(r.payment.byStatus)) {
    const count = r.payment.byStatusCount[status] || 0;
    console.log(`  ${status}: ${count} jobs, base price sum ${QAR(amount)}`);
  }
  console.log("  Paid by method:");
  for (const [method, amount] of Object.entries(r.payment.paidByMethod)) {
    const count = r.payment.paidByMethodCount[method] || 0;
    console.log(`    ${method}: ${count} jobs, ${QAR(amount)}`);
  }

  console.log("\n── REPAIR PROCEDURES ──");
  console.log(`  Line items:                    ${r.repairs.lineCount}`);
  console.log(`  Customer charges (Σ price×qty): ${QAR(r.repairs.customerCharges)}`);
  console.log(`  Parts/labor cost (Σ cost×qty):  ${QAR(r.repairs.partsCost)}`);

  console.log("\n── RECEIPTS ──");
  console.log(`  Total receipts:                ${r.receipts.count}`);
  console.log(`  Job payment receipts:          ${r.receipts.jobReceipts}`);
  console.log(`  Cash settlements (no job):     ${r.receipts.settlements}`);
  console.log(`  Total receipt amounts:         ${QAR(r.receipts.totalAmount)}`);
  for (const [status, amount] of Object.entries(r.receipts.byStatus)) {
    console.log(`    ${status}: ${QAR(amount)}`);
  }

  console.log("\n── TECHNICIAN EARNINGS ──");
  console.log(`  Ledger total earned:           ${QAR(r.technicians.aggregate.totalEarned)}`);
  console.log(`  Outstanding cash balance:      ${QAR(r.technicians.aggregate.cashBalance)}`);
  console.log(`  Completed jobs (ledger):       ${r.technicians.aggregate.completedJobs}`);
  console.log("  Per technician:");
  for (const t of r.technicians.breakdown) {
    console.log(
      `    ${t.name}: earned ${QAR(t.totalEarned)}, cash ${QAR(t.cashBalance)}, ${t.completedJobs} jobs`
    );
  }

  console.log("\n── PARTNERS ──");
  console.log(`  Partners:                      ${r.partners.count}`);
  console.log(`  Total investment:              ${QAR(r.partners.totalInvestment)}`);
  console.log(`  Total accrued (lifetime):      ${QAR(r.partners.totalAccrued)}`);
  console.log(`  Current period caps (sum):     ${QAR(r.partners.totalPeriodCap)}`);
  console.log(`  Partner earning records:       ${r.partners.partnerEarningsCount}, ${QAR(r.partners.partnerEarningsTotal)}`);
  console.log(`  Withdrawal requests:           ${r.partners.withdrawalsCount}, ${QAR(r.partners.withdrawalsTotal)}`);

  console.log("\n── BUSINESS PARTNERS ──");
  console.log(`  Businesses:                    ${r.businesses.count} (${r.businesses.active} active)`);
  console.log(`  Jobs with business cut:        ${r.businesses.jobsWithBusinessCut}`);
  console.log(`  Estimated cut (on job.price):  ${QAR(r.businesses.estimatedCutOnCompletedJobs)}`);
  for (const b of r.businesses.list) {
    console.log(`    ${b.name}: ${b.cutPercent}% of ${b.cutType}${b.isActive ? "" : " (inactive)"}`);
  }

  console.log("\n── MONTHLY (COMPLETED JOBS) ──");
  const months = Object.keys(r.monthlyCompleted).sort();
  for (const m of months) {
    const row = r.monthlyCompleted[m];
    console.log(
      `  ${m}: ${row.jobs} jobs | computed ${QAR(row.computedTotal)} | profit ${QAR(row.profit)} | ${row.paid} paid`
    );
  }

  console.log("\n── TOP 10 JOBS BY COMPUTED TOTAL ──");
  for (const j of r.topJobsByComputedTotal) {
    console.log(
      `  ${j.id.slice(-8)}… total ${QAR(j.computedTotal)} (base ${QAR(j.basePrice)}, cost ${QAR(j.costTotal)}, profit ${QAR(j.profit)}) — ${j.paymentStatus}${j.paymentMethod ? ` / ${j.paymentMethod}` : ""}`
    );
  }

  console.log("\n── DATA NOTES ──");
  console.log(`  ${r.jobRevenue.revenueGapNote}`);
  console.log("  Pricing formula: total = base + (distance_km×2) + night fee (20) + repairs;");
  console.log("  profit = total − repair costs. Business cut % applies to job.price, not computed profit.");
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
