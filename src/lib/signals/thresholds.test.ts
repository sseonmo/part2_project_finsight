import { describe, expect, it } from "vitest";

import {
  SIGNAL_CONDITION_COPY,
  SIGNAL_THRESHOLDS,
  SIGNAL_TYPES,
} from "./thresholds";

describe("signal thresholds", () => {
  it("keeps every signal condition copy next to the threshold values", () => {
    expect(Object.keys(SIGNAL_CONDITION_COPY).sort()).toEqual(
      [...SIGNAL_TYPES].sort(),
    );

    expect(SIGNAL_CONDITION_COPY.category_spike).toContain("50%");
    expect(SIGNAL_CONDITION_COPY.category_spike).toContain("30,000원");
    expect(SIGNAL_CONDITION_COPY.new_merchant_large).toContain("3배");
    expect(SIGNAL_CONDITION_COPY.new_merchant_large).toContain("50,000원");
    expect(SIGNAL_CONDITION_COPY.outlier_transaction).toContain("30%");
    expect(SIGNAL_CONDITION_COPY.outlier_transaction).toContain("100,000원");
    expect(SIGNAL_CONDITION_COPY.recurring_payment).toContain("25~35일");
    expect(SIGNAL_CONDITION_COPY.recurring_payment).toContain("3회");
    expect(SIGNAL_CONDITION_COPY.recurring_price_up).toContain("10%");
    expect(SIGNAL_CONDITION_COPY.recurring_price_up).toContain("12개월");
  });

  it("exports the PRD threshold values as the single source of truth", () => {
    expect(SIGNAL_THRESHOLDS).toEqual({
      categorySpike: { minIncreaseRatio: 0.5, minIncreaseKrw: 30_000 },
      newMerchantLarge: { medianMultiple: 3, minAmountKrw: 50_000 },
      outlierTransaction: {
        minShareOfCategory: 0.3,
        minAmountKrw: 50_000,
        minCategoryMonthlyKrw: 100_000,
      },
      recurring: {
        amountTolerance: 0.1,
        minIntervalDays: 25,
        maxIntervalDays: 35,
        minOccurrences: 3,
      },
      recurringPriceUp: { minIncreaseRatio: 0.1, impactMonths: 12 },
    });
  });
});
