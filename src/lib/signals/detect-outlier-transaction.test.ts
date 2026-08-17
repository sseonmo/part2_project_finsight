import { describe, expect, it } from "vitest";

import { detectOutlierTransaction } from "./detect-outlier-transaction";
import type { SignalTransaction } from "./types";

function transaction(overrides: Partial<SignalTransaction>): SignalTransaction {
  return {
    id: "tx-1",
    period: "2026-03-01",
    transactedOn: "2026-03-04",
    amount: 50_000,
    category: "식비",
    merchantNormalized: "RESTAURANT",
    categoryFallback: false,
    ...overrides,
  };
}

function fillers(totalAmount: number, count: number): SignalTransaction[] {
  const baseAmount = Math.floor(totalAmount / count);
  const remainder = totalAmount - baseAmount * count;

  return Array.from({ length: count }, (_, index) =>
    transaction({
      id: `other-${index}`,
      amount: baseAmount + (index === 0 ? remainder : 0),
      merchantNormalized: `OTHER-${index}`,
    }),
  );
}

describe("detectOutlierTransaction", () => {
  it("uses inclusive 30% share, 50,000원 amount, and 100,000원 monthly thresholds", () => {
    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 58_000 }),
          ...fillers(142_000, 6),
        ],
      }),
    ).toEqual([]);

    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 60_000 }),
          ...fillers(140_000, 6),
        ],
      }),
    ).toHaveLength(1);

    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 62_000 }),
          ...fillers(138_000, 6),
        ],
      }),
    ).toHaveLength(1);
  });

  it("requires the absolute amount threshold", () => {
    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 49_999 }),
          ...fillers(100_000, 5),
        ],
      }),
    ).toEqual([]);

    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 50_000 }),
          ...fillers(100_000, 5),
        ],
      }),
    ).toHaveLength(1);
  });

  it("requires the category monthly spend threshold", () => {
    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 50_000 }),
          ...fillers(49_999, 5),
        ],
      }),
    ).toEqual([]);

    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [
          transaction({ id: "target", amount: 50_000 }),
          ...fillers(50_000, 5),
        ],
      }),
    ).toHaveLength(1);
  });

  it("does not flag the PRD low-category-total false positive case", () => {
    expect(
      detectOutlierTransaction({
        period: "2026-03-01",
        transactions: [transaction({ id: "target", amount: 10_000 })],
      }),
    ).toEqual([]);
  });

  it("ignores fallback and zero-amount transactions in category share", () => {
    const baseline = detectOutlierTransaction({
      period: "2026-03-01",
      transactions: [
        transaction({ id: "target", amount: 50_000 }),
        ...fillers(50_000, 5),
      ],
    });

    const withIgnoredRows = detectOutlierTransaction({
      period: "2026-03-01",
      transactions: [
        transaction({ id: "zero", amount: 0 }),
        transaction({
          id: "fallback",
          amount: 300_000,
          categoryFallback: true,
        }),
        transaction({ id: "target", amount: 50_000 }),
        ...fillers(50_000, 5),
      ],
    });

    expect(withIgnoredRows).toEqual(baseline);
  });
});
