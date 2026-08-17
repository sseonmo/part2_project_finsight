import { describe, expect, it } from "vitest";

import { detectCategorySpike } from "./detect-category-spike";
import type { CategoryMonthlyTotal } from "./types";

function monthlyTotal(
  period: string,
  totalAmount: number,
): CategoryMonthlyTotal {
  return {
    period,
    category: "식비",
    totalAmount,
    transactionCount: 1,
  };
}

describe("detectCategorySpike", () => {
  const previousPeriod = "2026-02-01";
  const currentPeriod = "2026-03-01";

  it("uses inclusive +50% ratio and 30,000원 increase thresholds", () => {
    const previous = monthlyTotal(previousPeriod, 100_000);

    expect(
      detectCategorySpike({
        previousPeriod,
        currentPeriod,
        totals: [previous, monthlyTotal(currentPeriod, 149_000)],
      }),
    ).toEqual([]);

    expect(
      detectCategorySpike({
        previousPeriod,
        currentPeriod,
        totals: [previous, monthlyTotal(currentPeriod, 150_000)],
      }),
    ).toHaveLength(1);

    expect(
      detectCategorySpike({
        previousPeriod,
        currentPeriod,
        totals: [previous, monthlyTotal(currentPeriod, 151_000)],
      }),
    ).toHaveLength(1);
  });

  it("requires the absolute increase threshold as an AND condition", () => {
    expect(
      detectCategorySpike({
        previousPeriod,
        currentPeriod,
        totals: [
          monthlyTotal(previousPeriod, 10_000),
          monthlyTotal(currentPeriod, 39_999),
        ],
      }),
    ).toEqual([]);

    const [signalAtThreshold] = detectCategorySpike({
      previousPeriod,
      currentPeriod,
      totals: [
        monthlyTotal(previousPeriod, 10_000),
        monthlyTotal(currentPeriod, 40_000),
      ],
    });

    expect(signalAtThreshold?.impact).toBe(30_000);

    const [signalAboveThreshold] = detectCategorySpike({
      previousPeriod,
      currentPeriod,
      totals: [
        monthlyTotal(previousPeriod, 10_000),
        monthlyTotal(currentPeriod, 40_001),
      ],
    });

    expect(signalAboveThreshold?.impact).toBe(30_001);
  });

  it("excludes categories whose previous month total is zero", () => {
    expect(
      detectCategorySpike({
        previousPeriod,
        currentPeriod,
        totals: [
          monthlyTotal(previousPeriod, 0),
          monthlyTotal(currentPeriod, 100_000),
        ],
      }),
    ).toEqual([]);
  });
});
