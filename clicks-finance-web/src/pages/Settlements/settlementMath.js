// Live copy of clicks-api/clicks-shared/utils/technicianSettlement.js so the
// summary updates while the accountant types. The server recomputes on every
// save; keep the two in step.

export const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "fawran", label: "Fawran" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
];

export const ENTRY_TYPE_OPTIONS = [
  {
    value: "fawran_from_company",
    label: "Fawran sent by company",
    hint: "Money the company sent the technician",
  },
  {
    value: "fawran_handover",
    label: "Fawran sent to company",
    hint: "Collected cash the technician transferred in",
  },
  { value: "battery_restock_fawran", label: "Battery restock — Fawran" },
  { value: "battery_restock_cash", label: "Battery restock — cash" },
  { value: "petrol", label: "Petrol" },
  { value: "work_expense_cash", label: "Work expense — cash" },
  { value: "work_expense_fawran", label: "Work expense — Fawran" },
];

const ENTRY_TYPES = ENTRY_TYPE_OPTIONS.map((option) => option.value);

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function computeSettlementTotals(jobs = [], entries = []) {
  const sums = {
    job_gp: 0,
    tips: 0,
    batteries_sold: 0,
    garage_cash_jobs: 0,
    garage_non_cash_jobs: 0,
    customer_fawran: 0,
    card_wallet_received: 0,
  };
  const byType = Object.fromEntries(ENTRY_TYPES.map((type) => [type, 0]));

  for (const job of jobs) {
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
    if (method === "fawran") {
      sums.customer_fawran += amount + tip;
    } else if (method !== "cash") {
      sums.card_wallet_received += amount + tip;
    }
  }

  for (const entry of entries) {
    if (Object.prototype.hasOwnProperty.call(byType, entry?.type)) {
      byType[entry.type] += Number(entry?.amount) || 0;
    }
  }

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
    job_count: jobs.length,
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
    net_after_battery_gap: roundMoney(cashToCollect - batteryGap),
  };
}

export function settlementGap(cashToCollect, collected) {
  if (collected === null || collected === undefined || collected === "") return null;
  const value = Number(collected);
  if (!Number.isFinite(value)) return null;
  return roundMoney(value - (Number(cashToCollect) || 0));
}

export function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "2026-09-30" → "30 Sep 2026", read as a calendar day (no timezone shift). */
export function formatDay(day) {
  if (!day) return "—";
  const at = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return day;
  return at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatPeriod(from, to) {
  if (!from && !to) return "—";
  if (from === to) return formatDay(from);
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function settlementTitle(settlement) {
  const name = settlement?.technician?.name || "Technician";
  return `${name} · #${settlement?.number ?? "—"}`;
}
