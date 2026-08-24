const { computeFinancePreview } = require("./financeJobPreview");

describe("computeFinancePreview", () => {
  test("net profit equals revenue minus repair, extra, and purchase costs", () => {
    const job = { discount: 0, extraFees: 0 };
    const repairs = [
      { price: 100, quantity: 1, cost: 20 },
      { price: 50, quantity: 2, cost: 10 },
    ];
    const extraCosts = [{ label: "Tow", amount: 15 }];
    const purchases = [{ total_cost: 30, quantity: 2, unit_cost: 15 }];
    const result = computeFinancePreview(job, repairs, extraCosts, purchases);
    expect(result.revenue).toBe(200);
    expect(result.costTotal).toBe(85);
    expect(result.purchaseTotal).toBe(30);
    expect(result.netProfit).toBe(115);
  });

  test("net profit equals revenue minus repair and extra costs", () => {
    const job = { discount: 0, extraFees: 0 };
    const repairs = [
      { price: 100, quantity: 1, cost: 20 },
      { price: 50, quantity: 2, cost: 10 },
    ];
    const extraCosts = [{ label: "Tow", amount: 15 }];
    const result = computeFinancePreview(job, repairs, extraCosts);
    expect(result.revenue).toBe(200);
    expect(result.costTotal).toBe(55);
    expect(result.netProfit).toBe(145);
  });
});
