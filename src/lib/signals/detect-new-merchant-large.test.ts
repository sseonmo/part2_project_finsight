import { describe, expect, it } from "vitest";

import { detectNewMerchantLarge } from "./detect-new-merchant-large";
import type { CategoryAmountMedian, SignalTransaction } from "./types";

function transaction(overrides: Partial<SignalTransaction>): SignalTransaction {
  return {
    id: "tx-1",
    period: "2026-03-01",
    transactedOn: "2026-03-04",
    amount: 50_000,
    category: "카페/간식",
    merchantNormalized: "NEW CAFE",
    categoryFallback: false,
    ...overrides,
  };
}

function median(medianAmount: number): CategoryAmountMedian {
  return {
    period: "2026-03-01",
    category: "카페/간식",
    medianAmount,
  };
}

describe("detectNewMerchantLarge", () => {
  it("uses inclusive 3x category median and 50,000원 amount thresholds", () => {
    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 58_000 })],
        medians: [median(20_000)],
        seenMerchants: [],
      }),
    ).toEqual([]);

    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 60_000 })],
        medians: [median(20_000)],
        seenMerchants: [],
      }),
    ).toHaveLength(1);

    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 62_000 })],
        medians: [median(20_000)],
        seenMerchants: [],
      }),
    ).toHaveLength(1);
  });

  it("requires the absolute amount threshold and excludes already seen merchants", () => {
    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 49_999 })],
        medians: [median(10_000)],
        seenMerchants: [],
      }),
    ).toEqual([]);

    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 50_000 })],
        medians: [median(10_000)],
        seenMerchants: [],
      }),
    ).toHaveLength(1);

    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 80_000 })],
        medians: [median(10_000)],
        seenMerchants: ["NEW CAFE"],
      }),
    ).toEqual([]);
  });

  it("does not flag the PRD low-amount false positive case", () => {
    expect(
      detectNewMerchantLarge({
        period: "2026-03-01",
        transactions: [transaction({ amount: 7_000 })],
        medians: [median(2_000)],
        seenMerchants: [],
      }),
    ).toEqual([]);
  });

  it("ignores fallback and zero-amount transactions", () => {
    const baseline = detectNewMerchantLarge({
      period: "2026-03-01",
      transactions: [transaction({ id: "tx-valid", amount: 60_000 })],
      medians: [median(20_000)],
      seenMerchants: [],
    });

    const withIgnoredRows = detectNewMerchantLarge({
      period: "2026-03-01",
      transactions: [
        transaction({ id: "tx-zero", amount: 0 }),
        transaction({
          id: "tx-fallback",
          amount: 200_000,
          merchantNormalized: "FALLBACK SHOP",
          categoryFallback: true,
        }),
        transaction({ id: "tx-valid", amount: 60_000 }),
      ],
      medians: [median(20_000)],
      seenMerchants: [],
    });

    expect(withIgnoredRows).toEqual(baseline);
  });
});
