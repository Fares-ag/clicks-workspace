/**
 * Technician cash settlement — the finance portal's version of the per-technician
 * "job submission" spreadsheet: how much cash a technician must hand back for a
 * period, and how that compares with what the accountant actually collected.
 *
 * A settlement has two kinds of rows:
 * - job lines: what the customer paid for a job (excluding tip), how they paid,
 *   and the battery / garage share of that amount plus any tip on top;
 * - entries: money that moved outside a job (company transfers, Fawran
 *   handovers, battery restocks, petrol, work expenses).
 *
 * The maths matches the spreadsheet's Cash To Collect, with its defects fixed:
 * garage invoices on Fawran jobs are added (the sheet subtracted them), every
 * battery restock paid by Fawran is netted (the sheet only netted the first 8),
 * and tips are recorded on their own instead of hidden inside the GP figure.
 */

const SETTLEMENT_PAYMENT_METHODS = ["cash", "fawran", "card", "wallet"];

const SETTLEMENT_ENTRY_TYPES = [
  // Money the company sent the technician by Fawran (sheet: All Fawran From Salam).
  "fawran_from_company",
  // Collected cash the technician sent to the company by Fawran.
  "fawran_handover",
  // Van battery restock, paid with company Fawran money / with the technician's cash.
  "battery_restock_fawran",
  "battery_restock_cash",
  "petrol",
  // Expenses not tied to a job, paid with the technician's cash / company Fawran money.
  "work_expense_cash",
  "work_expense_fawran",
];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * @param {Array<{ payment_method?: string, amount?: number, battery_cost?: number, garage_cost?: number, tip?: number }>} jobs
 * @param {Array<{ type?: string, amount?: number }>} entries
 */
function computeSettlementTotals(jobs = [], entries = []) {
  const sums = {
    job_gp: 0,
    tips: 0,
    batteries_sold: 0,
    garage_cash_jobs: 0,
    garage_non_cash_jobs: 0,
    customer_fawran: 0,
    card_wallet_received: 0,
  };
  const byType = Object.fromEntries(SETTLEMENT_ENTRY_TYPES.map((type) => [type, 0]));

  const jobList = Array.isArray(jobs) ? jobs : [];
  for (const job of jobList) {
    const amount = Number(job?.amount) || 0;
    const battery = Number(job?.battery_cost) || 0;
    const garage = Number(job?.garage_cost) || 0;
    const tip = Number(job?.tip) || 0;
    const method = job?.payment_method || "cash";

    sums.job_gp += amount - battery - garage;
    sums.tips += tip;
    sums.batteries_sold += battery;
    if (method === "cash") {
      sums.garage_cash_jobs += garage;
    } else {
      sums.garage_non_cash_jobs += garage;
    }
    // A non-cash customer paid the company directly, tip included.
    if (method === "fawran") {
      sums.customer_fawran += amount + tip;
    } else if (method !== "cash") {
      sums.card_wallet_received += amount + tip;
    }
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (Object.prototype.hasOwnProperty.call(byType, entry?.type)) {
      byType[entry.type] += Number(entry?.amount) || 0;
    }
  }

  // Battery restocks paid by Fawran spend company money, not the technician's
  // cash, so they only cancel out the transfer that funded them.
  const fawranFromCompanyNet =
    byType.fawran_from_company - byType.battery_restock_fawran;

  const owedTotal =
    sums.job_gp +
    sums.tips +
    sums.batteries_sold +
    sums.garage_cash_jobs +
    sums.garage_non_cash_jobs +
    fawranFromCompanyNet;

  const fawranReceived = sums.customer_fawran + byType.fawran_handover;
  const creditsTotal =
    fawranReceived +
    sums.card_wallet_received +
    byType.battery_restock_cash +
    byType.petrol +
    byType.work_expense_cash +
    byType.work_expense_fawran +
    sums.tips;

  const cashToCollect = owedTotal - creditsTotal;
  const batteryGap =
    sums.batteries_sold - (byType.battery_restock_cash + byType.battery_restock_fawran);

  return {
    job_count: jobList.length,
    job_gp: roundMoney(sums.job_gp),
    tips_received: roundMoney(sums.tips),
    batteries_sold: roundMoney(sums.batteries_sold),
    garage_cash_jobs: roundMoney(sums.garage_cash_jobs),
    garage_non_cash_jobs: roundMoney(sums.garage_non_cash_jobs),
    fawran_from_company: roundMoney(byType.fawran_from_company),
    fawran_from_company_net: roundMoney(fawranFromCompanyNet),
    owed_total: roundMoney(owedTotal),
    customer_fawran: roundMoney(sums.customer_fawran),
    fawran_handover: roundMoney(byType.fawran_handover),
    fawran_received: roundMoney(fawranReceived),
    card_wallet_received: roundMoney(sums.card_wallet_received),
    battery_restock_cash: roundMoney(byType.battery_restock_cash),
    battery_restock_fawran: roundMoney(byType.battery_restock_fawran),
    petrol: roundMoney(byType.petrol),
    work_expense_cash: roundMoney(byType.work_expense_cash),
    work_expense_fawran: roundMoney(byType.work_expense_fawran),
    tips_kept: roundMoney(sums.tips),
    credits_total: roundMoney(creditsTotal),
    cash_to_collect: roundMoney(cashToCollect),
    battery_gap: roundMoney(batteryGap),
    // Informational only: the accountant collects cash_to_collect.
    net_after_battery_gap: roundMoney(cashToCollect - batteryGap),
  };
}

/** Collected minus cash to collect; negative means the technician came up short. */
function settlementGap(cashToCollect, collected) {
  if (collected === null || collected === undefined) return null;
  return roundMoney(Number(collected) - (Number(cashToCollect) || 0));
}

module.exports = {
  SETTLEMENT_PAYMENT_METHODS,
  SETTLEMENT_ENTRY_TYPES,
  computeSettlementTotals,
  settlementGap,
  roundMoney,
};
