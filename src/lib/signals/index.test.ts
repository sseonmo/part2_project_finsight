import { describe, expect, it } from "vitest";

import { detectSignals } from "./index";
import type {
  CategoryAmountMedian,
  CategoryMonthlyTotal,
  SignalTransaction,
} from "./types";

function total(
  period: string,
  category: CategoryMonthlyTotal["category"],
  totalAmount: number,
): CategoryMonthlyTotal {
  return { period, category, totalAmount, transactionCount: 1 };
}

function transaction(
  overrides: Partial<SignalTransaction> = {},
): SignalTransaction {
  const transactedOn = overrides.transactedOn ?? "2026-03-04";

  return {
    id: overrides.id ?? "tx-1",
    period: `${transactedOn.slice(0, 7)}-01`,
    transactedOn,
    amount: overrides.amount ?? 50_000,
    category: overrides.category ?? "식비",
    merchantNormalized: overrides.merchantNormalized ?? "MERCHANT",
    categoryFallback: overrides.categoryFallback ?? false,
  };
}

function median(
  category: CategoryAmountMedian["category"],
  medianAmount: number,
): CategoryAmountMedian {
  return { period: "2026-03-01", category, medianAmount };
}

describe("detectSignals", () => {
  it("sorts impact signals by KRW impact and leaves null-impact recurring payments last", () => {
    const signals = detectSignals({
      currentPeriod: "2026-03-01",
      previousPeriod: "2026-02-01",
      categoryMonthlyTotals: [
        total("2026-02-01", "식비", 100_000),
        total("2026-03-01", "식비", 200_000),
      ],
      transactions: [
        transaction({
          id: "outlier",
          amount: 70_000,
          merchantNormalized: "BIG RESTAURANT",
        }),
        transaction({ id: "other-1", amount: 26_000, merchantNormalized: "O1" }),
        transaction({ id: "other-2", amount: 26_000, merchantNormalized: "O2" }),
        transaction({ id: "other-3", amount: 26_000, merchantNormalized: "O3" }),
        transaction({ id: "other-4", amount: 26_000, merchantNormalized: "O4" }),
        transaction({ id: "other-5", amount: 26_000, merchantNormalized: "O5" }),
        transaction({
          id: "new",
          amount: 120_000,
          category: "쇼핑",
          merchantNormalized: "NEW SHOP",
        }),
        transaction({
          id: "shop-1",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "S1",
        }),
        transaction({
          id: "shop-2",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "S2",
        }),
        transaction({
          id: "shop-3",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "S3",
        }),
        transaction({
          id: "shop-4",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "S4",
        }),
        transaction({
          id: "shop-5",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "S5",
        }),
      ],
      categoryMedians: [median("쇼핑", 30_000)],
      seenMerchants: [
        "BIG RESTAURANT",
        "O1",
        "O2",
        "O3",
        "O4",
        "O5",
        "S1",
        "S2",
        "S3",
        "S4",
        "S5",
      ],
      merchantHistory: [
        transaction({
          id: "sub-a",
          transactedOn: "2026-01-01",
          amount: 9_900,
          category: "문화/여가",
          merchantNormalized: "STREAMING",
        }),
        transaction({
          id: "sub-b",
          transactedOn: "2026-02-01",
          amount: 9_900,
          category: "문화/여가",
          merchantNormalized: "STREAMING",
        }),
        transaction({
          id: "sub-c",
          transactedOn: "2026-03-01",
          amount: 9_900,
          category: "문화/여가",
          merchantNormalized: "STREAMING",
        }),
      ],
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      "new_merchant_large",
      "category_spike",
      "outlier_transaction",
      "recurring_payment",
    ]);
    expect(signals).toHaveLength(4);
    expect(signals.at(-1)?.impact).toBeNull();
  });

  it("does not cut signals down to the top 3", () => {
    const signals = detectSignals({
      currentPeriod: "2026-03-01",
      previousPeriod: "2026-02-01",
      categoryMonthlyTotals: [
        total("2026-02-01", "식비", 100_000),
        total("2026-03-01", "식비", 180_000),
      ],
      transactions: [
        transaction({ id: "a", amount: 60_000 }),
        transaction({ id: "b", amount: 60_000, merchantNormalized: "B" }),
        transaction({
          id: "c",
          amount: 80_000,
          category: "쇼핑",
          merchantNormalized: "C",
        }),
        transaction({
          id: "d",
          amount: 90_000,
          category: "교통",
          merchantNormalized: "D",
        }),
      ],
      categoryMedians: [median("쇼핑", 20_000), median("교통", 20_000)],
      seenMerchants: ["MERCHANT", "B"],
      merchantHistory: [],
    });

    expect(signals.filter((signal) => signal.impact !== null).length).toBe(5);
  });

  it("runs only outlier detection when there is no previous month", () => {
    const signals = detectSignals({
      currentPeriod: "2026-03-01",
      categoryMonthlyTotals: [total("2026-03-01", "식비", 100_000)],
      transactions: [
        transaction({ id: "target", amount: 50_000 }),
        transaction({ id: "other", amount: 50_000, merchantNormalized: "OTHER" }),
      ],
      categoryMedians: [median("식비", 10_000)],
      seenMerchants: [],
      merchantHistory: [
        transaction({ id: "sub-a", transactedOn: "2026-01-01" }),
        transaction({ id: "sub-b", transactedOn: "2026-02-01" }),
        transaction({ id: "sub-c", transactedOn: "2026-03-01" }),
      ],
    });

    expect(signals.map((signal) => signal.type)).toEqual([
      "outlier_transaction",
      "outlier_transaction",
    ]);
  });
});
