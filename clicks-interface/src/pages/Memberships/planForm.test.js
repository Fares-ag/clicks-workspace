import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formToPayload,
  includedSummary,
  planToForm,
  priceSummary,
  serviceOptions,
  validatePlanForm,
} from "./planForm.js";

const PLUS = {
  code: "plus",
  name_en: "Plus",
  name_ar: "بلس",
  discountPercent: 15,
  eligibleServiceTypes: ["Oil Change"],
  coversEmergency: false,
  active: true,
  sortOrder: 2,
  intervals: [
    {
      interval: "month",
      durationMonths: 1,
      priceQar: 39,
      included: [{ serviceTypes: ["Car Wash - Full"], quota: 1, bucket: "wash" }],
    },
    { interval: "year", durationMonths: 12, priceQar: 299, included: [] },
  ],
};

describe("membership package form", () => {
  it("round-trips an existing plan unchanged", () => {
    const payload = formToPayload(planToForm(PLUS));
    assert.deepEqual(payload, {
      code: "plus",
      name_en: "Plus",
      name_ar: "بلس",
      discountPercent: 15,
      eligibleServiceTypes: ["Oil Change"],
      coversEmergency: false,
      active: true,
      sortOrder: 2,
      intervals: PLUS.intervals,
    });
    assert.deepEqual(validatePlanForm(planToForm(PLUS)), []);
  });

  it("a new plan starts monthly-only with the default discounted services", () => {
    const form = planToForm(null, { defaultDiscountServiceTypes: ["Oil Change", "Tyre Change"] });
    assert.equal(form.intervals.month.enabled, true);
    assert.equal(form.intervals.year.enabled, false);
    assert.deepEqual(form.eligibleServiceTypes, ["Oil Change", "Tyre Change"]);
    assert.equal(form.active, true);
  });

  it("a disabled billing option is left out of the payload", () => {
    const form = planToForm(PLUS);
    form.intervals.year.enabled = false;
    assert.deepEqual(formToPayload(form).intervals.map((r) => r.interval), ["month"]);
  });

  it("flags the same problems the API refuses", () => {
    const form = planToForm(PLUS);
    form.code = "Gold Plan";
    form.discountPercent = "150";
    form.intervals.month.priceQar = "0";
    form.intervals.month.included.push({ id: "x", serviceTypes: [], quota: "1.5", bucket: "wash" });
    const errors = validatePlanForm(form).join("\n");
    assert.match(errors, /Code must be/);
    assert.match(errors, /between 0 and 100/);
    assert.match(errors, /more than 0 QAR/);
    assert.match(errors, /at least one service/);
    assert.match(errors, /whole number, 1-1000/);
    assert.match(errors, /share the counter "wash"/);
  });

  it("an active plan needs a billing option; an inactive one may have none", () => {
    const form = planToForm(PLUS);
    form.intervals.month.enabled = false;
    form.intervals.year.enabled = false;
    assert.match(validatePlanForm(form).join(), /at least one billing option/);
    form.active = false;
    assert.deepEqual(validatePlanForm(form), []);
  });

  it("offers catalog services plus any already on the plan", () => {
    const form = planToForm({ ...PLUS, eligibleServiceTypes: ["Legacy Service"] });
    const options = serviceOptions({ serviceTypes: ["Oil Change"] }, form);
    assert.deepEqual(options.sort(), ["Car Wash - Full", "Legacy Service", "Oil Change"]);
  });

  it("summarises included services compactly", () => {
    assert.equal(
      includedSummary({
        included: [
          { serviceTypes: ["Oil Change"], quota: 2, bucket: "oil" },
          { serviceTypes: ["Car Wash - Full", "Car Wash - Interior"], quota: 4, bucket: "wash" },
        ],
      }),
      "2× Oil Change, 4× wash (any of 2)"
    );
    assert.equal(includedSummary({ included: [] }), "Discount only");
  });

  it("summarises prices for the list", () => {
    assert.equal(priceSummary(PLUS), "Monthly QAR 39.00 · Yearly QAR 299.00");
    assert.equal(priceSummary({ intervals: [] }), "No billing option");
  });
});
